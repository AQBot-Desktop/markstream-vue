/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { flushAll } from './setup/flush-all'

let MarkdownRender: any

const REAL_WORLD_MULTILINE_INPUT = `$2.897771955 times 10^{-3}text{m·K}$^[1]^
测试<sup>[3]</sup>。
$x$^[1]^
$x$ ^[1]^
测试^[1]^
$2.897771955 \\times 10^{-3}\\text{m·K}$^[1]^
<sup>[1]</sup>
测试<sup>[12]</sup>结束
A<sup>[3]</sup>B
$x$^[1]^
测试^[1]^
<sup>[3]</sup>
测试<sup>[12]</sup>结束`

async function mountMarkdown(markdown: string, extraProps: Record<string, unknown> = {}) {
  const wrapper = mount(MarkdownRender, {
    props: {
      content: markdown,
      ...extraProps,
    },
  })
  await flushAll()
  await flushAll()
  return wrapper
}

describe('issue #386 renderer regressions', () => {
  beforeAll(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    MarkdownRender = (await import('../src/components/NodeRenderer')).default
  })

  it('renders bracketed superscript syntax from markdown content', async () => {
    const wrapper = await mountMarkdown('测试^[1]^')

    const sup = wrapper.find('sup.superscript-node')
    expect(sup.exists()).toBe(true)
    expect(sup.text()).toBe('[1]')
    expect(wrapper.text()).not.toContain('^[1]^')
  })

  it('renders superscript syntax immediately after inline math', async () => {
    const wrapper = await mountMarkdown('$x$^[1]^')

    const sup = wrapper.find('sup.superscript-node')
    expect(sup.exists()).toBe(true)
    expect(sup.text()).toBe('[1]')
    expect(wrapper.text()).not.toContain('^[1]^')
  })

  it('preserves brackets inside standard inline html tags', async () => {
    const wrapper = await mountMarkdown('测试<sup>[3]</sup>。')

    const sup = wrapper.find('.html-inline-node sup')
    expect(sup.exists()).toBe(true)
    expect(sup.text()).toBe('[3]')
  })

  it('renders the real multiline issue-386 input in streaming mode without leaking raw superscript syntax', async () => {
    const wrapper = await mountMarkdown(REAL_WORLD_MULTILINE_INPUT, { final: false })

    const superscripts = wrapper.findAll('sup.superscript-node')
    const inlineHtmlSup = wrapper.findAll('.html-inline-node sup')

    expect(superscripts).toHaveLength(7)
    expect(superscripts.map(node => node.text())).toEqual(['[1]', '[1]', '[1]', '[1]', '[1]', '[1]', '[1]'])
    expect(inlineHtmlSup.map(node => node.text())).toEqual(['[3]', '[1]', '[12]', '[3]', '[3]', '[12]'])
    expect(wrapper.text()).not.toContain('^[1]^')
  })
})
