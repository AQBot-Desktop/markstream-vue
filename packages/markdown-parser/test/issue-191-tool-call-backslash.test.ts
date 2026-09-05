import { describe, expect, it } from 'vitest'
import { collect, textIncludes } from '../../../test/utils/midstate-utils'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const tags = ['tool-call', 'think', 'html-render'] as const
const options = { customHtmlTags: [...tags] }

function parse(markdown: string, final: boolean) {
  const md = getMarkdown('issue-191-tool-call', options)
  return parseMarkdownToStructure(markdown, md, { ...options, final })
}

describe('issue 191 - tool-call summary ending with a backslash', () => {
  const truncated = 'ls -la "C:\\Users\\snipe.aqbot\\skills\\GFE" && echo "__SCRIPTS__" && ls -la "C:\\'
  const minimal = 'C:\\'

  it.each([false, true])('keeps a truncated Windows path summary and following heading/list when final=%s', (final) => {
    const markdown = `<tool-call data-aqbot="1" id="a" name="Bash">${truncated}</tool-call>

看起来当前环境是 PowerShell

<tool-call data-aqbot="1" id="b" name="Bash">Get-ChildItem</tool-call>

## 结果

---

1. 已完成

2. 可使用`

    const nodes = parse(markdown, final)
    const tools = collect(nodes as any, 'tool-call')

    expect(tools).toHaveLength(2)
    expect(tools[0]?.content).toBe(truncated)
    expect(String(tools[0]?.content ?? '')).not.toContain('</tool-call>')
    expect(tools[1]?.content).toBe('Get-ChildItem')
    expect(collect(nodes as any, 'heading').some((node: any) => node.text === '结果')).toBe(true)
    expect(textIncludes(nodes, '看起来当前环境是 PowerShell')).toBe(true)
    expect(textIncludes(nodes, '已完成')).toBe(true)
    expect(textIncludes(nodes, '可使用')).toBe(true)
  })

  it.each([false, true])('does not swallow the heading after a one-line C:\\\\ summary when final=%s', (final) => {
    const markdown = `<tool-call data-aqbot="1" id="a" name="Bash">${minimal}</tool-call>

## 标题

1. 内容`

    const nodes = parse(markdown, final)
    const tools = collect(nodes as any, 'tool-call')

    expect(tools).toHaveLength(1)
    expect(tools[0]?.content).toBe(minimal)
    expect(collect(nodes as any, 'heading').some((node: any) => node.text === '标题')).toBe(true)
    expect(textIncludes(nodes, '内容')).toBe(true)
  })

  it('preserves quotes, underscores, redirects, and raw angle/ampersand characters in the summary', () => {
    const summary = String.raw`echo "__SCRIPTS__" && ls "C:\foo" > out.txt && test a < b & c`
    const markdown = `<tool-call data-aqbot="1" id="a" name="Bash">${summary}</tool-call>

## 标题`

    const nodes = parse(markdown, true)
    expect(collect(nodes as any, 'tool-call')[0]?.content).toBe(summary)
    expect(collect(nodes as any, 'heading')[0]?.text).toBe('标题')
  })

  it('does not rewrite a tool-call example inside a fenced code block', () => {
    const markdown = '```html\n<tool-call data-aqbot="1" id="a" name="Bash">C:\\</tool-call>\n```\n\n## 标题'
    const nodes = parse(markdown, true)

    expect(collect(nodes as any, 'tool-call')).toHaveLength(0)
    expect(collect(nodes as any, 'code_block').some((node: any) => String(node.code ?? node.content ?? '').includes('<tool-call'))).toBe(true)
    expect(collect(nodes as any, 'heading').some((node: any) => node.text === '标题')).toBe(true)
  })

  it('keeps a list item that contains a complete tool-call as list content', () => {
    const markdown = `1. <tool-call data-aqbot="1" id="a" name="Bash">echo ok</tool-call>`
    const nodes = parse(markdown, true)

    expect(collect(nodes as any, 'list').length).toBeGreaterThan(0)
    expect(collect(nodes as any, 'tool-call')[0]?.content).toBe('echo ok')
    expect(textIncludes(nodes, 'echo ok')).toBe(true)
  })

  it('keeps following table cell text after a complete one-line tool-call', () => {
    const markdown = `<tool-call data-aqbot="1" id="a" name="Bash">${minimal}</tool-call>

| 列 |
| --- |
| 单元格 |`

    const nodes = parse(markdown, true)
    expect(collect(nodes as any, 'tool-call')[0]?.content).toBe(minimal)
    expect(textIncludes(nodes, '单元格')).toBe(true)
  })
})
