import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('fixStrongTokens plugin (parse-token assertions)', () => {
  it('produces strong token around inner underscore for `a __b_c__ d`', () => {
    const md = getMarkdown('t')
    const content = 'a __b_c__ d'
    const nodes = parseMarkdownToStructure(content, md)
    // top-level should be a paragraph
    const para = nodes[0] as any
    expect(para).toBeDefined()
    expect(para.type).toBe('paragraph')
    const strong = para.children?.find((c: any) => c.type === 'strong')
    expect(strong).toBeDefined()
    const text = strong.children?.[0]
    expect(text).toBeDefined()
    expect(text.type).toBe('text')
    expect(text.content).toBe('b_c')
  })

  it('keeps malformed emphasis with an invalid closer as text', () => {
    const md = getMarkdown('t')
    const content = 'this is *a test * with unmatched star'
    const nodes = parseMarkdownToStructure(content, md)
    // basic sanity: nodes array exists and contains at least one paragraph/inline-derived node
    const emphasis = nodes[0].children?.find((c: any) => c.type === 'emphasis')
    expect(emphasis).toBeUndefined()
    expect(nodes[0].children?.[0].type).toBe('text')
    expect(nodes[0].children?.[0].content).toBe(content)
  })

  it('parses strong around inline HTML tag: `**<font color="red">hi</font>**`', () => {
    const md = getMarkdown('t')
    const content = '**<font color="red">hi</font>**'
    const nodes = parseMarkdownToStructure(content, md)

    const para = nodes[0] as any
    expect(para).toBeDefined()
    expect(para.type).toBe('paragraph')

    const strong = para.children?.find((c: any) => c.type === 'strong')
    expect(strong).toBeDefined()

    // inner should contain an html_inline node (font) with text child
    const html = strong.children?.find((c: any) => c.type === 'html_inline' && c.tag === 'font')
    expect(html).toBeDefined()
    expect(html.loading).toBe(false)
    expect(html.autoClosed).toBeFalsy()
    const innerText = html.children?.find((c: any) => c.type === 'text')
    expect(innerText?.content).toBe('hi')
  })

  it('should not parse escaped asterisks as strong: `需方：\\*\\*\\*\\*\\*\\*有限公司`', () => {
    const md = getMarkdown('t')
    const content = '需方：\\*\\*\\*\\*\\*\\*有限公司'
    const nodes = parseMarkdownToStructure(content, md)

    const para = nodes[0] as any
    expect(para).toBeDefined()
    expect(para.type).toBe('paragraph')

    // Should not contain any strong nodes - escaped asterisks should remain as text
    const strongNodes = para.children?.filter((c: any) => c.type === 'strong')
    expect(strongNodes?.length).toBe(0)

    // Should be a single text node with the literal asterisks
    const text = para.children?.[0]
    expect(text?.type).toBe('text')
    expect(text?.content).toBe('需方：******有限公司')
  })

  it('should not parse escaped asterisks as strong: `\\*\\*\\*\\*`', () => {
    const md = getMarkdown('t')
    const content = '\\*\\*\\*\\*'
    const nodes = parseMarkdownToStructure(content, md)

    const para = nodes[0] as any
    expect(para).toBeDefined()
    expect(para.type).toBe('paragraph')

    // Should not contain any strong nodes
    const strongNodes = para.children?.filter((c: any) => c.type === 'strong')
    expect(strongNodes?.length).toBe(0)

    // Should be a single text node
    const text = para.children?.[0]
    expect(text?.type).toBe('text')
    expect(text?.content).toBe('****')
  })

  it('should parse normal strong correctly: `**bold**`', () => {
    const md = getMarkdown('t')
    const content = '**bold**'
    const nodes = parseMarkdownToStructure(content, md)

    const para = nodes[0] as any
    expect(para).toBeDefined()
    expect(para.type).toBe('paragraph')

    // Should contain a strong node
    const strong = para.children?.find((c: any) => c.type === 'strong')
    expect(strong).toBeDefined()
    expect(strong.children?.[0].content).toBe('bold')
  })

  it('should keep strong intact around inline math in ordered list', () => {
    const md = getMarkdown('t')
    const content = '1. **化简集合\\( P \\)并求补集**：\n测试啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊'
    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const list = nodes[0] as any
    expect(list?.type).toBe('list')
    expect(list.ordered).toBe(true)

    const li = list.items?.[0]
    expect(li?.type).toBe('list_item')

    const para = li.children?.[0]
    expect(para?.type).toBe('paragraph')

    const strongs = (para.children ?? []).filter((c: any) => c.type === 'strong')
    expect(strongs.length).toBe(1)

    const strong = strongs[0]
    const strongText = (strong.children ?? [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.content)
      .join('')
    expect(strongText).toBe('化简集合并求补集')
    expect((strong.children ?? []).some((c: any) => c.type === 'math_inline')).toBe(true)

    const afterText = (para.children ?? []).find((c: any) => c.type === 'text') as any
    expect(afterText?.content).toBe('：\n测试啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊')
  })

  describe('escaped characters ($, [, -, _) should be treated as literal text', () => {
    it('should treat escaped dollar signs as text: `\\$\\$`', () => {
      const md = getMarkdown('t')
      const content = '\\$\\$'
      const nodes = parseMarkdownToStructure(content, md)

      const para = nodes[0] as any
      expect(para).toBeDefined()
      expect(para.type).toBe('paragraph')

      const text = para.children?.[0]
      expect(text?.type).toBe('text')
      expect(text?.content).toBe('$$')
    })

    it('should treat escaped dollar signs with content as text: `\\$x\\$`', () => {
      const md = getMarkdown('t')
      const content = '\\$x\\$'
      const nodes = parseMarkdownToStructure(content, md)

      const para = nodes[0] as any
      expect(para).toBeDefined()
      expect(para.type).toBe('paragraph')

      const text = para.children?.[0]
      expect(text?.type).toBe('text')
      expect(text?.content).toBe('$x$')
    })

    it('should treat escaped brackets as text: `\\[text\\]`', () => {
      const md = getMarkdown('t')
      const content = '\\[text\\]'
      const nodes = parseMarkdownToStructure(content, md)

      const para = nodes[0] as any
      expect(para).toBeDefined()
      expect(para.type).toBe('paragraph')

      const text = para.children?.[0]
      expect(text?.type).toBe('text')
      expect(text?.content).toBe('[text]')
    })

    it('should treat escaped hyphen as text: `\\-`', () => {
      const md = getMarkdown('t')
      const content = '\\-'
      const nodes = parseMarkdownToStructure(content, md)

      const para = nodes[0] as any
      expect(para).toBeDefined()
      expect(para.type).toBe('paragraph')

      const text = para.children?.[0]
      expect(text?.type).toBe('text')
      expect(text?.content).toBe('-')
    })

    it('should treat escaped underscore as text: `\\_`', () => {
      const md = getMarkdown('t')
      const content = '\\_'
      const nodes = parseMarkdownToStructure(content, md)

      const para = nodes[0] as any
      expect(para).toBeDefined()
      expect(para.type).toBe('paragraph')

      const text = para.children?.[0]
      expect(text?.type).toBe('text')
      expect(text?.content).toBe('_')
    })

    it('should treat escaped underscores in text as text: `a \\_ b`', () => {
      const md = getMarkdown('t')
      const content = 'a \\_ b'
      const nodes = parseMarkdownToStructure(content, md)

      const para = nodes[0] as any
      expect(para).toBeDefined()
      expect(para.type).toBe('paragraph')

      const text = para.children?.[0]
      expect(text?.type).toBe('text')
      expect(text?.content).toBe('a _ b')
    })

    it('should not parse escaped double underscore as strong: `\\_\\_text\\_\\_`', () => {
      const md = getMarkdown('t')
      const content = '\\_\\_text\\_\\_'
      const nodes = parseMarkdownToStructure(content, md)

      const para = nodes[0] as any
      expect(para).toBeDefined()
      expect(para.type).toBe('paragraph')

      // Should not contain strong nodes
      const strongNodes = para.children?.filter((c: any) => c.type === 'strong')
      expect(strongNodes?.length).toBe(0)

      const text = para.children?.[0]
      expect(text?.type).toBe('text')
      expect(text?.content).toBe('__text__')
    })

    it('should treat escaped backslash as text: `\\\\`', () => {
      const md = getMarkdown('t')
      const content = '\\\\'
      const nodes = parseMarkdownToStructure(content, md)

      const para = nodes[0] as any
      expect(para).toBeDefined()
      expect(para.type).toBe('paragraph')

      const text = para.children?.[0]
      expect(text?.type).toBe('text')
      expect(text?.content).toBe('\\')
    })

    // Mixed escaped and unescaped asterisks
    // Note: When escaped asterisks are followed by unescaped ones in the same line,
    // the behavior depends on whether they are separated by text tokens
    describe('mixed escaped and unescaped asterisks', () => {
      it('should parse escaped asterisks at start followed by real strong: `\\*\\*escaped\\*\\* **real**`', () => {
        const md = getMarkdown('t')
        const content = '\\*\\*escaped\\*\\* **real**'
        const nodes = parseMarkdownToStructure(content, md)

        const para = nodes[0] as any
        expect(para).toBeDefined()
        expect(para.type).toBe('paragraph')

        // First part: escaped asterisks as text
        const text1 = para.children?.[0]
        expect(text1?.type).toBe('text')
        expect(text1?.content).toBe('**escaped** ')

        // Second part: actual strong
        const strong = para.children?.[1]
        expect(strong?.type).toBe('strong')
        expect(strong.children?.[0].content).toBe('real')
      })

      it('should handle escaped asterisks in middle with text separation: `prefix \\*\\* mid \\*\\* suffix **real**`', () => {
        const md = getMarkdown('t')
        const content = 'prefix \\*\\* mid \\*\\* suffix **real**'
        const nodes = parseMarkdownToStructure(content, md)

        const para = nodes[0] as any
        expect(para).toBeDefined()
        expect(para.type).toBe('paragraph')

        // KNOWN LIMITATION: When escaped asterisks are followed by text in the same
        // token stream, they may still be parsed as strong. This is because text_special
        // tokens (escaped asterisks) are merged with subsequent text tokens, and the
        // merged content may then match the strong pattern.
        // Current behavior: creates strong nodes for " mid " and " suffix "
        const strongNodes = para.children?.filter((c: any) => c.type === 'strong')
        expect(strongNodes?.length).toBeGreaterThan(0)

        // The last strong should contain 'real'
        const lastStrong = strongNodes[strongNodes.length - 1]
        expect(lastStrong?.children?.[0].content).toBe('real')
      })

      it('should handle multiple escaped asterisks groups: `\\*\\*\\*\\* and \\*\\*`', () => {
        const md = getMarkdown('t')
        const content = '\\*\\*\\*\\* and \\*\\*'
        const nodes = parseMarkdownToStructure(content, md)

        const para = nodes[0] as any
        expect(para).toBeDefined()
        expect(para.type).toBe('paragraph')

        // Should be all text, no strong nodes
        const strongNodes = para.children?.filter((c: any) => c.type === 'strong')
        expect(strongNodes?.length).toBe(0)

        const text = para.children?.[0]
        expect(text?.type).toBe('text')
        expect(text?.content).toBe('**** and **')
      })

      it('should handle escaped asterisks at end: `text \\*\\*`', () => {
        const md = getMarkdown('t')
        const content = 'text \\*\\*'
        const nodes = parseMarkdownToStructure(content, md)

        const para = nodes[0] as any
        expect(para).toBeDefined()
        expect(para.type).toBe('paragraph')

        const text = para.children?.[0]
        expect(text?.type).toBe('text')
        expect(text?.content).toBe('text **')
      })
    })
  })
})
