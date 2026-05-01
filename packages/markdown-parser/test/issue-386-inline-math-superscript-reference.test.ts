import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

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

function parse(markdown: string, final = true) {
  const md = getMarkdown('issue-386')
  return parseMarkdownToStructure(markdown, md, { final }) as any[]
}

function collectByType(value: any, targetType: string): any[] {
  const out: any[] = []
  const walk = (node: any) => {
    if (!node)
      return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node.type === targetType)
      out.push(node)
    if (Array.isArray(node.children))
      node.children.forEach(walk)
    if (Array.isArray(node.items))
      node.items.forEach(walk)
  }
  walk(value)
  return out
}

describe('issue #386 inline math suffix regressions', () => {
  it.each([true, false])('keeps superscript syntax immediately after inline math when final=%s', (final) => {
    const nodes = parse('$2.897771955 times 10^{-3}text{m·K}$^[1]^', final)
    const paragraph = nodes[0] as any

    expect(paragraph?.type).toBe('paragraph')
    expect(paragraph?.children?.map((child: any) => child.type)).toEqual([
      'math_inline',
      'superscript',
    ])
    expect(paragraph?.children?.[1]?.children?.map((child: any) => child.content).join('')).toBe('[1]')

    const textNodes = collectByType(paragraph, 'text')
    expect(textNodes.some((node: any) => node.content === '^[1]^')).toBe(false)
  })

  it.each([true, false])('keeps footnote references immediately after inline math when final=%s', (final) => {
    const nodes = parse('$x$[^1]\n\n[^1]: note', final)
    const paragraph = nodes[0] as any

    expect(paragraph?.type).toBe('paragraph')
    expect(paragraph?.children?.map((child: any) => child.type)).toEqual([
      'math_inline',
      'footnote_reference',
    ])
    expect(paragraph?.children?.[1]?.id).toBe('1')

    const footnotes = collectByType(nodes, 'footnote')
    expect(footnotes).toHaveLength(1)
    expect(footnotes[0]?.id).toBe('1')
    expect(collectByType(footnotes[0], 'text').some((node: any) => node.content === 'note')).toBe(true)
  })

  it.each([true, false])('preserves brackets inside sup html content when final=%s', (final) => {
    const nodes = parse('测试<sup>[3]</sup>。', final)
    const paragraph = nodes[0] as any
    const htmlInline = collectByType(paragraph, 'html_inline')[0] as any

    expect(htmlInline).toBeDefined()
    expect(htmlInline.content).toBe('<sup>[3]</sup>')
    expect(htmlInline.children).toEqual([
      {
        type: 'text',
        content: '[3]',
        raw: '[3]',
      },
    ])
  })

  it.each([true, false])('preserves brackets inside generic inline html content when final=%s', (final) => {
    const nodes = parse('<span>[3]</span>', final)
    const paragraph = nodes[0] as any
    const htmlInline = collectByType(paragraph, 'html_inline')[0] as any

    expect(htmlInline).toBeDefined()
    expect(htmlInline.content).toBe('<span>[3]</span>')
    expect(htmlInline.children).toEqual([
      {
        type: 'text',
        content: '[3]',
        raw: '[3]',
      },
    ])
  })

  it.each([true, false])('parses the real multiline issue-386 input without leaking raw superscript syntax when final=%s', (final) => {
    const nodes = parse(REAL_WORLD_MULTILINE_INPUT, final)
    const paragraph = nodes[0] as any
    const superscripts = collectByType(paragraph, 'superscript')
    const htmlInlineNodes = collectByType(paragraph, 'html_inline')
    const textNodes = collectByType(paragraph, 'text')

    expect(paragraph?.type).toBe('paragraph')
    expect(superscripts).toHaveLength(7)
    expect(superscripts.map((node: any) => node.children?.map((child: any) => child.content).join(''))).toEqual([
      '[1]',
      '[1]',
      '[1]',
      '[1]',
      '[1]',
      '[1]',
      '[1]',
    ])
    expect(textNodes.some((node: any) => String(node.content).includes('^[1]^'))).toBe(false)
    expect(htmlInlineNodes.map((node: any) => node.children?.map((child: any) => child.content).join(''))).toEqual([
      '[3]',
      '[1]',
      '[12]',
      '[3]',
      '[3]',
      '[12]',
    ])
  })
})
