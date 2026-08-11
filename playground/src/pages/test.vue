<script setup lang="ts">
import type { TestLabFrameworkId, TestLabSampleId } from '../../../playground-shared/testLabFixtures'
import type { TestPageViewMode } from '../../../playground-shared/testPageState'
import type { SandboxFrameworkId, SandboxRenderSource } from '../../../playground-shared/versionSandbox'
import type { StreamSliceMode } from '../composables/createLocalTextStream'
import type { StreamPresetId } from '../composables/streamPresets'
import type { StreamTransportMode } from '../composables/useStreamSimulator'
import type { AnnotationSnapshot } from '../composables/useTestPageAnnotations'
import { Icon } from '@iconify/vue'
import { useDebounceFn, useLocalStorage } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveMarkdownTextareaPaste } from '../../../playground-shared/markdownPaste'
import { TEST_LAB_FRAMEWORKS, TEST_LAB_SAMPLES } from '../../../playground-shared/testLabFixtures'
import { decodeMarkdownHashAsync, resolveFrameworkTestHref, resolveTestPageViewMode } from '../../../playground-shared/testPageState'
import {
  buildTestSandboxHref,
  normalizeSandboxSource,
  resolveSandboxSelection,

} from '../../../playground-shared/versionSandbox'
import CodeBlockNode from '../../../src/components/CodeBlockNode'
import { getUseMonaco } from '../../../src/components/CodeBlockNode/monaco'
import MarkdownCodeBlockNode from '../../../src/components/MarkdownCodeBlockNode'
import { disableKatex, enableKatex, isKatexEnabled } from '../../../src/components/MathInlineNode/katex'
import { disableMermaid, enableMermaid, isMermaidEnabled } from '../../../src/components/MermaidBlockNode/mermaid'
import MarkdownRender from '../../../src/components/NodeRenderer'
import PreCodeNode from '../../../src/components/PreCodeNode'
import { setCustomComponents } from '../../../src/utils/nodeComponents'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import LabSelect from '../components/LabSelect.vue'
import ThinkingNode from '../components/ThinkingNode.vue'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from '../composables/streamPresets'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from '../composables/useStreamSimulator'
import { useTestPageAnnotations } from '../composables/useTestPageAnnotations'
import { currentTestPageShareStorageKey, useTestPageShare } from '../composables/useTestPageShare'
import { testSandboxFrameworks } from '../testSandboxConfig'
import 'katex/dist/katex.min.css'

type SampleId = TestLabSampleId
type FrameworkId = TestLabFrameworkId

const CURRENT_FRAMEWORK: FrameworkId = 'vue3'
const GITHUB_REPO_URL = 'https://github.com/Simon-He95/markstream-vue'
const STREAM_TRANSPORT_OPTIONS = [
  { value: 'readable-stream', label: 'ReadableStream' },
  { value: 'scheduler', label: 'Scheduler' },
] as const satisfies ReadonlyArray<{ value: StreamTransportMode, label: string }>
const STREAM_SLICE_OPTIONS = [
  { value: 'pure-random', label: 'Pure Random' },
  { value: 'boundary-aware', label: 'Boundary Aware' },
] as const satisfies ReadonlyArray<{ value: StreamSliceMode, label: string }>
const RENDER_MODE_OPTIONS = [
  { value: 'monaco', label: 'Monaco' },
  { value: 'markdown', label: 'MarkdownCodeBlock' },
  { value: 'pre', label: 'PreCodeNode' },
] as const satisfies ReadonlyArray<{ value: 'monaco' | 'markdown' | 'pre', label: string }>

const frameworkCards = TEST_LAB_FRAMEWORKS
const sampleCards = TEST_LAB_SAMPLES
const sandboxFrameworkOptions = testSandboxFrameworks.map(framework => ({
  value: framework.id,
  label: framework.label,
})) as ReadonlyArray<{ value: SandboxFrameworkId, label: string }>

const diffHideUnchangedRegions = {
  enabled: true,
  contextLineCount: 2,
  minimumLineCount: 4,
  revealLineCount: 5,
} as const

function resolveInitialDarkMode() {
  return typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : false
}

const testPageMonacoOptions = {
  renderSideBySide: false,
  useInlineViewWhenSpaceIsLimited: true,
  maxComputationTime: 0,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  diffAlgorithm: 'legacy',
  diffHideUnchangedRegions,
  hideUnchangedRegions: diffHideUnchangedRegions,
} as const

const selectedSampleId = useLocalStorage<SampleId>('vmr-test-sample', 'baseline')
const input = ref<string>(sampleCards[0].content)
const streamChunkSizeMin = useLocalStorage<number>('vmr-test-stream-chunk-size-min', 2)
const streamChunkSizeMax = useLocalStorage<number>('vmr-test-stream-chunk-size-max', 7)
const streamChunkDelayMin = useLocalStorage<number>('vmr-test-stream-delay-min', 14)
const streamChunkDelayMax = useLocalStorage<number>('vmr-test-stream-delay-max', 34)
const streamBurstiness = useLocalStorage<number>('vmr-test-stream-burstiness', 35)
const streamTransportMode = useLocalStorage<StreamTransportMode>('vmr-test-stream-transport-mode', 'readable-stream')
const streamSliceMode = useLocalStorage<StreamSliceMode>('vmr-test-stream-slice-mode', 'pure-random')
const streamDebug = useLocalStorage<boolean>('vmr-test-stream-debug', false)
const isDark = useLocalStorage<boolean>('vmr-test-dark', resolveInitialDarkMode())

const renderMode = useLocalStorage<'monaco' | 'pre' | 'markdown'>('vmr-test-render-mode', 'monaco')
const codeBlockStream = useLocalStorage<boolean>('vmr-test-code-stream', true)
const viewportPriority = useLocalStorage<boolean>('vmr-test-viewport-priority', true)
const batchRendering = useLocalStorage<boolean>('vmr-test-batch-rendering', true)
const typewriter = useLocalStorage<boolean>('vmr-test-typewriter', true)
const debugParse = useLocalStorage<boolean>('vmr-test-debug-parse', false)
const mathEnabled = useLocalStorage<boolean>('vmr-test-math-enabled', isKatexEnabled())
const mermaidEnabled = useLocalStorage<boolean>('vmr-test-mermaid-enabled', isMermaidEnabled())
const testPageCustomHtmlTags = ['think', 'thinking'] as const

getUseMonaco()
setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())

const editorTextareaRef = ref<HTMLTextAreaElement | null>(null)
const previewCardRef = ref<HTMLElement | null>(null)
const streamSettingsDialogRef = ref<HTMLDialogElement | null>(null)
const isPreviewFullscreen = ref(false)
const testPageViewMode = ref<TestPageViewMode>('lab')
const activeSample = computed(() => sampleCards.find(sample => sample.id === selectedSampleId.value) ?? sampleCards[0])
const streamPresetOptions = computed(() => [
  ...STREAM_PRESETS.map(preset => ({
    value: preset.id,
    label: preset.label,
  })),
  {
    value: CUSTOM_STREAM_PRESET_ID,
    label: 'Custom',
  },
])
const normalizedChunkSizeRange = computed(() => normalizeStreamRange(
  Number(streamChunkSizeMin.value),
  Number(streamChunkSizeMax.value),
  1,
  80,
  2,
  7,
))
const normalizedChunkDelayRange = computed(() => normalizeStreamRange(
  Number(streamChunkDelayMin.value),
  Number(streamChunkDelayMax.value),
  8,
  600,
  14,
  34,
))
const {
  content: streamContent,
  chunks: streamChunks,
  isPaused,
  isStreaming,
  lastChunkSize,
  lastDelayMs,
  reset: resetStreamState,
  start: startStreaming,
  stop: stopStreaming,
  togglePause: toggleStreamingPause,
} = useStreamSimulator({
  source: input,
  chunkSizeMin: computed(() => normalizedChunkSizeRange.value.min),
  chunkSizeMax: computed(() => normalizedChunkSizeRange.value.max),
  chunkDelayMin: computed(() => normalizedChunkDelayRange.value.min),
  chunkDelayMax: computed(() => normalizedChunkDelayRange.value.max),
  burstiness: computed(() => streamBurstiness.value / 100),
  sliceMode: streamSliceMode,
  transportMode: streamTransportMode,
})
const previewContent = computed(() => (isStreaming.value ? streamContent.value : input.value))
const streamProgress = computed(() => {
  if (!input.value.length)
    return 0
  return Math.min(100, Math.round((previewContent.value.length / input.value.length) * 100))
})
const activeStreamPreset = computed(() => findMatchingStreamPreset({
  chunkDelayMin: normalizedChunkDelayRange.value.min,
  chunkDelayMax: normalizedChunkDelayRange.value.max,
  chunkSizeMin: normalizedChunkSizeRange.value.min,
  chunkSizeMax: normalizedChunkSizeRange.value.max,
  burstiness: streamBurstiness.value,
}))
const selectedStreamPresetId = computed<StreamPresetId>({
  get: () => activeStreamPreset.value?.id ?? CUSTOM_STREAM_PRESET_ID,
  set: (presetId) => {
    if (presetId === CUSTOM_STREAM_PRESET_ID)
      return

    const preset = getStreamPreset(presetId)
    if (!preset)
      return

    streamChunkDelayMin.value = preset.chunkDelayMin
    streamChunkDelayMax.value = preset.chunkDelayMax
    streamChunkSizeMin.value = preset.chunkSizeMin
    streamChunkSizeMax.value = preset.chunkSizeMax
    streamBurstiness.value = preset.burstiness
  },
})
const streamPresetDescription = computed(() => activeStreamPreset.value?.descriptionZh ?? '当前参数已偏离预设，属于自定义 min/max 流式画像。')
const streamPresetLabel = computed(() => activeStreamPreset.value?.label ?? 'Custom')
const streamChunkRangeLabel = computed(() => `${normalizedChunkSizeRange.value.min}-${normalizedChunkSizeRange.value.max} 字`)
const streamDelayRangeLabel = computed(() => `${normalizedChunkDelayRange.value.min}-${normalizedChunkDelayRange.value.max}ms`)
const streamModeLabel = computed(() => streamTransportMode.value === 'readable-stream' ? 'ReadableStream' : 'Scheduler')
const renderModeLabel = computed(() => {
  if (renderMode.value === 'markdown')
    return 'MarkdownCodeBlock'
  if (renderMode.value === 'pre')
    return 'PreCodeNode'
  return 'Monaco'
})
const previewDiagramMaxHeight = computed(() => isPreviewFullscreen.value ? 'none' : '500px')
const previewD2MaxHeight = computed(() => 'none')
const charCount = computed(() => input.value.length)
const lineCount = computed(() => (input.value ? input.value.split('\n').length : 0))
const isSharePreviewMode = computed(() => testPageViewMode.value === 'preview')
const showImmersivePreviewControls = computed(() => isSharePreviewMode.value || isPreviewFullscreen.value)
const immersiveBackLabel = computed(() => isSharePreviewMode.value ? '打开 Test Page' : '返回编辑')
const showPreviewAnnotations = computed(() => isSharePreviewMode.value || isPreviewFullscreen.value)
const {
  ANNOTATION_ALIGN_OPTIONS,
  ANNOTATION_COLORS,
  ANNOTATION_RESIZE_HANDLES,
  ANNOTATION_SHORTCUT_HINT,
  ANNOTATION_STROKES,
  ANNOTATION_TOOL_OPTIONS,
  annotationArrowHandleStyle,
  annotationArrowSelectionLine,
  annotationArrowSelectionStyle,
  annotationCanAlign,
  annotationCanRedo,
  annotationCanUndo,
  annotationColor,
  annotationDrawInteractive,
  annotationDrawSelectable,
  annotationDrawSvgRef,
  annotationEnabled,
  annotationHasItems,
  annotationOverlayVisible,
  annotationResizeHandleStyle,
  annotationSelectionActionsStyle,
  annotationSelectionActionsVisible,
  annotationSelectionBox,
  annotationSelectionCanResize,
  annotationSelectionFrameStyle,
  annotationSelectionTransform,
  annotationSelectionVisible,
  annotationSingleArrowSelection,
  annotationStageHeight,
  annotationStageWidth,
  annotationStrokeWidth,
  annotationTextDraft,
  annotationTextEditorStyle,
  annotationTextInputRef,
  annotationTextInteractive,
  annotationTextItems,
  annotationTextLayerInteractive,
  annotationTextLines,
  annotationTextOutline,
  annotationTool,
  alignSelectedAnnotations,
  bringSelectedAnnotationToFront,
  cancelTextAnnotationDraft,
  clearAnnotations,
  commitTextAnnotationDraft,
  deleteSelectedAnnotation,
  duplicateSelectedAnnotation,
  editSelectedTextAnnotation,
  editTextAnnotation,
  getAnnotationSnapshot,
  initializeAnnotations,
  normalizeAnnotationSnapshot,
  previewStageRef,
  redoAnnotation,
  restoreAnnotationCache,
  startDrawSelection,
  startSelectedAnnotationMove,
  startSelectedAnnotationResize,
  startSelectedArrowHandle,
  startTextAnnotation,
  startTextSelection,
  suppressNextTextAnnotationPlacement,
  toggleAnnotationMode,
  undoAnnotation,
} = useTestPageAnnotations({
  input,
  isDark,
  showPreviewAnnotations,
  getActiveShareStorageKey: currentTestPageShareStorageKey,
})

const {
  copiedShareTarget,
  copyRawInput,
  generateAndCopy,
  generateAndCopyPreview,
  generateShareLink,
  initializeShare,
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
} = useTestPageShare({
  input,
  testPageViewMode,
  isStreaming,
  annotationHasItems,
  getAnnotationSnapshot,
  normalizeAnnotationSnapshot,
})

const showAnnotationToolbar = computed(() => showImmersivePreviewControls.value && annotationEnabled.value)
const previewMermaidProps = computed(() => ({ maxHeight: previewDiagramMaxHeight.value }))
const previewD2Props = computed(() => ({ maxHeight: previewD2MaxHeight.value }))
const previewInfographicProps = computed(() => ({ maxHeight: previewDiagramMaxHeight.value }))
const previewParseOptions = computed(() => {
  if (showPreviewAnnotations.value || !debugParse.value)
    return undefined

  return { debug: true }
})

const sandboxFrameworkId = useLocalStorage<SandboxFrameworkId>('vmr-test-sandbox-framework', 'vue3')
const sandboxSource = useLocalStorage<SandboxRenderSource>('vmr-test-sandbox-source', 'workspace')
const sandboxVersion = useLocalStorage<string>('vmr-test-sandbox-version', testSandboxFrameworks[0].defaultVersion)
const sandboxAutoSync = useLocalStorage<boolean>('vmr-test-sandbox-auto-sync', false)
const sandboxSnapshot = ref<string>(sampleCards[0].content)
const sandboxFrameKey = ref(0)

const activeSandbox = computed(() => resolveSandboxSelection(testSandboxFrameworks, {
  frameworkId: sandboxFrameworkId.value,
  source: sandboxSource.value,
  version: sandboxVersion.value,
}))
const activeSandboxFramework = computed(() => activeSandbox.value.framework)
const sandboxHref = computed(() => buildTestSandboxHref(activeSandbox.value, sandboxSnapshot.value))
const sandboxDirty = computed(() => sandboxSnapshot.value !== input.value)
const sandboxQuickVersions = computed(() => Array.from(new Set([
  activeSandboxFramework.value.defaultVersion,
  'latest',
])))
const sandboxVersionPlaceholder = computed(() => `例如 ${activeSandboxFramework.value.defaultVersion} 或 latest`)
const sandboxPackageLabel = computed(() => {
  if (activeSandbox.value.source === 'workspace')
    return `${activeSandboxFramework.value.packageName} (workspace)`
  return `${activeSandboxFramework.value.packageName}@${activeSandbox.value.version}`
})
const sandboxRuntimeLabel = computed(() => {
  if (activeSandbox.value.source === 'workspace')
    return `${activeSandboxFramework.value.label} local runtime`
  return `${activeSandboxFramework.value.label} runtime ${activeSandboxFramework.value.runtimeVersion}`
})
const sandboxStatusLabel = computed(() => {
  if (sandboxDirty.value)
    return '待同步'
  return '已同步'
})

function syncSandbox() {
  sandboxSnapshot.value = input.value
  sandboxFrameKey.value += 1
}

const syncSandboxDebounced = useDebounceFn(() => {
  syncSandbox()
}, 420)

function chooseSandboxSource(source: SandboxRenderSource) {
  sandboxSource.value = normalizeSandboxSource(activeSandboxFramework.value, source)
}

function chooseSandboxVersion(version: string) {
  sandboxVersion.value = version
}

function openSandboxInNewTab() {
  try {
    window.open(sandboxHref.value, '_blank', 'noopener')
  }
  catch {
    window.location.href = sandboxHref.value
  }
}

function focusEditorSoon() {
  void nextTick(() => {
    editorTextareaRef.value?.focus()
  })
}
function syncPreviewFullscreenState() {
  isPreviewFullscreen.value = document.fullscreenElement === previewCardRef.value
}

async function togglePreviewFullscreen() {
  const previewCard = previewCardRef.value
  if (!previewCard)
    return

  if (document.fullscreenElement === previewCard) {
    if (!document.exitFullscreen)
      return

    await document.exitFullscreen()
    return
  }

  if (!previewCard.requestFullscreen)
    return

  await previewCard.requestFullscreen()
}
function handleEditorPaste(event: ClipboardEvent) {
  const textarea = event.currentTarget
  if (!(textarea instanceof HTMLTextAreaElement))
    return

  const pasted = event.clipboardData?.getData('text/plain')
  if (!pasted)
    return

  const next = resolveMarkdownTextareaPaste(textarea, pasted)
  if (!next)
    return

  event.preventDefault()
  textarea.value = next.nextValue
  textarea.selectionStart = next.selectionStart
  textarea.selectionEnd = next.selectionEnd
  input.value = next.nextValue
}

function exportPreviewAsPdf() {
  if (annotationTextDraft.value?.content.trim())
    commitTextAnnotationDraft()
  else
    annotationTextDraft.value = null

  showToast('已打开浏览器打印导出，请在系统对话框里选择“保存为 PDF”。', 'info', 2800)
  window.print()
}

async function restoreFromUrl() {
  const decoded = await decodeMarkdownHashAsync(window.location.hash || '')
  if (!decoded)
    return false

  input.value = decoded
  return true
}

function restoreViewModeFromUrl() {
  testPageViewMode.value = resolveTestPageViewMode(window.location.search)
}

async function exitSharedPreview() {
  testPageViewMode.value = 'lab'
  const full = await generateShareLink('lab', { silent: true })
  shareUrl.value = full
  window.history.replaceState(undefined, '', full)
}

async function returnToEditableTestPage() {
  if (isSharePreviewMode.value) {
    await exitSharedPreview()
    focusEditorSoon()
    return
  }

  const previewCard = previewCardRef.value
  if (document.fullscreenElement === previewCard && document.exitFullscreen) {
    await document.exitFullscreen()
    focusEditorSoon()
  }
}

function applySample(sampleId: SampleId) {
  const sample = sampleCards.find(item => item.id === sampleId)
  if (!sample)
    return

  stopStreamRender()
  selectedSampleId.value = sample.id
  input.value = sample.content
  showToast(`已切换到“${sample.title}”样例。`, 'info', 1200)
}

function startStreamRender() {
  if (isStreaming.value) {
    stopStreamRender()
    return
  }

  startStreaming()
}

function stopStreamRender() {
  stopStreaming()
}

function resetEditor() {
  applySample(selectedSampleId.value)
}

function clearEditor() {
  resetStreamState()
  input.value = ''
}

function toggleAppearance() {
  isDark.value = !isDark.value
}

function openStreamSettingsDialog() {
  if (!streamSettingsDialogRef.value || streamSettingsDialogRef.value.open)
    return
  streamSettingsDialogRef.value.showModal?.()
}

function closeStreamSettingsDialog() {
  if (!streamSettingsDialogRef.value?.open)
    return
  streamSettingsDialogRef.value.close()
}

function frameworkHref(id: FrameworkId) {
  const framework = frameworkCards.find(item => item.id === id)
  if (!framework)
    return '/test'
  return resolveFrameworkTestHref(
    framework,
    CURRENT_FRAMEWORK,
    input.value,
    typeof window !== 'undefined'
      ? { hostname: window.location.hostname, protocol: window.location.protocol }
      : undefined,
    testPageViewMode.value,
  )
}

async function initializeTestPage() {
  restoreViewModeFromUrl()
  const localShare = restoreFromLocalShare()
  const restored = Boolean(localShare) || await restoreFromUrl()
  if (!restored) {
    const sample = sampleCards.find(item => item.id === selectedSampleId.value) ?? sampleCards[0]
    input.value = sample.content
  }

  const initialAnnotationSnapshot: AnnotationSnapshot | null
    = localShare?.annotations ?? restoreAnnotationCache()
  sandboxSnapshot.value = input.value
  syncPreviewFullscreenState()
  initializeAnnotations(initialAnnotationSnapshot)
  initializeShare()
  document.addEventListener('fullscreenchange', syncPreviewFullscreenState)
}

onMounted(() => {
  void initializeTestPage()
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncPreviewFullscreenState)
})

watch(normalizedChunkSizeRange, (range) => {
  if (streamChunkSizeMin.value !== range.min)
    streamChunkSizeMin.value = range.min
  if (streamChunkSizeMax.value !== range.max)
    streamChunkSizeMax.value = range.max
}, { immediate: true })

watch(normalizedChunkDelayRange, (range) => {
  if (streamChunkDelayMin.value !== range.min)
    streamChunkDelayMin.value = range.min
  if (streamChunkDelayMax.value !== range.max)
    streamChunkDelayMax.value = range.max
}, { immediate: true })

watch(streamBurstiness, (value) => {
  const next = Math.round(clampStreamControl(value, 0, 100, 35))
  if (next !== value)
    streamBurstiness.value = next
}, { immediate: true })

watch(input, () => {
  if (sandboxAutoSync.value)
    syncSandboxDebounced()
})

watch(sandboxAutoSync, (enabled) => {
  if (enabled)
    syncSandbox()
})

watch(() => sandboxFrameworkId.value, () => {
  const framework = testSandboxFrameworks.find(item => item.id === sandboxFrameworkId.value) ?? testSandboxFrameworks[0]
  sandboxSource.value = normalizeSandboxSource(framework, sandboxSource.value)
  sandboxVersion.value = framework.defaultVersion
  syncSandboxDebounced()
})

watch(() => sandboxSource.value, (source) => {
  const normalized = normalizeSandboxSource(activeSandboxFramework.value, source)
  if (normalized !== source) {
    sandboxSource.value = normalized
    return
  }
  syncSandboxDebounced()
})

watch(() => sandboxVersion.value, () => {
  syncSandboxDebounced()
})

watch(isDark, (value) => {
  if (typeof document !== 'undefined')
    document.documentElement.classList.toggle('dark', value)
}, { immediate: true })

watch(() => renderMode.value, (mode) => {
  if (mode === 'pre')
    setCustomComponents({ code_block: PreCodeNode, think: ThinkingNode, thinking: ThinkingNode })
  else if (mode === 'markdown')
    setCustomComponents({ code_block: MarkdownCodeBlockNode, think: ThinkingNode, thinking: ThinkingNode })
  else
    setCustomComponents({ code_block: CodeBlockNode, think: ThinkingNode, thinking: ThinkingNode })
}, { immediate: true })

watch(mathEnabled, (enabled) => {
  if (enabled)
    enableKatex()
  else
    disableKatex()
}, { immediate: true })

watch(mermaidEnabled, (enabled) => {
  if (enabled)
    enableMermaid()
  else
    disableMermaid()
}, { immediate: true })
</script>

<template>
  <div class="test-lab" :class="{ 'test-lab--dark': isDark, 'dark': isDark, 'test-lab--share-preview': isSharePreviewMode }">
    <div v-if="!isSharePreviewMode" class="test-lab__glow test-lab__glow--1" />
    <div v-if="!isSharePreviewMode" class="test-lab__glow test-lab__glow--2" />
    <div v-if="!isSharePreviewMode" class="test-lab__glow test-lab__glow--3" />

    <div class="test-lab__shell" :class="{ 'test-lab__shell--share-preview': isSharePreviewMode }">
      <section v-if="!isSharePreviewMode" class="hero-panel">
        <div class="hero-panel__copy">
          <span class="eyebrow">
            <span class="eyebrow__dot" />
            Cross-framework Rendering Studio
          </span>
          <h1>Markstream <span class="hero-panel__accent">Diagnostic</span> Studio</h1>
          <p>
            直接粘贴 markdown，立即查看真实渲染；排障时用同一份输入并排比对
            Vue 3、Vue 2、React 与 Angular 的差异表现。
          </p>
        </div>

        <div class="hero-panel__actions">
          <div class="hero-panel__action-row">
            <button type="button" class="action-button action-button--primary" :disabled="isWorking" @click="generateAndCopy">
              {{ copiedShareTarget === 'lab' ? (labShareUsesLocalStorage ? '已复制本地实验页链接' : '已复制实验页链接') : (isWorking ? '生成中...' : labShareButtonLabel) }}
            </button>
            <button type="button" class="action-button" @click="copyRawInput">
              复制 Issue 链接
            </button>
            <button type="button" class="action-button" @click="openIssueInNewTab">
              打开 Issue
            </button>
          </div>

          <div class="hero-panel__status-row">
            <span class="mini-pill">{{ renderModeLabel }}</span>
            <span class="mini-pill" :class="{ 'mini-pill--active': isStreaming }">
              {{ isStreaming ? 'Streaming' : 'Ready' }}
            </span>
          </div>

          <div v-if="labShareUsesLocalStorage || previewShareUsesLocalStorage" class="info-banner info-banner--warning">
            当前内容太长，分享链接已切换为本地存储模式；只能在你当前浏览器自己打开，发给别人看不到，跨浏览器复现请使用 Issue 链接。
          </div>
          <div v-if="notice" class="info-banner" :class="`info-banner--${noticeType}`">
            {{ notice }}
          </div>
        </div>

        <div class="hero-panel__metrics">
          <div class="metric-card">
            <span>当前框架</span>
            <strong>Vue 3</strong>
          </div>
          <div class="metric-card">
            <span>字符数</span>
            <strong>{{ charCount }}</strong>
          </div>
          <div class="metric-card">
            <span>行数</span>
            <strong>{{ lineCount }}</strong>
          </div>
          <div class="metric-card">
            <span>预览进度</span>
            <strong>{{ streamProgress }}%</strong>
          </div>
        </div>

        <div class="framework-switcher">
          <a
            v-for="framework in frameworkCards"
            :key="framework.id"
            class="framework-chip"
            :class="{ 'framework-chip--current': framework.id === CURRENT_FRAMEWORK }"
            :href="frameworkHref(framework.id)"
          >
            <span class="framework-chip__label">{{ framework.label }}</span>
            <span class="framework-chip__note">{{ framework.note }}</span>
          </a>
        </div>
      </section>

      <div class="lab-layout" :class="{ 'lab-layout--share-preview': isSharePreviewMode }">
        <aside v-if="!isSharePreviewMode" class="lab-sidebar">
          <section class="panel-card panel-card--samples">
            <div class="panel-card__head">
              <div>
                <h2>样例</h2>
                <p>快速切换不同的回归场景。</p>
              </div>
              <span class="mini-pill">{{ activeSample.title }}</span>
            </div>

            <div class="sample-list">
              <button
                v-for="sample in sampleCards"
                :key="sample.id"
                type="button"
                class="sample-card"
                :class="{ 'sample-card--active': sample.id === selectedSampleId }"
                @click="applySample(sample.id)"
              >
                <strong>{{ sample.title }}</strong>
                <span>{{ sample.summary }}</span>
              </button>
            </div>
          </section>

          <section class="panel-card panel-card--stream">
            <div class="panel-card__head">
              <div>
                <h2>流式控制</h2>
                <p>先用这里的紧凑摘要和常用操作控制流式预览，细节参数放进更多设置里。</p>
              </div>
              <button type="button" class="ghost-button" @click="openStreamSettingsDialog">
                更多设置
              </button>
            </div>

            <div class="stream-summary">
              <div class="stream-summary__row">
                <span class="mini-pill mini-pill--active">{{ streamPresetLabel }}</span>
                <span class="mini-pill">{{ streamModeLabel }}</span>
                <span class="mini-pill">{{ streamSliceMode === 'boundary-aware' ? 'Boundary Aware' : 'Pure Random' }}</span>
                <span class="mini-pill">{{ renderModeLabel }}</span>
              </div>

              <div class="stream-summary__row stream-summary__row--dense">
                <span class="stream-summary__item">Chunk {{ streamChunkRangeLabel }}</span>
                <span class="stream-summary__item">Delay {{ streamDelayRangeLabel }}</span>
                <span class="stream-summary__item">Burst {{ streamBurstiness }}%</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': codeBlockStream }">代码块流式</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': viewportPriority }">viewportPriority</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': batchRendering }">batchRendering</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': typewriter }">typewriter</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': mathEnabled }">KaTeX</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': mermaidEnabled }">Mermaid</span>
                <span v-if="debugParse" class="stream-summary__item stream-summary__item--active">解析树 debug</span>
                <span v-if="streamDebug" class="stream-summary__item stream-summary__item--active">chunk debug</span>
              </div>
            </div>

            <div class="control-actions control-actions--stream-bar">
              <button type="button" class="action-button action-button--primary" @click="startStreamRender">
                {{ isStreaming ? '停止流式渲染' : '开始流式渲染' }}
              </button>
              <button type="button" class="action-button" :disabled="!isStreaming" @click="toggleStreamingPause">
                {{ isPaused ? '继续流式渲染' : '暂停流式渲染' }}
              </button>
              <button type="button" class="action-button" @click="resetEditor">
                重置样例
              </button>
              <button type="button" class="action-button" @click="clearEditor">
                清空输入
              </button>
              <button type="button" class="action-button" @click="openStreamSettingsDialog">
                调整参数
              </button>
            </div>

            <div class="progress-block">
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: `${streamProgress}%` }" />
              </div>
              <div class="progress-meta">
                <span>{{ previewContent.length }} / {{ input.length || 0 }}</span>
                <span>{{ isStreaming ? `${streamModeLabel} · 最近一次 ${lastChunkSize} 字 / ${lastDelayMs}ms` : 'Static preview' }}</span>
              </div>
            </div>
          </section>

          <section class="panel-card panel-card--sandbox">
            <div class="panel-card__head">
              <div>
                <h2>版本沙箱</h2>
                <p>左侧收紧成配置面板，右侧保留更大的 iframe 对照区域。</p>
              </div>
              <span class="mini-pill">{{ sandboxStatusLabel }}</span>
            </div>

            <div class="sandbox-summary">
              <span class="mini-pill mini-pill--active">{{ activeSandboxFramework.label }}</span>
              <span class="mini-pill">{{ activeSandbox.source === 'workspace' ? 'workspace' : 'npm' }}</span>
              <span class="mini-pill">{{ activeSandbox.source === 'workspace' ? 'local' : activeSandbox.version }}</span>
            </div>

            <div class="control-stack control-stack--sandbox">
              <LabSelect
                v-model="sandboxFrameworkId"
                label="目标框架"
                :options="sandboxFrameworkOptions"
              />
              <label class="text-control">
                <span>包版本</span>
                <input
                  v-model="sandboxVersion"
                  type="text"
                  :placeholder="sandboxVersionPlaceholder"
                >
              </label>

              <div class="segmented-control">
                <button
                  type="button"
                  class="segmented-control__button"
                  :class="{ 'segmented-control__button--active': activeSandbox.source === 'workspace' }"
                  :disabled="!activeSandboxFramework.supportsWorkspace"
                  @click="chooseSandboxSource('workspace')"
                >
                  workspace
                </button>
                <button
                  type="button"
                  class="segmented-control__button"
                  :class="{ 'segmented-control__button--active': activeSandbox.source === 'npm' }"
                  @click="chooseSandboxSource('npm')"
                >
                  npm
                </button>
              </div>

              <div class="preset-list">
                <button
                  v-for="version in sandboxQuickVersions"
                  :key="version"
                  type="button"
                  class="preset-chip"
                  :class="{ 'preset-chip--active': sandboxVersion === version }"
                  @click="chooseSandboxVersion(version)"
                >
                  {{ version }}
                </button>
              </div>

              <label class="toggle-item">
                <span>输入变化自动同步到 iframe</span>
                <input v-model="sandboxAutoSync" type="checkbox">
              </label>
            </div>

            <div class="control-actions control-actions--stacked">
              <button type="button" class="action-button action-button--primary" @click="syncSandbox">
                刷新沙箱
              </button>
              <button type="button" class="action-button" @click="openSandboxInNewTab">
                独立打开
              </button>
            </div>

            <div class="meta-list">
              <div class="meta-list__row">
                <span>渲染目标</span>
                <strong>{{ sandboxPackageLabel }}</strong>
              </div>
              <div class="meta-list__row">
                <span>运行时</span>
                <strong>{{ sandboxRuntimeLabel }}</strong>
              </div>
            </div>

            <div v-if="!activeSandboxFramework.supportsWorkspace" class="info-banner info-banner--info">
              {{ activeSandboxFramework.label }} 在这个沙箱里先走 npm 包模式；本地 workspace 对照仍可用上方 framework 切页。
            </div>
            <div v-if="sandboxDirty" class="info-banner info-banner--warning">
              右侧 iframe 还没同步最新输入，点“刷新沙箱”即可用当前 markdown 重载。
            </div>
          </section>
        </aside>

        <section class="workspace-grid" :class="{ 'workspace-grid--share-preview': isSharePreviewMode }">
          <article v-if="!isSharePreviewMode" class="workspace-card workspace-card--pane workspace-card--editor">
            <header class="workspace-card__head">
              <div>
                <h2>Markdown 输入</h2>
                <p>把 markdown 粘进来，右侧立即看到真实渲染结果。</p>
              </div>
              <span class="mini-pill">Live editor</span>
            </header>

            <div class="editor-shell">
              <div class="editor-shell__toolbar">
                <div class="editor-shell__title-group">
                  <span class="editor-shell__traffic" />
                  <span class="editor-shell__traffic" />
                  <span class="editor-shell__traffic" />
                  <strong class="editor-shell__filename">repro.md</strong>
                </div>
                <div class="editor-shell__meta">
                  <span class="editor-shell__meta-item">{{ lineCount }} lines</span>
                  <span class="editor-shell__meta-item">{{ charCount }} chars</span>
                </div>
              </div>

              <textarea
                v-model="input"
                class="editor-textarea"
                spellcheck="false"
                placeholder="在这里粘贴你的复现 markdown..."
                @paste="handleEditorPaste"
              />
            </div>

            <footer class="workspace-card__foot">
              <span>可直接粘贴 issue 复现内容</span>
              <span>{{ lineCount }} lines · {{ charCount }} chars</span>
            </footer>
          </article>

          <article
            ref="previewCardRef"
            class="workspace-card workspace-card--pane workspace-card--preview"
            :class="{ 'workspace-card--share-preview': isSharePreviewMode, 'workspace-card--preview-dark': isDark, 'dark': isDark }"
            :data-color-scheme="isDark ? 'dark' : 'light'"
            :data-testid="isSharePreviewMode ? 'shared-preview-shell' : undefined"
          >
            <div
              v-if="showImmersivePreviewControls"
              class="preview-immersive-shell"
              data-testid="immersive-preview-hover-zone"
            >
              <div class="preview-immersive-toolbar" data-testid="immersive-preview-toolbar">
                <button
                  type="button"
                  class="ghost-button preview-immersive-toolbar__button"
                  data-testid="immersive-preview-back-button"
                  @click="returnToEditableTestPage"
                >
                  {{ immersiveBackLabel }}
                </button>
                <a
                  class="ghost-button icon-button preview-immersive-toolbar__icon"
                  :href="GITHUB_REPO_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="immersive-preview-star-link"
                  aria-label="Star on GitHub"
                  title="Star on GitHub"
                >
                  <Icon icon="carbon:star" class="icon-button__icon" />
                </a>
                <button
                  type="button"
                  class="ghost-button icon-button preview-immersive-toolbar__icon"
                  data-testid="immersive-preview-theme-button"
                  :aria-label="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  :title="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  @click="toggleAppearance"
                >
                  <Icon
                    :icon="isDark ? 'carbon:moon' : 'carbon:sun'"
                    class="icon-button__icon"
                  />
                </button>
                <button
                  type="button"
                  class="ghost-button preview-immersive-toolbar__button"
                  :aria-pressed="annotationEnabled"
                  @click="toggleAnnotationMode"
                >
                  {{ annotationEnabled ? '退出标注' : '开始标注' }}
                </button>
                <button
                  type="button"
                  class="ghost-button preview-immersive-toolbar__button"
                  @click="exportPreviewAsPdf"
                >
                  导出 PDF
                </button>
                <div v-if="showAnnotationToolbar" class="preview-annotation-toolbar">
                  <span class="preview-annotation-toolbar__hint">
                    {{ ANNOTATION_SHORTCUT_HINT }}
                  </span>
                  <div class="preview-annotation-toolbar__group">
                    <button
                      v-for="toolOption in ANNOTATION_TOOL_OPTIONS"
                      :key="toolOption.id"
                      type="button"
                      class="preview-annotation-chip"
                      :class="{ 'preview-annotation-chip--active': annotationTool === toolOption.id }"
                      @click="annotationTool = toolOption.id"
                    >
                      {{ toolOption.label }}
                    </button>
                  </div>
                  <div class="preview-annotation-toolbar__group">
                    <button
                      v-for="strokeOption in ANNOTATION_STROKES"
                      :key="strokeOption.value"
                      type="button"
                      class="preview-annotation-chip"
                      :class="{ 'preview-annotation-chip--active': annotationStrokeWidth === strokeOption.value }"
                      @click="annotationStrokeWidth = strokeOption.value"
                    >
                      {{ strokeOption.label }}
                    </button>
                  </div>
                  <div class="preview-annotation-toolbar__group preview-annotation-toolbar__group--colors">
                    <button
                      v-for="colorOption in ANNOTATION_COLORS"
                      :key="colorOption"
                      type="button"
                      class="preview-annotation-swatch"
                      :class="{ 'preview-annotation-swatch--active': annotationColor === colorOption }"
                      :style="{ '--annotation-swatch': colorOption }"
                      :aria-label="`切换标注颜色 ${colorOption}`"
                      @click="annotationColor = colorOption"
                    />
                  </div>
                  <div class="preview-annotation-toolbar__group">
                    <button
                      type="button"
                      class="preview-annotation-chip"
                      :disabled="!annotationCanUndo"
                      @click="undoAnnotation"
                    >
                      上一步
                    </button>
                    <button
                      type="button"
                      class="preview-annotation-chip"
                      :disabled="!annotationCanRedo"
                      @click="redoAnnotation"
                    >
                      重做
                    </button>
                    <button
                      type="button"
                      class="preview-annotation-chip"
                      :disabled="!annotationHasItems && !annotationTextDraft"
                      @click="clearAnnotations"
                    >
                      清屏
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <header v-if="!isSharePreviewMode" class="workspace-card__head">
              <div>
                <h2>实时预览</h2>
                <p>
                  {{ `当前模式：${renderModeLabel}${isPreviewFullscreen ? ' · 按 Esc 退出全屏' : ''}` }}
                </p>
              </div>
              <div class="workspace-card__head-actions">
                <button
                  type="button"
                  class="ghost-button icon-button"
                  data-testid="theme-toggle-button"
                  :aria-label="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  :title="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  @click="toggleAppearance"
                >
                  <Icon
                    :icon="isDark ? 'carbon:moon' : 'carbon:sun'"
                    class="icon-button__icon"
                  />
                </button>
                <button
                  type="button"
                  class="ghost-button"
                  data-testid="preview-share-button"
                  :disabled="isWorking"
                  @click="generateAndCopyPreview"
                >
                  {{ copiedShareTarget === 'preview' ? (previewShareUsesLocalStorage ? '已复制本地预览链接' : '已复制预览链接') : (isWorking ? '生成中...' : previewShareButtonLabel) }}
                </button>
                <button
                  type="button"
                  class="ghost-button"
                  data-testid="preview-fullscreen-button"
                  :aria-pressed="isPreviewFullscreen"
                  @click="togglePreviewFullscreen"
                >
                  {{ isPreviewFullscreen ? '退出全屏' : '全屏预览' }}
                </button>
                <span class="mini-pill" :class="{ 'mini-pill--active': isStreaming }">
                  {{ isStreaming ? 'Streaming' : 'Ready' }}
                </span>
              </div>
            </header>

            <div class="preview-surface">
              <div class="preview-surface__grid" />
              <div class="preview-stage-frame">
                <div ref="previewStageRef" class="preview-stage">
                  <MarkdownRender
                    :content="previewContent"
                    :custom-html-tags="testPageCustomHtmlTags"
                    :is-dark="isDark"
                    :mermaid-props="previewMermaidProps"
                    :d2-props="previewD2Props"
                    :infographic-props="previewInfographicProps"
                    :viewport-priority="viewportPriority"
                    :batch-rendering="batchRendering"
                    :typewriter="typewriter"
                    :code-block-stream="codeBlockStream"
                    code-block-dark-theme="vitesse-dark"
                    code-block-light-theme="vitesse-light"
                    :code-block-monaco-options="testPageMonacoOptions"
                    :parse-options="previewParseOptions"
                  />

                  <div
                    class="preview-annotation-layer"
                    :class="{ 'preview-annotation-layer--visible': annotationOverlayVisible }"
                  >
                    <svg
                      ref="annotationDrawSvgRef"
                      class="preview-annotation-layer__svg preview-annotation-layer__svg--draw"
                      :class="{
                        'preview-annotation-layer__svg--interactive': annotationDrawInteractive,
                        'preview-annotation-layer__svg--selectable': annotationDrawSelectable,
                      }"
                      @pointerdown.capture="startDrawSelection"
                    />
                    <div
                      v-if="annotationTextInteractive"
                      class="preview-annotation-layer__text-hitarea"
                      @pointerdown="startTextAnnotation"
                    />
                    <svg
                      class="preview-annotation-layer__svg preview-annotation-layer__svg--text"
                      :viewBox="`0 0 ${annotationStageWidth || 1} ${annotationStageHeight || 1}`"
                      :width="annotationStageWidth || 1"
                      :height="annotationStageHeight || 1"
                    >
                      <g
                        v-for="annotationText in annotationTextItems"
                        :key="annotationText.id"
                        class="preview-annotation-text-item"
                        :data-annotation-id="annotationText.id"
                        :class="{
                          'preview-annotation-text-item--interactive': annotationTextLayerInteractive,
                          'preview-annotation-text-item--dragging': annotationSelectionTransform?.targets.some(target => target.kind === 'text' && target.id === annotationText.id),
                        }"
                        @pointerdown="startTextSelection(annotationText, $event)"
                        @dblclick="editTextAnnotation(annotationText, $event)"
                      >
                        <text
                          :x="annotationText.x"
                          :y="annotationText.y"
                          :fill="annotationText.color"
                          :font-size="annotationText.fontSize"
                          font-weight="700"
                          :stroke="annotationTextOutline"
                          stroke-linejoin="round"
                          paint-order="stroke"
                          stroke-width="8"
                        >
                          <tspan
                            v-for="(line, index) in annotationTextLines(annotationText.content)"
                            :key="`${annotationText.id}-${index}`"
                            :x="annotationText.x"
                            :dy="index === 0 ? 0 : annotationText.fontSize * 1.35"
                          >
                            {{ line }}
                          </tspan>
                        </text>
                      </g>
                    </svg>

                    <div
                      v-if="annotationSelectionVisible"
                      class="preview-annotation-selection"
                    >
                      <div
                        v-if="annotationSelectionBox && !annotationSingleArrowSelection"
                        class="preview-annotation-selection__frame"
                        :style="annotationSelectionFrameStyle()"
                        @pointerdown="startSelectedAnnotationMove"
                        @dblclick.stop="editSelectedTextAnnotation($event)"
                      >
                        <template v-if="annotationSelectionCanResize">
                          <button
                            v-for="handle in ANNOTATION_RESIZE_HANDLES"
                            :key="handle"
                            type="button"
                            class="preview-annotation-selection__handle"
                            :class="`preview-annotation-selection__handle--${handle}`"
                            :style="annotationResizeHandleStyle(handle)"
                            @pointerdown="startSelectedAnnotationResize(handle, $event)"
                          />
                        </template>
                      </div>

                      <template v-else-if="annotationArrowSelectionLine">
                        <div
                          class="preview-annotation-selection__arrow"
                          :style="annotationArrowSelectionStyle"
                        />
                        <button
                          type="button"
                          class="preview-annotation-selection__handle preview-annotation-selection__handle--arrow"
                          :style="annotationArrowHandleStyle('start')"
                          @pointerdown="startSelectedArrowHandle('start', $event)"
                        />
                        <button
                          type="button"
                          class="preview-annotation-selection__handle preview-annotation-selection__handle--arrow"
                          :style="annotationArrowHandleStyle('end')"
                          @pointerdown="startSelectedArrowHandle('end', $event)"
                        />
                      </template>

                      <div
                        v-if="annotationSelectionActionsVisible"
                        class="preview-annotation-selection__actions"
                        :style="annotationSelectionActionsStyle()"
                        @pointerdown.stop
                      >
                        <div v-if="annotationCanAlign" class="preview-annotation-selection__action-group">
                          <button
                            v-for="alignOption in ANNOTATION_ALIGN_OPTIONS"
                            :key="alignOption.id"
                            type="button"
                            class="preview-annotation-selection__action"
                            :title="alignOption.label"
                            @click.stop="alignSelectedAnnotations(alignOption.id)"
                          >
                            {{ alignOption.shortLabel }}
                          </button>
                        </div>
                        <div class="preview-annotation-selection__action-group">
                          <button
                            type="button"
                            class="preview-annotation-selection__action"
                            @click.stop="bringSelectedAnnotationToFront"
                          >
                            置顶
                          </button>
                          <button
                            type="button"
                            class="preview-annotation-selection__action"
                            @click.stop="duplicateSelectedAnnotation"
                          >
                            复制
                          </button>
                          <button
                            type="button"
                            class="preview-annotation-selection__action preview-annotation-selection__action--danger"
                            @click.stop="deleteSelectedAnnotation"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>

                    <div
                      v-if="annotationTextDraft"
                      class="preview-annotation-text-editor"
                      :style="annotationTextEditorStyle()"
                      @pointerdown.stop.prevent="suppressNextTextAnnotationPlacement()"
                      @pointerup.stop.prevent
                      @click.stop
                    >
                      <textarea
                        ref="annotationTextInputRef"
                        v-model="annotationTextDraft.content"
                        class="preview-annotation-text-editor__input"
                        :placeholder="annotationTextDraft.id ? '编辑标注文字' : '输入标注文字'"
                        @keydown.esc.prevent="cancelTextAnnotationDraft"
                        @keydown.meta.enter.prevent="commitTextAnnotationDraft"
                        @keydown.ctrl.enter.prevent="commitTextAnnotationDraft"
                      />
                      <div class="preview-annotation-text-editor__actions">
                        <button
                          type="button"
                          class="preview-annotation-chip"
                          @pointerdown.stop.prevent="suppressNextTextAnnotationPlacement()"
                          @pointerup.stop.prevent
                          @click.stop.prevent="suppressNextTextAnnotationPlacement(); cancelTextAnnotationDraft()"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          class="preview-annotation-chip preview-annotation-chip--active"
                          @pointerdown.stop.prevent="suppressNextTextAnnotationPlacement()"
                          @pointerup.stop.prevent
                          @click.stop.prevent="suppressNextTextAnnotationPlacement(); commitTextAnnotationDraft()"
                        >
                          {{ annotationTextDraft.id ? '保存文字' : '添加文字' }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer v-if="!isSharePreviewMode" class="workspace-card__foot">
              <span>{{ previewContent.length }} chars rendered</span>
              <span>{{ isStreaming ? (isPaused ? '流式已暂停' : '正在逐步追加中') : '已显示完整输入' }}</span>
            </footer>
          </article>

          <article v-if="!isSharePreviewMode && streamDebug && streamChunks.length" class="workspace-card workspace-card--full workspace-card--debug">
            <header class="workspace-card__head">
              <div>
                <h2>Chunk Debug</h2>
                <p>逐块查看 delay、slice 内容和累计节奏。</p>
              </div>
              <span class="mini-pill">{{ streamChunks.length }} chunks</span>
            </header>

            <div class="chunk-log">
              <div v-for="chunk in streamChunks" :key="chunk.index" class="chunk-log__row">
                <strong>#{{ chunk.index }}</strong>
                <span>{{ chunk.delay }}ms</span>
                <code>{{ JSON.stringify(chunk.content) }}</code>
              </div>
            </div>
          </article>

          <article v-if="!isSharePreviewMode" class="workspace-card workspace-card--full workspace-card--sandbox-preview">
            <header class="workspace-card__head">
              <div>
                <h2>版本沙箱预览</h2>
                <p>独立 iframe，真正按 framework 与版本重新挂载渲染器。</p>
              </div>
              <span class="mini-pill" :class="{ 'mini-pill--active': !sandboxDirty }">
                {{ sandboxStatusLabel }}
              </span>
            </header>

            <div class="sandbox-frame-shell">
              <iframe
                :key="sandboxFrameKey"
                class="sandbox-frame"
                :src="sandboxHref"
                title="Markstream version sandbox"
                loading="lazy"
              />
            </div>

            <footer class="workspace-card__foot">
              <span>{{ sandboxPackageLabel }}</span>
              <span>{{ sandboxDirty ? '等待手动同步' : '已加载当前输入快照' }}</span>
            </footer>
          </article>
        </section>
      </div>

      <dialog
        v-if="!isSharePreviewMode"
        ref="streamSettingsDialogRef"
        class="settings-dialog"
      >
        <div class="settings-dialog__panel">
          <header class="settings-dialog__head">
            <div>
              <h2>流式详细设置</h2>
              <p>这里调整 transport、窗口、开关项和代码块渲染策略。</p>
            </div>
            <button type="button" class="ghost-button" @click="closeStreamSettingsDialog">
              关闭
            </button>
          </header>

          <div class="control-stack control-stack--stream">
            <LabSelect
              v-model="streamTransportMode"
              label="Transport"
              :options="STREAM_TRANSPORT_OPTIONS"
            />

            <LabSelect
              v-model="streamSliceMode"
              label="Slice Mode"
              :options="STREAM_SLICE_OPTIONS"
            />

            <LabSelect
              v-model="selectedStreamPresetId"
              label="流式画像 preset"
              :options="streamPresetOptions"
            />

            <p class="control-note">
              {{ streamPresetDescription }}
            </p>

            <label class="range-control">
              <span>chunkSizeMin</span>
              <strong>{{ normalizedChunkSizeRange.min }}</strong>
              <input v-model.number="streamChunkSizeMin" type="range" min="1" max="80" step="1">
            </label>

            <label class="range-control">
              <span>chunkSizeMax</span>
              <strong>{{ normalizedChunkSizeRange.max }}</strong>
              <input v-model.number="streamChunkSizeMax" type="range" min="1" max="80" step="1">
            </label>

            <label class="range-control">
              <span>chunkDelayMin</span>
              <strong>{{ normalizedChunkDelayRange.min }}ms</strong>
              <input v-model.number="streamChunkDelayMin" type="range" min="8" max="600" step="4">
            </label>

            <label class="range-control">
              <span>chunkDelayMax</span>
              <strong>{{ normalizedChunkDelayRange.max }}ms</strong>
              <input v-model.number="streamChunkDelayMax" type="range" min="8" max="600" step="4">
            </label>

            <label class="range-control">
              <span>突发/停顿强度</span>
              <strong>{{ streamBurstiness }}%</strong>
              <input v-model.number="streamBurstiness" type="range" min="0" max="100" step="1">
            </label>

            <p class="control-note">
              当前窗口：{{ streamChunkRangeLabel }}，{{ streamDelayRangeLabel }}。当 min=max 时就是固定节奏。
            </p>

            <p class="control-note">
              `Pure Random` 会直接按随机长度做原始 `slice`；`Boundary Aware` 会尽量贴近单词或标点边界。
            </p>

            <p class="control-note">
              `ReadableStream` 更接近真实 reader 消费链路；`Scheduler` 保留我们本地定时调度模型。burstiness 只会影响非纯随机调度。
            </p>

            <div class="toggle-grid">
              <label class="toggle-item">
                <span>代码块流式渲染</span>
                <input v-model="codeBlockStream" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>viewportPriority</span>
                <input v-model="viewportPriority" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>batchRendering</span>
                <input v-model="batchRendering" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>typewriter</span>
                <input v-model="typewriter" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>KaTeX</span>
                <input v-model="mathEnabled" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>Mermaid</span>
                <input v-model="mermaidEnabled" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>解析树 debug</span>
                <input v-model="debugParse" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>chunk debug</span>
                <input v-model="streamDebug" type="checkbox">
              </label>
            </div>

            <LabSelect
              v-model="renderMode"
              label="代码块模式"
              :options="RENDER_MODE_OPTIONS"
            />
          </div>
        </div>
      </dialog>
    </div>
  </div>
</template>

<style scoped src="./test-page.css"></style>
