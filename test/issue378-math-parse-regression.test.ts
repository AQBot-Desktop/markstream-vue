import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

const markdown = `- 代入数据：$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$，$m=1.1\\ \\text{kg}$，$\\Delta t=40℃$
- 计算得：$Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}$
- 第（1）问：学生遗漏了比热容的数量级$10^3$，将$0.75\\times10^3\\ \\text{J/(kg·℃)}$错写为$0.75\\ \\text{J/(kg·℃)}$，导致计算出的$Q_1$错误。`

function collectMathNodes(node: any, mathNodes: any[] = []) {
  if (!node)
    return mathNodes

  if (node.type === 'math_inline' || node.type === 'math_block')
    mathNodes.push(node)

  if (Array.isArray(node.children))
    node.children.forEach(child => collectMathNodes(child, mathNodes))
  if (Array.isArray(node.items))
    node.items.forEach(child => collectMathNodes(child, mathNodes))

  return mathNodes
}

describe('issue #378 parse regression', () => {
  it('keeps the affected unit formulas as math nodes', () => {
    const md = getMarkdown('issue-378-parse')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const mathNodes = nodes.flatMap(node => collectMathNodes(node))

    expect(mathNodes.map(node => node.raw)).toEqual([
      '$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$',
      '$m=1.1\\ \\text{kg}$',
      '$\\Delta t=40℃$',
      '$Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}$',
      '$10^3$',
      '$0.75\\times10^3\\ \\text{J/(kg·℃)}$',
      '$0.75\\ \\text{J/(kg·℃)}$',
      '$Q_1$',
    ])
  })
})
