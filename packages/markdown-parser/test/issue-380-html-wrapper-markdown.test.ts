import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('issue 380 html wrapper markdown regression', () => {
  it('keeps markdown nested in a span wrapper as structured children without leaking duplicate top-level nodes', () => {
    const markdown = `<span style="font-size: 12px;">  
  
🗺️【环境状态】  
- 地点：石溪村，李东的茅屋
- 时间：4/12 周四 上午07:00
- 环境：阳光明媚，空气清新，茅屋内简陋但整洁，远处山峦笼罩在薄雾中，偶尔传来鸟鸣声
  
📊【角色状态】
- 生理：健康（轻微饥饿）
- 物品：锄头（自家）、简易弓箭（自家）、5个铜币（自家）、一些干粮（自家）
- 技能：农耕（基础）、陷阱设置（基础）、生存知识（基础）
- 关系：与顾客关系良好（+）

📖【目标与线索】
- 已知线索：无
- 短期目标：无
- 长期目标：无
***

  
🎯【选项】  
1. 去田里劳作，争取多收成些粮食卖钱
2. 上山检查之前设置的陷阱，看有没有捕到猎
3. 直接去清风镇看看情况，虽然路途遥远
4. ……

</span>`

    const md = getMarkdown('issue-380-structured')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('span')
    expect(nodes[0]?.attrs).toEqual([['style', 'font-size: 12px;']])
    expect(nodes[0]?.raw).toBe(markdown)
    expect(nodes[0]?.children?.map((child: any) => child?.type)).toEqual([
      'paragraph',
      'list',
      'paragraph',
      'list',
      'paragraph',
      'list',
      'thematic_break',
      'paragraph',
      'list',
    ])
    expect(nodes[0]?.children?.[0]?.children?.[0]?.content).toBe('🗺️【环境状态】')
    expect(nodes[0]?.children?.[1]?.items).toHaveLength(3)
    expect(nodes[0]?.children?.[8]?.ordered).toBe(true)
    expect(nodes[0]?.children?.[8]?.items).toHaveLength(4)
  })

  it('structures simple block markdown inside span and removes leaked list duplicates', () => {
    const markdown = `<span>

- a
- b

</span>`
    const md = getMarkdown('issue-380-simple')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('span')
    expect(nodes[0]?.children?.map((child: any) => child?.type)).toEqual(['list'])
    expect(nodes[0]?.children?.[0]?.items).toHaveLength(2)
    expect(nodes[0]?.children?.[0]?.items?.[0]?.children?.[0]?.children?.[0]?.content).toBe('a')
    expect(nodes[0]?.children?.[0]?.items?.[1]?.children?.[0]?.children?.[0]?.content).toBe('b')
  })

  it('keeps pure html wrappers unstructured when they do not actually contain markdown blocks', () => {
    const markdown = '<div><strong>Block HTML</strong></div>'
    const md = getMarkdown('issue-380-pure-html')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('div')
    expect(nodes[0]?.children).toBeUndefined()
  })

  it('does not structure blocked tags even when their inner content looks like markdown blocks', () => {
    const markdown = `<script>

- a
- b

</script>`
    const md = getMarkdown('issue-380-blocked-tag')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('script')
    expect(nodes[0]?.children).toBeUndefined()
    expect(nodes[0]?.raw).toBe(markdown)
  })

  it('keeps literal-content tags unstructured even when their inner content looks like markdown blocks', () => {
    const samples = ['pre', 'style', 'textarea'] as const

    for (const tag of samples) {
      const markdown = `<${tag}>

- a
- b

</${tag}>`
      const md = getMarkdown(`issue-380-literal-${tag}`)
      const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

      expect(nodes).toHaveLength(1)
      expect(nodes[0]?.type).toBe('html_block')
      expect(nodes[0]?.tag).toBe(tag)
      expect(nodes[0]?.children).toBeUndefined()
      expect(nodes[0]?.raw).toBe(markdown)
    }
  })

  it('structures nested html wrappers when the inner wrapper already contains markdown blocks', () => {
    const markdown = `<div>
<div>

- a

</div>
</div>`
    const md = getMarkdown('issue-380-nested')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('div')
    expect(nodes[0]?.children?.map((child: any) => child?.type)).toEqual(['html_block'])
    expect(nodes[0]?.children?.[0]?.tag).toBe('div')
    expect(nodes[0]?.children?.[0]?.children?.map((child: any) => child?.type)).toEqual(['list'])
    expect(nodes[0]?.children?.[0]?.children?.[0]?.items).toHaveLength(1)
    expect(nodes[0]?.children?.[0]?.children?.[0]?.items?.[0]?.children?.[0]?.children?.[0]?.content).toBe('a')
  })

  it('keeps streaming span wrappers stable before the closing tag arrives', () => {
    const markdown = `<span>

- a
- b`
    const md = getMarkdown('issue-380-streaming')
    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('span')
    expect(nodes[0]?.loading).toBe(true)
    expect(nodes[0]?.children?.map((child: any) => child?.type)).toEqual(['list'])
    expect(nodes[0]?.children?.[0]?.items).toHaveLength(2)
  })
})
