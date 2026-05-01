<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue-demi'
import { useViewportPriority } from '../../composables/viewportPriority'
import { getCachedMathRender, setCachedMathRender } from '../../utils/mathRenderCache'
import { normalizeKaTeXRenderInput } from '../../utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'
import { getKatex } from '../MathInlineNode/katex'

interface MathBlockNodeProps {
  node: {
    type: 'math_block'
    content: string
    raw: string
    loading?: boolean
  }
  indexKey?: number | string
}

const props = defineProps<MathBlockNodeProps>()
const mathContent = computed(() => normalizeKaTeXRenderInput(props.node.content))

const containerEl = ref<HTMLElement | null>(null)
const registerVisibility = useViewportPriority()
let visibilityHandle: ReturnType<typeof registerVisibility> | null = null
let currentRenderId = 0
let isUnmounted = false
let currentAbortController: AbortController | null = null

const cacheKey = computed(() => {
  if (props.indexKey == null)
    return null
  return `block:${String(props.indexKey)}`
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
      displayMode: true,
    })
    applySuccessfulRender(html)
    setKaTeXCache(mathContent.value, true, html)
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

  if (!hasRenderedOnce) {
    renderingLoading.value = true
    try {
      if (!visibilityHandle && containerEl.value)
        visibilityHandle = registerVisibility(containerEl.value)
      await visibilityHandle?.whenVisible
    }
    catch {}
  }

  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  const renderId = ++currentRenderId
  const abortController = new AbortController()
  currentAbortController = abortController

  try {
    const html = await renderKaTeXWithBackpressure(mathContent.value, true, {
      timeout: 3000,
      waitTimeout: 2000,
      maxRetries: 1,
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
  () => [props.node.content, props.node.loading, props.node.raw, props.indexKey],
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
  <div ref="containerEl" class="math-block text-center overflow-x-auto relative min-h-[40px]">
    <div v-if="renderedHtml" class="math-block__content" v-html="renderedHtml" />
    <div v-else-if="fallbackText" class="math-block__fallback">
      {{ fallbackText }}
    </div>
    <div v-if="renderingLoading && !renderedHtml && !fallbackText" class="math-loading-overlay">
      <div class="math-loading-spinner" />
    </div>
  </div>
</template>

<style scoped>
.math-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
  min-height: 40px;
}

.math-block__fallback {
  white-space: pre-wrap;
}

.math-loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  animation: math-spin 0.8s linear infinite;
}

@keyframes math-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: dark) {
  .math-loading-overlay {
    background-color: rgba(0, 0, 0, 0.6);
  }

  .math-loading-spinner {
    border-color: rgba(255, 255, 255, 0.2);
    border-top-color: rgba(255, 255, 255, 0.8);
  }
}
</style>
