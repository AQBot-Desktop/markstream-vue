import { mount } from '@vue/test-utils'
import katex from 'katex'
import { describe, expect, it, vi } from 'vitest'
import MathBlockNode from '../src/components/MathBlockNode/MathBlockNode.vue'
import { flushAll } from './setup/flush-all'

vi.mock('../src/components/MathInlineNode/katex', () => ({
  getKatexSync: () => null,
  getKatex: async () => ({
    renderToString: (content: string, opts: any) => katex.renderToString(content, {
      ...opts,
      output: 'html',
      strict: 'ignore',
    }),
  }),
}))

vi.mock('../src/workers/katexWorkerClient', async () => {
  const actual: any = await vi.importActual('../src/workers/katexWorkerClient')
  return {
    ...actual,
    renderKaTeXWithBackpressure: async (content: string, displayMode = true) => katex.renderToString(content, {
      throwOnError: true,
      displayMode,
      output: 'html',
      strict: 'ignore',
    }),
    setKaTeXCache: vi.fn(),
  }
})

describe('mathBlockNode unicode unit render regression', () => {
  it('normalizes unsupported unit glyphs before worker rendering', async () => {
    const wrapper = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: 'Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}',
          raw: '$$Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}$$',
          markup: '$$',
          loading: false,
        },
      },
    })

    await flushAll()

    const html = wrapper.html()
    expect(html).toContain('data-markstream-mode="katex"')
    expect(html).toContain('class="katex"')
    expect(html).not.toContain('math-block__fallback')
    expect(html).not.toContain('$$Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}$$')
  })
})
