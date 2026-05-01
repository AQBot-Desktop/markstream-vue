import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../packages/markdown-parser/src'
import { collect, links, textIncludes } from './utils/midstate-utils'

const md = getMarkdown('issue-402')

describe('issue #402 filename-like linkify regression', () => {
  it('keeps filename cells as plain text inside markdown tables', () => {
    const input = `当前可用的文件如下:

| 文件名 | 文件ID |
|--------|--------|
| 制度04-XX银行不良信贷资产转让实施细则.docx | f0f026a0a3b84b68af457786ac1271c4GbdC4y7vIs |
| 制度03-XX银行呆账核销实施细则.md | 7a092ea2aabd4460917e1a8347927548jocBz0soj8 |
| 制度02-XX银行呆账核销管理办法.md | d2b786c5ab9a48b5a4755b783a2c8668b2Tp9pCBmH |
| 制度01-财政部文件-《金融企业呆账核销管理办法(2017年版)》.md | 511e9efd721940868eb873c1beb67e43wMl7m22Kb5 |
`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    const tables = collect(nodes, 'table') as any[]
    expect(tables).toHaveLength(1)
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, '制度03-XX银行呆账核销实施细则.md')).toBe(true)
    expect(textIncludes(nodes, '制度02-XX银行呆账核销管理办法.md')).toBe(true)
  })

  it('still preserves normal bare-domain autolinks', () => {
    const nodes = parseMarkdownToStructure('访问 example.com 获取更多信息。', md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://example.com')
    expect(textIncludes(linkNodes[0], 'example.com')).toBe(true)
  })

  it('preserves bare domains whose TLDs overlap with file extensions', () => {
    const nodes = parseMarkdownToStructure('访问 example.ai、example.md 和 OpenAI.ai 获取更多信息。', md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(3)
    expect(linkNodes.map(link => link.href)).toEqual([
      'http://example.ai',
      'http://example.md',
      'http://OpenAI.ai',
    ])
  })

  it('preserves adjacent cjk bare domains when they are intended as links', () => {
    const nodes = parseMarkdownToStructure('请访问example.ai，获取更多信息。', md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://example.ai')
    expect(textIncludes(linkNodes[0], 'example.ai')).toBe(true)
  })

  it('preserves punycoded bare domains whose tlds overlap with file extensions', () => {
    const nodes = parseMarkdownToStructure('也可以访问 xn--fsqu00a.ai 查看说明。', md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://xn--fsqu00a.ai')
    expect(textIncludes(linkNodes[0], 'xn--fsqu00a.ai')).toBe(true)
  })

  it('keeps standalone uppercase filenames as text', () => {
    const nodes = parseMarkdownToStructure('README.md', md, { final: true })

    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'README.md')).toBe(true)
  })

  it('keeps file-like paths as text instead of preserving linkify output', () => {
    const nodes = parseMarkdownToStructure('请查看 docs/README.md 和 src/index.ts。', md, { final: true })

    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'docs/README.md')).toBe(true)
    expect(textIncludes(nodes, 'src/index.ts')).toBe(true)
  })
})
