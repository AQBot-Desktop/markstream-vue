import type { VisibilityHandle } from '../../context/viewportPriority'
import type { MathBlockNodeProps } from '../../types/component-props'
import { useEffect, useRef, useState } from 'react'
import { useViewportPriority } from '../../context/viewportPriority'
import { normalizeKaTeXRenderInput } from '../../utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'
import { getKatex } from './katex'

export function MathBlockNode({ node }: MathBlockNodeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mathRef = useRef<HTMLDivElement | null>(null)
  const viewportHandleRef = useRef<VisibilityHandle | null>(null)
  const registerViewport = useViewportPriority()
  const [rendering, setRendering] = useState(true)
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
      setRendering(false)
      return
    }
    if (!viewportReady) {
      setRendering(true)
      return
    }

    let aborted = false
    const controller = new AbortController()
    const renderId = ++renderIdRef.current

    renderKaTeXWithBackpressure(content, true, {
      timeout: 3000,
      waitTimeout: 2000,
      maxRetries: 1,
      signal: controller.signal,
    })
      .then((html) => {
        if (aborted || renderId !== renderIdRef.current)
          return
        if (mathRef.current)
          mathRef.current.innerHTML = html
        setRendering(false)
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
                displayMode: true,
              })
              if (!aborted && renderId === renderIdRef.current && mathRef.current) {
                mathRef.current.innerHTML = html
                setRendering(false)
                setKaTeXCache(content, true, html)
              }
              return
            }
            catch {}
          }
        }
        if (!node.loading) {
          mathRef.current.textContent = node.raw
          setRendering(false)
        }
      })

    return () => {
      aborted = true
      controller.abort()
    }
  }, [node.content, node.loading, node.raw, viewportReady])

  return (
    <div ref={containerRef} className="math-block text-center overflow-x-auto relative min-h-[40px]">
      <div ref={mathRef} className={rendering ? 'math-rendering' : undefined} />
    </div>
  )
}
