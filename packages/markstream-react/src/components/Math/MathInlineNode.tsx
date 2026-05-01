import type { VisibilityHandle } from '../../context/viewportPriority'
import type { MathInlineNodeProps } from '../../types/component-props'
import { useEffect, useRef, useState } from 'react'
import { useViewportPriority } from '../../context/viewportPriority'
import { normalizeKaTeXRenderInput } from '../../utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'
import { getKatex } from './katex'

export function MathInlineNode({ node }: MathInlineNodeProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const mathRef = useRef<HTMLSpanElement | null>(null)
  const viewportHandleRef = useRef<VisibilityHandle | null>(null)
  const registerViewport = useViewportPriority()
  const [loading, setLoading] = useState(true)
  const [viewportReady, setViewportReady] = useState(() => typeof window === 'undefined')
  const renderIdRef = useRef(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el)
      return
    const handle = registerViewport(el, { rootMargin: '400px' })
    viewportHandleRef.current = handle
    if (handle.isVisible())
      setViewportReady(true)
    handle.whenVisible.then(() => setViewportReady(true))
    return () => {
      handle.destroy()
      viewportHandleRef.current = null
    }
  }, [registerViewport])

  useEffect(() => {
    const content = normalizeKaTeXRenderInput(node.content ?? '')
    if (!content) {
      if (mathRef.current)
        mathRef.current.innerHTML = ''
      setLoading(false)
      return
    }
    if (!viewportReady) {
      setLoading(true)
      return
    }

    let aborted = false
    const controller = new AbortController()
    const renderId = ++renderIdRef.current
    const displayMode = node.markup === '$$'
    renderKaTeXWithBackpressure(content, displayMode, {
      timeout: 1500,
      waitTimeout: 0,
      maxRetries: 0,
      signal: controller.signal,
    })
      .then((html) => {
        if (aborted || renderId !== renderIdRef.current)
          return
        if (mathRef.current) {
          mathRef.current.innerHTML = html
          setLoading(false)
        }
      })
      .catch(async (err: any) => {
        if (aborted || renderId !== renderIdRef.current)
          return
        if (!mathRef.current)
          return
        const code = err?.code || err?.name
        const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer
        const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
        if (isWorkerInitFailure || isBusyOrTimeout) {
          const katex = await getKatex()
          if (katex) {
            try {
              const html = katex.renderToString(content, {
                throwOnError: node.loading,
                displayMode,
              })
              if (!aborted && renderId === renderIdRef.current && mathRef.current) {
                mathRef.current.innerHTML = html
                setLoading(false)
                setKaTeXCache(content, displayMode, html)
              }
              return
            }
            catch {}
          }
        }
        if (!node.loading) {
          mathRef.current.textContent = node.raw
          setLoading(false)
        }
      })

    return () => {
      aborted = true
      controller.abort()
    }
  }, [node.content, node.loading, node.raw, node.markup, viewportReady])

  return (
    <span ref={containerRef} className="math-inline-wrapper">
      <span ref={mathRef} className={`math-inline${loading ? ' math-inline--hidden' : ''}`} />
      {loading && (
        <span className="math-inline__loading" role="status" aria-live="polite">
          <span className="math-inline__spinner" aria-hidden="true" />
          <span className="sr-only">Loading</span>
        </span>
      )}
    </span>
  )
}
