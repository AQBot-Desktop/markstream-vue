import katex from 'katex'
import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeKaTeXWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage(data: { id: string, content: string, displayMode: boolean }) {
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

let katexWorkerClient: typeof import('../packages/markstream-angular/src/workers/katexWorkerClient') | null = null

afterEach(() => {
  katexWorkerClient?.clearKaTeXWorker()
  katexWorkerClient = null
  vi.resetModules()
})

describe('markstream-angular katex unicode unit render regression', () => {
  it('enhances inline and block math with unicode unit glyphs through the worker path', async () => {
    katexWorkerClient = await import('../packages/markstream-angular/src/workers/katexWorkerClient')
    katexWorkerClient.setKaTeXWorker(new FakeKaTeXWorker() as unknown as Worker)
    const { enhanceRenderedHtml } = await import('../packages/markstream-angular/src/enhanceRenderedHtml')

    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline">
          <span class="markstream-nested-math__source">c=0.75\\times10^3\\ \\text{J/(kg·℃)}</span>
          <span class="markstream-nested-math__render"></span>
        </span>
        <div class="markstream-nested-math-block">
          <pre class="markstream-nested-math-block__source"><code>Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}</code></pre>
          <div class="markstream-nested-math-block__render"></div>
        </div>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.querySelector('.markstream-nested-math__render .katex')).toBeTruthy()
    expect(shell.querySelector('.markstream-nested-math-block__render .katex-display')).toBeTruthy()
  })
})
