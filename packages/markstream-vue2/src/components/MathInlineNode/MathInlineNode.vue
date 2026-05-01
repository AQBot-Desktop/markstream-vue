<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue-demi'
import { useViewportPriority } from '../../composables/viewportPriority'
import { getCachedMathRender, setCachedMathRender } from '../../utils/mathRenderCache'
import { normalizeKaTeXRenderInput } from '../../utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'
import { getKatex } from './katex'

interface MathInlineNodeProps {
  node: {
    type: 'math_inline'
    content: string
    raw: string
    loading?: boolean
    markup?: string
  }
  indexKey?: number | string
}

const props = defineProps<MathInlineNodeProps>()

const containerEl = ref<HTMLElement | null>(null)
const registerVisibility = useViewportPriority()
let visibilityHandle: ReturnType<typeof registerVisibility> | null = null
let currentRenderId = 0
let isUnmounted = false
let currentAbortController: AbortController | null = null

const displayMode = computed(() => props.node.markup === '$$')
const mathContent = computed(() => normalizeKaTeXRenderInput(props.node.content))
const cacheKey = computed(() => {
  if (props.indexKey == null)
    return null
  return `inline:${String(props.indexKey)}`
})

const initialCached = getCachedMathRender(cacheKey.value)
const renderedHtml = ref(initialCached?.html || '')
const fallbackText = ref('')
const renderingLoading = ref(!initialCached?.html)
let hasRenderedOnce = Boolean(initialCached?.html)

async function renderWithMainThreadFallback() {
  const katex = await getKatex()
  if (!katex)
    return false
  try {
    const html = katex.renderToString(mathContent.value, {
      throwOnError: props.node.loading,
      displayMode: displayMode.value,
    })
    applySuccessfulRender(html)
    setKaTeXCache(mathContent.value, displayMode.value, html)
    return true
  }
  catch {
    return false
  }
}

function applySuccessfulRender(html: string) {
  renderedHtml.value = html
  fallbackText.value = ''
  renderingLoading.value = false
  hasRenderedOnce = true
  setCachedMathRender(cacheKey.value, html)
}

function applyRawFallback() {
  renderedHtml.value = ''
  fallbackText.value = props.node.raw
  renderingLoading.value = false
}

async function renderMath() {
  if (isUnmounted)
    return

  if (!props.node.content) {
    applyRawFallback()
    hasRenderedOnce = true
    return
  }

  const cached = getCachedMathRender(cacheKey.value)
  if (cached?.html && !renderedHtml.value) {
    renderedHtml.value = cached.html
    hasRenderedOnce = true
    renderingLoading.value = false
  }

  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  const renderId = ++currentRenderId
  const abortController = new AbortController()
  currentAbortController = abortController

  if (!hasRenderedOnce) {
    renderingLoading.value = true
    try {
      if (!visibilityHandle && containerEl.value)
        visibilityHandle = registerVisibility(containerEl.value)
      await visibilityHandle?.whenVisible
    }
    catch {}
  }

  try {
    const html = await renderKaTeXWithBackpressure(mathContent.value, displayMode.value, {
      timeout: 1500,
      waitTimeout: 0,
      maxRetries: 0,
      signal: abortController.signal,
    })
    if (isUnmounted || renderId !== currentRenderId)
      return
    applySuccessfulRender(html)
  }
  catch (err: any) {
    if (isUnmounted || renderId !== currentRenderId)
      return
    if (err?.name === 'AbortError')
      return

    const code = err?.code || err?.name
    const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer
    const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
    const isDisabled = code === 'KATEX_DISABLED'

    if ((isWorkerInitFailure || isBusyOrTimeout) && await renderWithMainThreadFallback())
      return

    if (hasRenderedOnce || renderedHtml.value)
      return

    if (isDisabled || !props.node.loading)
      applyRawFallback()
    else
      renderingLoading.value = true
  }
}

watch(
  () => [props.node.content, props.node.loading, props.node.markup, props.node.raw, props.indexKey],
  () => renderMath(),
)

onMounted(() => {
  renderMath()
})

onBeforeUnmount(() => {
  isUnmounted = true
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
  visibilityHandle?.destroy?.()
  visibilityHandle = null
})
</script>

<template>
  <span ref="containerEl" class="math-inline-wrapper">
    <span v-if="renderedHtml" class="math-inline" v-html="renderedHtml" />
    <span v-else-if="fallbackText" class="math-inline math-inline--fallback">{{ fallbackText }}</span>
    <span
      v-if="renderingLoading && !renderedHtml && !fallbackText"
      class="math-inline__loading"
      role="status"
      aria-live="polite"
    >
      <slot name="loading" :is-loading="renderingLoading">
        <span class="math-inline__spinner animate-spin" aria-hidden="true" />
        <span class="sr-only">Loading</span>
      </slot>
    </span>
  </span>
</template>

<style scoped>
.math-inline-wrapper {
  position: relative;
  display: inline-block;
}

.math-inline {
  display: inline-block;
  vertical-align: middle;
}

.math-inline--fallback {
  white-space: pre-wrap;
}

.math-inline__loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.math-inline__spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  border: 2px solid rgba(94, 104, 121, 0.25);
  border-top-color: rgba(94, 104, 121, 0.8);
  will-change: transform;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
