import type { Ref } from 'vue'
import type { TestPageViewMode } from '../../../playground-shared/testPageState'
import type { AnnotationSnapshot } from './useTestPageAnnotations'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import {
  buildTestPageHref,
  buildTestPageHrefAsync,
  withTestPageViewMode,
} from '../../../playground-shared/testPageState'

interface LocalSharePayload {
  content: string
  annotations?: AnnotationSnapshot
}

interface UseTestPageShareOptions {
  input: Ref<string>
  testPageViewMode: Ref<TestPageViewMode>
  isStreaming: Readonly<Ref<boolean>>
  annotationHasItems: Readonly<Ref<boolean>>
  getAnnotationSnapshot: () => AnnotationSnapshot
  normalizeAnnotationSnapshot: (
    snapshot: AnnotationSnapshot | null | undefined,
  ) => AnnotationSnapshot | null
}

const MAX_URL_LEN = 10000
const LOCAL_SHARE_QUERY_KEY = 'share'
const LOCAL_SHARE_STORAGE_PREFIX = 'vmr-test-share:'

function shareStorageKey(shareId: string) {
  return `${LOCAL_SHARE_STORAGE_PREFIX}${shareId}`
}

function currentShareId() {
  const url = new URL(window.location.href)
  return url.searchParams.get(LOCAL_SHARE_QUERY_KEY)
}

export function currentTestPageShareStorageKey() {
  if (typeof window === 'undefined')
    return null

  const shareId = currentShareId()
  return shareId ? shareStorageKey(shareId) : null
}

export function useTestPageShare(options: UseTestPageShareOptions) {
  const {
    input,
    testPageViewMode,
    isStreaming,
    annotationHasItems,
    getAnnotationSnapshot,
    normalizeAnnotationSnapshot,
  } = options

  const shareUrl = ref('')
  const notice = ref('')
  const noticeType = ref<'success' | 'error' | 'info'>('success')
  const isWorking = ref(false)
  const copiedShareTarget = ref<TestPageViewMode | null>(null)
  const issueUrl = ref('')
  const labShareUsesLocalStorage = ref(false)
  const previewShareUsesLocalStorage = ref(false)
  const isSharePreviewMode = computed(() => testPageViewMode.value === 'preview')
  const previewShareButtonLabel = computed(() => {
    if (isSharePreviewMode.value)
      return '复制当前分享链接'
    return previewShareUsesLocalStorage.value ? '复制本地预览链接' : '分享预览'
  })
  const labShareButtonLabel = computed(() => labShareUsesLocalStorage.value ? '复制本地实验页链接' : '复制实验页链接')
  let shareModeHintRequestId = 0

  function basePageUrl() {
    const url = new URL(window.location.href)
    url.hash = ''
    url.searchParams.delete(LOCAL_SHARE_QUERY_KEY)
    return url.toString()
  }

  function currentBasePageUrl(viewMode = testPageViewMode.value) {
    return withTestPageViewMode(basePageUrl(), viewMode)
  }

  function buildLocalShareHref(shareId: string, viewMode: TestPageViewMode = 'lab') {
    const url = new URL(withTestPageViewMode(basePageUrl(), viewMode))
    url.searchParams.set(LOCAL_SHARE_QUERY_KEY, shareId)
    url.hash = ''
    return url.toString()
  }

  function parseLocalSharePayload(raw: string): LocalSharePayload {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && typeof parsed.content === 'string') {
        const payload = parsed as LocalSharePayload
        return {
          content: payload.content,
          annotations: normalizeAnnotationSnapshot(payload.annotations) ?? undefined,
        }
      }
    }
    catch {
    }

    return { content: raw }
  }

  function persistLocalShare(markdown: string, annotations?: AnnotationSnapshot | null) {
    const shareId = currentShareId() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    const payload = JSON.stringify({
      content: markdown,
      annotations: normalizeAnnotationSnapshot(annotations) ?? undefined,
    } satisfies LocalSharePayload)
    window.localStorage.setItem(shareStorageKey(shareId), payload)
    return shareId
  }

  function buildIssueUrl(text: string) {
    const base = 'https://github.com/Simon-He95/markstream-vue/issues/new?template=bug_report.yml'
    const body = `**Reproduction input**:\n\nPlease find the reproduction input below:\n\n\`\`\`markdown\n${text}\n\`\`\``
    return `${base}&body=${encodeURIComponent(body)}`
  }

  async function resolveShareUsesLocalStorage(markdown: string, viewMode: TestPageViewMode) {
    if (buildTestPageHref('/test', markdown, viewMode).length <= MAX_URL_LEN)
      return false

    return (await buildTestPageHrefAsync('/test', markdown, viewMode)).length > MAX_URL_LEN
  }

  async function refreshShareModeHints() {
    const requestId = ++shareModeHintRequestId
    const markdown = input.value
    const [labUsesStorage, previewUsesStorage] = await Promise.all([
      resolveShareUsesLocalStorage(markdown, 'lab'),
      resolveShareUsesLocalStorage(markdown, 'preview'),
    ])

    if (requestId !== shareModeHintRequestId || markdown !== input.value)
      return

    labShareUsesLocalStorage.value = labUsesStorage
    previewShareUsesLocalStorage.value = previewUsesStorage
  }

  const refreshShareModeHintsDebounced = useDebounceFn(() => {
    void refreshShareModeHints()
  }, 240)

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 2200) {
    notice.value = message
    noticeType.value = type
    if (duration > 0)
      window.setTimeout(() => (notice.value = ''), duration)
  }

  async function generateShareLink(viewMode: TestPageViewMode = 'lab', generateOptions: { silent?: boolean } = {}) {
    const full = await buildTestPageHrefAsync(basePageUrl(), input.value, viewMode)
    issueUrl.value = buildIssueUrl(input.value)
    if (full.length > MAX_URL_LEN) {
      const localHref = buildLocalShareHref(
        persistLocalShare(input.value, annotationHasItems.value ? getAnnotationSnapshot() : null),
        viewMode,
      )
      shareUrl.value = localHref
      if (viewMode === 'lab')
        labShareUsesLocalStorage.value = true
      else
        previewShareUsesLocalStorage.value = true
      if (!generateOptions.silent)
        showToast('当前内容太长，已切换为本地分享链接；只能在你当前浏览器打开，分享给别人不会生效。', 'info', 4200)
      return localHref
    }

    shareUrl.value = full
    if (viewMode === 'lab')
      labShareUsesLocalStorage.value = false
    else
      previewShareUsesLocalStorage.value = false
    return full
  }

  async function copyShareLink(target: string) {
    try {
      await navigator.clipboard.writeText(target)
      return true
    }
    catch (error) {
      console.warn('copy failed', error)
      return false
    }
  }

  async function generateAndCopy() {
    isWorking.value = true
    copiedShareTarget.value = null
    const target = await generateShareLink('lab')

    if (!target) {
      isWorking.value = false
      return
    }

    window.history.replaceState(undefined, '', target)
    const copied = await copyShareLink(target)
    isWorking.value = false

    if (copied) {
      copiedShareTarget.value = 'lab'
      showToast(labShareUsesLocalStorage.value ? '本地实验页链接已复制；仅当前浏览器可打开，分享给别人不会生效。' : '分享链接已复制。', labShareUsesLocalStorage.value ? 'info' : 'success', labShareUsesLocalStorage.value ? 3200 : 1800)
      window.setTimeout(() => (copiedShareTarget.value = null), 1800)
    }
    else {
      showToast('复制失败，请手动复制地址栏链接。', 'error', 3000)
    }
  }

  async function generateAndCopyPreview() {
    isWorking.value = true
    copiedShareTarget.value = null
    const target = await generateShareLink('preview')

    if (!target) {
      isWorking.value = false
      return
    }

    if (isSharePreviewMode.value)
      window.history.replaceState(undefined, '', target)

    const copied = await copyShareLink(target)
    isWorking.value = false

    if (copied) {
      copiedShareTarget.value = 'preview'
      showToast(previewShareUsesLocalStorage.value ? '本地预览链接已复制；只能在你当前浏览器查看，分享给别人不会生效。' : '预览分享链接已复制。', previewShareUsesLocalStorage.value ? 'info' : 'success', previewShareUsesLocalStorage.value ? 3200 : 1800)
      window.setTimeout(() => (copiedShareTarget.value = null), 1800)
    }
    else {
      showToast('复制失败，请手动复制分享链接。', 'error', 3000)
    }
  }

  async function copyRawInput() {
    const target = buildIssueUrl(input.value)
    issueUrl.value = target

    try {
      await navigator.clipboard.writeText(target)
      showToast('Issue 链接已复制。', 'success', 2200)
    }
    catch (error) {
      console.warn('copy failed', error)
      showToast('复制失败，请手动打开 Issue。', 'error', 3000)
    }
  }

  function openIssueInNewTab() {
    if (!issueUrl.value)
      issueUrl.value = buildIssueUrl(input.value)

    try {
      window.open(issueUrl.value, '_blank')
    }
    catch {
      window.location.href = issueUrl.value
    }
  }

  function restoreFromLocalShare() {
    const shareId = currentShareId()
    if (!shareId)
      return null

    const shared = window.localStorage.getItem(shareStorageKey(shareId))
    if (shared == null)
      return null

    const payload = parseLocalSharePayload(shared)
    input.value = payload.content
    return payload
  }

  function initializeShare() {
    shareUrl.value = currentBasePageUrl()
    void refreshShareModeHints()
  }

  watch(input, () => {
    copiedShareTarget.value = null
    if (!isStreaming.value && typeof window !== 'undefined')
      shareUrl.value = currentBasePageUrl()
    refreshShareModeHintsDebounced()
  })

  return {
    copiedShareTarget,
    copyRawInput,
    generateAndCopy,
    generateAndCopyPreview,
    generateShareLink,
    initializeShare,
    isSharePreviewMode,
    isWorking,
    labShareButtonLabel,
    labShareUsesLocalStorage,
    notice,
    noticeType,
    openIssueInNewTab,
    previewShareButtonLabel,
    previewShareUsesLocalStorage,
    restoreFromLocalShare,
    shareUrl,
    showToast,
  }
}
