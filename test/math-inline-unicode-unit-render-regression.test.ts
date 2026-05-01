import { mount } from '@vue/test-utils'
import katex from 'katex'
import { describe, expect, it, vi } from 'vitest'
import MathInlineNode from '../src/components/MathInlineNode/MathInlineNode.vue'
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
    renderKaTeXWithBackpressure: async (content: string, displayMode = false) => katex.renderToString(content, {
      throwOnError: true,
      displayMode,
      output: 'html',
      strict: 'ignore',
    }),
    setKaTeXCache: vi.fn(),
  }
})

describe('mathInlineNode unicode unit render regression', () => {
  it('normalizes unsupported unit glyphs before worker rendering', async () => {
    const wrapper = mount(MathInlineNode as any, {
      props: {
        node: {
          type: 'math_inline',
          content: 'c=0.75\\times10^3\\ \\text{J/(kg·℃)}',
          raw: '$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$',
          markup: '$',
          loading: false,
        },
      },
    })

    await flushAll()

    const html = wrapper.html()
    expect(html).toContain('data-markstream-mode="katex"')
    expect(html).toContain('class="katex"')
    expect(html).not.toContain('math-inline--fallback')
    expect(html).not.toContain('$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$')
  })
})
