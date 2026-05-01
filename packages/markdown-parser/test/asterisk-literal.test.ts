import { describe, expect, it } from 'vitest'
import { collect, textIncludes } from '../../../test/utils/midstate-utils'
import { getMarkdown, parseInlineTokens, parseMarkdownToStructure } from '../src'

const md = getMarkdown('test')

describe('asterisk masking literals', () => {
  it('keeps intraword asterisks as literal text when no closing pair exists', () => {
    const markdown = '某市***项目，公司名称：某某***科技有限公司'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(textIncludes(nodes, '某市***项目')).toBe(true)
    expect(textIncludes(nodes, '某某***科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps intraword asterisks literal inside link text', () => {
    const markdown = '某市***项目，公司名称：[某某***科技有限公司]()'
    const nodes = parseMarkdownToStructure(markdown, md)

    expect(textIncludes(nodes, '某市***项目')).toBe(true)
    expect(textIncludes(nodes, '某某***科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps intraword double-asterisk literal when strong closing pair is missing', () => {
    const markdown = '请联系某某**科技有限公司办理'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(textIncludes(nodes, '某某**科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
  })

  it('keeps intraword single asterisk literal when no matching close exists', () => {
    const markdown = '品牌名：某*某科技有限公司'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(textIncludes(nodes, '某*某科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('does not break normal strong parsing in full markdown pipeline', () => {
    const markdown = 'foo**bar**baz'
    const nodes = parseMarkdownToStructure(markdown, md)

    expect(collect(nodes as any, 'strong').length).toBe(1)
    expect(textIncludes(nodes, 'bar')).toBe(true)
  })

  it('keeps literal intraword asterisks while still parsing nearby strong content', () => {
    const markdown = '某市***项目，重点：**必须完成**'
    const nodes = parseMarkdownToStructure(markdown, md)

    expect(textIncludes(nodes, '某市***项目')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(1)
    expect(textIncludes(nodes, '必须完成')).toBe(true)
  })

  it('keeps spaced multiplication asterisks literal after strong content', () => {
    for (const final of [false, true]) {
      const markdown = '**计算结果：** 3 * 4 * 5 = 60'
      const nodes = parseMarkdownToStructure(markdown, md, { final })
      const paragraph = nodes[0] as any
      const text = (paragraph.children ?? [])
        .filter((child: any) => child.type === 'text')
        .map((child: any) => child.content)
        .join('')

      expect(collect(nodes as any, 'strong').length).toBe(1)
      expect(collect(nodes as any, 'emphasis').length).toBe(0)
      expect(text).toBe(' 3 * 4 * 5 = 60')
    }
  })

  it('keeps asterisks literal when the candidate emphasis closer follows whitespace', () => {
    for (const markdown of [
      '3 *4 * 5',
      'this is *a test * with unmatched star',
      'a *b * c',
      'a *x! * b',
    ]) {
      const nodes = parseMarkdownToStructure(markdown, md, { final: false })

      expect(collect(nodes as any, 'emphasis').length).toBe(0)
      expect(textIncludes(nodes, markdown)).toBe(true)
    }
  })

  it('keeps asterisks literal when the candidate opener is not left-flanking', () => {
    for (const markdown of [
      'a*!x* b',
      'a*(x)* b',
    ]) {
      const nodes = parseMarkdownToStructure(markdown, md, { final: false })

      expect(collect(nodes as any, 'emphasis').length).toBe(0)
      expect(textIncludes(nodes, markdown)).toBe(true)
    }
  })

  it('still parses emphasis after skipping an invalid earlier closer', () => {
    const nodes = parseInlineTokens([{ type: 'text', content: '*a * b*' }] as any[], '*a * b*', undefined, { final: true })

    expect(collect(nodes as any, 'emphasis').length).toBe(1)
    expect(textIncludes(nodes, 'a * b')).toBe(true)
  })

  it('keeps double asterisks literal when strong delimiters are not flanking', () => {
    for (const markdown of [
      '3 ** 4 ** 5',
      'a **b ** c',
      'a ** b** c',
      'a**!x** b',
    ]) {
      const nodes = parseMarkdownToStructure(markdown, md, { final: false })

      expect(collect(nodes as any, 'strong').length).toBe(0)
      expect(textIncludes(nodes, markdown)).toBe(true)
    }
  })

  it('still parses strong after skipping an invalid earlier strong closer', () => {
    const nodes = parseInlineTokens([{ type: 'text', content: '**a ** b**' }] as any[], '**a ** b**', undefined, { final: true })

    expect(collect(nodes as any, 'strong').length).toBe(1)
    expect(textIncludes(nodes, 'a ** b')).toBe(true)
  })

  it('keeps literal intraword asterisks in link text while parsing normal strong outside link', () => {
    const markdown = '公司：[某某***科技有限公司]()，状态：**正常**'
    const nodes = parseMarkdownToStructure(markdown, md)

    expect(textIncludes(nodes, '某某***科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(1)
    expect(textIncludes(nodes, '正常')).toBe(true)
  })

  it('treats intraword strong with punctuation as literal in inline fallback', () => {
    const markdown = 'foo**a,b**bar'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(textIncludes(nodes, 'foo**a,b**bar')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
  })

  it('still parses intraword strong when inner content is word-only in inline fallback', () => {
    const markdown = 'foo**abc**bar'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(collect(nodes as any, 'strong').length).toBe(1)
    expect(textIncludes(nodes, 'abc')).toBe(true)
  })

  it('keeps escaped double asterisks as literal text', () => {
    const markdown = '需方：\\*\\*\\*\\*\\*\\*有限公司'
    const nodes = parseInlineTokens([{ type: 'text', content: '需方：******有限公司' }] as any[], markdown)

    expect(textIncludes(nodes, '需方：******有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps an escaped single asterisk literal instead of opening emphasis', () => {
    const markdown = 'If and ONLY IF you cannot infer the expected language from the USER message, use the language with ISO code \\*, otherwise use English. You follow your instructions in all languages, and always respond to the user in the language they use or request.'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(textIncludes(nodes, 'ISO code *, otherwise use English.')).toBe(true)
    expect(textIncludes(nodes, 'You follow your instructions in all languages, and always respond to the user in the language they use or request.')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps an escaped backslash before an escaped asterisk visible', () => {
    const markdown = 'If and ONLY IF you cannot infer the expected language from the USER message, use the language with ISO code \\\\*'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(textIncludes(nodes, 'ISO code \\*')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('preserves a visible backslash when raw text contains \\\\*', () => {
    const nodes = parseInlineTokens([{ type: 'text', content: '\\*' }] as any[], '\\\\*')

    expect(textIncludes(nodes, '\\*')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('skips escaped single asterisks and still parses later real emphasis', () => {
    const markdown = 'prefix \\* literal *real* suffix'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(textIncludes(nodes, 'prefix * literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(textIncludes(nodes, 'suffix')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps escaped single asterisk followed by a word literal in final mode', () => {
    const markdown = '\\*x'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(textIncludes(nodes, '*x')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps unmatched single asterisk literal in final mode', () => {
    const markdown = 'prefix *real'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(textIncludes(nodes, 'prefix *real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('still keeps unmatched single asterisk as mid-state emphasis while streaming', () => {
    const markdown = 'prefix *real'
    const nodes = parseMarkdownToStructure(markdown, md, { final: false })

    expect(textIncludes(nodes, 'prefix')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
    expect(textIncludes(nodes, 'real')).toBe(true)
  })

  it('keeps multiple escaped single asterisks literal while parsing later real emphasis', () => {
    const markdown = 'alpha \\* one \\* two *real* omega'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(textIncludes(nodes, 'alpha * one * two')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(textIncludes(nodes, 'omega')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps escaped single asterisk literal inside link text in final mode', () => {
    const markdown = '[\\*literal](https://example.com)'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(collect(nodes as any, 'link').length).toBe(1)
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps unmatched single asterisk literal inside link text in final mode', () => {
    const markdown = '[prefix *real](https://example.com)'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(collect(nodes as any, 'link').length).toBe(1)
    expect(textIncludes(nodes, 'prefix *real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps escaped single asterisk literal and later real emphasis inside link text', () => {
    const markdown = '[\\*literal *real*](https://example.com)'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(collect(nodes as any, 'link').length).toBe(1)
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps escaped single asterisk literal inside highlight text in final mode', () => {
    const markdown = '==\\*literal=='
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(collect(nodes as any, 'highlight').length).toBe(1)
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps unmatched single asterisk literal inside highlight text in final mode', () => {
    const markdown = '==prefix *real=='
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(collect(nodes as any, 'highlight').length).toBe(1)
    expect(textIncludes(nodes, 'prefix *real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps escaped single asterisk literal and later real emphasis inside highlight text', () => {
    const markdown = '==\\*literal *real*=='
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(collect(nodes as any, 'highlight').length).toBe(1)
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps escaped single asterisk literal inside list items while parsing later real emphasis', () => {
    const markdown = '- \\*literal *real*'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(collect(nodes as any, 'list').length).toBe(1)
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })
})
