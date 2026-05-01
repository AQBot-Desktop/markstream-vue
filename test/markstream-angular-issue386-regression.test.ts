import { describe, expect, it } from 'vitest'
import { resolveParsedNodes, splitParagraphChildren } from '../packages/markstream-angular/src/components/shared/node-helpers'
import { renderMarkdownToHtml } from '../packages/markstream-angular/src/renderMarkdownHtml'

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

function paragraphChildren(markdown: string) {
  const nodes = resolveParsedNodes({
    content: markdown,
    final: true,
  }) as any[]

  expect(nodes).toHaveLength(1)
  expect(nodes[0]?.type).toBe('paragraph')
  return nodes[0]?.children ?? []
}

describe('markstream-angular issue #386 paragraph segmentation regressions', () => {
  it('keeps inline html embedded inside the same paragraph segment', () => {
    const children = paragraphChildren('A<sup>[3]</sup>B')
    const segments = splitParagraphChildren(children)

    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ kind: 'inline' })
    expect((segments[0] as any).nodes.map((node: any) => node.type)).toEqual(['text', 'html_inline', 'text'])
  })

  it('keeps adjacent text around inline html in the same paragraph segment for the real issue-386 line', () => {
    const children = paragraphChildren('测试<sup>[12]</sup>结束')
    const segments = splitParagraphChildren(children)

    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ kind: 'inline' })
    expect((segments[0] as any).nodes.map((node: any) => node.type)).toEqual(['text', 'html_inline', 'text'])
  })

  it('renders the real multiline input without leaking raw superscript syntax in html output', () => {
    const html = renderMarkdownToHtml({
      content: REAL_WORLD_MULTILINE_INPUT,
      final: false,
    })

    expect(html).not.toContain('^[1]^')
    expect(html).toContain('<sup>[3]</sup>')
    expect(html).toContain('A</span><sup>[3]</sup><span class="markstream-angular-text-node">B')
    expect(html).toContain('测试</span><sup>[12]</sup><span class="markstream-angular-text-node">结束')
    expect(html).toContain('class="markstream-angular-text-node"')
  })
})
