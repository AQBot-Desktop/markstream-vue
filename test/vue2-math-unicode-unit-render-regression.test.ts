import katex from 'katex'
import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeKaTeXWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  renderCount = 0

  postMessage(data: { id: string, content: string, displayMode: boolean }) {
    this.renderCount += 1
    queueMicrotask(() => {
      try {
        const html = katex.renderToString(data.content, {
          throwOnError: true,
          displayMode: data.displayMode,
          output: 'html',
          strict: 'ignore',
        })
        this.onmessage?.({
          data: {
            id: data.id,
            html,
            content: data.content,
            displayMode: data.displayMode,
          },
        } as MessageEvent)
      }
      catch (error: any) {
        this.onmessage?.({
          data: {
            id: data.id,
            error: error?.message || String(error),
            content: data.content,
            displayMode: data.displayMode,
          },
        } as MessageEvent)
      }
    })
  }

  terminate() {}
}

let katexWorkerClient: typeof import('../packages/markstream-vue2/src/workers/katexWorkerClient') | null = null

afterEach(() => {
  katexWorkerClient?.clearKaTeXWorker()
  katexWorkerClient = null
  vi.resetModules()
})

describe('markstream-vue2 math unicode unit render regression', () => {
  it('normalizes unicode unit glyphs before worker rendering and caching', async () => {
    const worker = new FakeKaTeXWorker()
    katexWorkerClient = await import('../packages/markstream-vue2/src/workers/katexWorkerClient')
    katexWorkerClient.setKaTeXWorker(worker as unknown as Worker)

    const inlineHtml = await katexWorkerClient.renderKaTeXInWorker('c=0.75\\times10^3\\ \\text{J/(kg·℃)}', false)
    const blockHtml = await katexWorkerClient.renderKaTeXInWorker('Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}', true)
    const cachedInlineHtml = await katexWorkerClient.renderKaTeXInWorker('c=0.75\\times10^3\\ \\text{J/(kg·℃)}', false)

    expect(inlineHtml).toContain('class="katex"')
    expect(blockHtml).toContain('class="katex-display"')
    expect(cachedInlineHtml).toBe(inlineHtml)
    expect(worker.renderCount).toBe(2)
  })
})
