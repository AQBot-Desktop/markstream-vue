import { describe, expect, it } from 'vitest'
import { collect, textIncludes } from '../../../test/utils/midstate-utils'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function parse(markdown: string, final = true) {
  const md = getMarkdown('issue-191-currency')
  return parseMarkdownToStructure(markdown, md, { final })
}

describe('issue 191 - dollar amounts must not become inline math', () => {
  const screenshot = '本周从 $4,713高点回落约 **6%**，目前 $4,365'

  it.each([false, true])('does not create math_inline for the screenshot sentence when final=%s', (final) => {
    const nodes = parse(screenshot, final)

    expect(collect(nodes as any, 'math_inline')).toHaveLength(0)
    expect(collect(nodes as any, 'strong').length).toBeGreaterThan(0)
    expect(textIncludes(nodes, '$4,713')).toBe(true)
    expect(textIncludes(nodes, '$4,365')).toBe(true)
    expect(textIncludes(nodes, '6%')).toBe(true)
  })

  it('keeps a currency range and a table cell amount as text', () => {
    const markdown = `**$2000~$5000美元**

| 现价 |
| --- |
| $4,365 |`

    const nodes = parse(markdown, true)
    expect(collect(nodes as any, 'math_inline')).toHaveLength(0)
    expect(textIncludes(nodes, '$2000~$5000美元')).toBe(true)
    expect(textIncludes(nodes, '$4,365')).toBe(true)
  })

  it('still parses explicit single-dollar math', () => {
    const nodes = parse('结果是 $x+1$ 以及 $2+2$', true)
    const math = collect(nodes as any, 'math_inline')

    expect(math.map((node: any) => node.content)).toEqual(['x+1', '2+2'])
  })

  it('keeps $$...$$ math and escaped dollars', () => {
    const markdown = String.raw`value $$c+d$$ and price \$12`
    const nodes = parse(markdown, true)
    const math = collect(nodes as any, 'math_inline')
    const blocks = collect(nodes as any, 'math_block')

    expect(
      math.some((node: any) => String(node.content ?? '').includes('c+d'))
      || blocks.some((node: any) => String(node.content ?? '').includes('c+d')),
    ).toBe(true)
    expect(textIncludes(nodes, '$12')).toBe(true)
  })

  it('treats $x$2 as text instead of pairing across the trailing amount', () => {
    const nodes = parse('code $x$2', true)
    expect(collect(nodes as any, 'math_inline')).toHaveLength(0)
    expect(textIncludes(nodes, '$x$2')).toBe(true)
  })
})
