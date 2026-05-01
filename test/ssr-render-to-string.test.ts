/**
 * @vitest-environment node
 */

import katex from 'katex'
import { afterEach, describe, expect, it } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { disableD2, enableD2 } from '../src/components/D2BlockNode/d2'
import HtmlBlockNode from '../src/components/HtmlBlockNode/HtmlBlockNode.vue'
import { setInfographicLoader } from '../src/components/InfographicBlockNode/infographic'
import MarkdownCodeBlockNode from '../src/components/MarkdownCodeBlockNode'
import MathBlockNode from '../src/components/MathBlockNode'
import MathInlineNode from '../src/components/MathInlineNode'
import { disableKatex, enableKatex, setKatexLoader } from '../src/components/MathInlineNode/katex'
import { disableMermaid, enableMermaid } from '../src/components/MermaidBlockNode/mermaid'
import MarkdownRender from '../src/components/NodeRenderer'
import { clearGlobalCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'

const BASIC_SCOPE = 'ssr-render-basic'
const defaultInfographicLoader = () => import('@antv/infographic')

async function renderComponent(component: any, props: Record<string, any>) {
  const app = createSSRApp({
    render: () => h(component, props),
  })
  return renderToString(app)
}

async function renderMarkdown(content: string, props: Record<string, any> = {}) {
  return renderComponent(MarkdownRender, {
    content,
    final: true,
    ...props,
  })
}

function textNode(content: string) {
  return {
    type: 'text',
    content,
    raw: content,
  }
}

function paragraphNode(children: any[], raw?: string) {
  return {
    type: 'paragraph',
    children,
    raw: raw ?? children.map(child => String(child?.raw ?? child?.content ?? '')).join(''),
  }
}

function inlineWrapper(type: string, content: string, raw: string) {
  return {
    type,
    children: [textNode(content)],
    raw,
  }
}

function linkNode(content: string, href: string) {
  return {
    type: 'link',
    href,
    title: href,
    text: content,
    raw: `[${content}](${href})`,
    children: [textNode(content)],
  }
}

describe('ssr renderToString coverage', () => {
  afterEach(() => {
    clearGlobalCustomComponents()
    enableKatex()
    enableMermaid()
    enableD2()
    setInfographicLoader(defaultInfographicLoader)
  })

  it('renders basic markdown, HTML, and custom HTML tags on the server', async () => {
    setCustomComponents(BASIC_SCOPE, {
      'ssr-badge': defineComponent({
        name: 'SsrBadgeNode',
        setup(_, { slots }) {
          return () => h('span', { 'data-ssr-custom': 'badge' }, slots.default?.() ?? [])
        },
      }),
    })

    const html = await renderMarkdown(`
# SSR Basics

Inline HTML: <mark data-ssr-inline-html="1">inline html</mark>

Trusted custom tag: <ssr-badge>server custom tag</ssr-badge>

- [x] done
- [ ] pending

| Name | Role |
| --- | --- |
| Markstream | Renderer |

Visit [Vue](https://vuejs.org).

![Markstream icon](/vue-markdown-icon.svg "Markstream icon")

<div data-ssr-html-block="1"><strong>HTML block</strong> is present.</div>

Footnotes are server-rendered.[^1]

[^1]: Footnote body
    `.trim(), {
      customHtmlTags: ['ssr-badge'],
      customId: BASIC_SCOPE,
    })

    expect(html).toContain('<h1')
    expect(html).toContain('data-ssr-inline-html="1"')
    expect(html).toContain('data-ssr-html-block="1"')
    expect(html).toContain('data-ssr-custom="badge"')
    expect(html).toContain('<table')
    expect(html).toContain('href="https://vuejs.org"')
    expect(html).toContain('src="/vue-markdown-icon.svg"')
    expect(html).not.toContain('<figure')
    expect(html).toContain('Footnote body')
  })

  it('renders structured html wrappers on the server without duplicating nested markdown', async () => {
    const html = await renderMarkdown(`<span style="font-size: 12px;">

- alpha
- beta

</span>`)

    expect(html).toContain('<span')
    expect(html).toContain('font-size:12px;')
    expect(html).toContain('<ul')
    expect(html.match(/alpha/g)?.length ?? 0).toBe(1)
    expect(html.match(/beta/g)?.length ?? 0).toBe(1)
  })

  it('renders nested structured html wrappers on the server', async () => {
    const html = await renderMarkdown(`<div>
<div>

- alpha

</div>
</div>`)

    expect(html.match(/<ul/g)?.length ?? 0).toBe(1)
    expect(html.match(/alpha/g)?.length ?? 0).toBe(1)
  })

  it('renders structured details html blocks without wrapper nodes before summary', async () => {
    const html = await renderComponent(HtmlBlockNode, {
      node: {
        type: 'html_block',
        tag: 'details',
        content: '<details open><summary>展开看一段 HTML</summary><p>body</p></details>',
        attrs: [['open', '']],
        children: [
          {
            type: 'html_block',
            tag: 'summary',
            content: '<summary>展开看一段 HTML</summary>',
            children: [
              {
                type: 'paragraph',
                raw: '展开看一段 HTML',
                children: [{ type: 'text', content: '展开看一段 HTML', raw: '展开看一段 HTML' }],
              },
            ],
          },
          {
            type: 'paragraph',
            raw: 'body',
            children: [{ type: 'text', content: 'body', raw: 'body' }],
          },
        ],
      },
    })

    expect(html).toMatch(/<details[^>]*class="html-block-node"[^>]*>(?:<!--\[-->|<!--\]-->)*<summary[^>]*>/)
    expect(html).not.toContain('class="markstream-vue markdown-renderer"')
    expect(html).not.toContain('node-slot')
    expect(html).not.toContain('data-node-index=')
    expect(html).not.toContain('<template>')
    expect(html).toMatch(/<p dir="auto" class="paragraph-node"[^>]*>.*?<span[^>]*><span[^>]*>body<\/span>/)
  })

  it('renders an explicit SSR matrix for the lighter built-in node components', async () => {
    const matrixNodes = [
      {
        type: 'heading',
        level: 2,
        text: 'SSR Matrix Heading',
        raw: '## SSR Matrix Heading',
        attrs: { id: 'ssr-matrix-heading' },
        children: [
          textNode('SSR Matrix '),
          { type: 'emoji', name: '😄', markup: ':smile:', raw: ':smile:' },
          textNode(' Heading'),
        ],
      },
      paragraphNode([
        textNode('Inline matrix: '),
        inlineWrapper('strong', 'bold', '**bold**'),
        textNode(' '),
        inlineWrapper('emphasis', 'italic', '*italic*'),
        textNode(' '),
        inlineWrapper('strikethrough', 'strike', '~~strike~~'),
        textNode(' '),
        inlineWrapper('highlight', 'mark', '==mark=='),
        textNode(' '),
        inlineWrapper('insert', 'inserted', '++inserted++'),
        textNode(' H'),
        inlineWrapper('subscript', '2', '~2~'),
        textNode('O x'),
        inlineWrapper('superscript', '2', '^2^'),
        textNode(' '),
        { type: 'inline_code', code: 'const x = 1', raw: '`const x = 1`' },
        textNode(' '),
        linkNode('Example link', 'https://example.com'),
        textNode(' '),
        {
          type: 'html_inline',
          content: '<mark data-ssr-inline-node="1">inline html</mark>',
          raw: '<mark data-ssr-inline-node="1">inline html</mark>',
          loading: false,
        },
        textNode(' '),
        { type: 'reference', id: '7', raw: '[7]' },
        textNode(' '),
        { type: 'footnote_reference', id: 'matrix-1', raw: '[^matrix-1]' },
        { type: 'hardbreak', raw: '  \n' },
        textNode('After hard break'),
      ]),
      {
        type: 'blockquote',
        cite: 'https://example.com/source',
        raw: '> Quoted block content',
        children: [
          paragraphNode([textNode('Quoted block content')]),
        ],
      },
      {
        type: 'list',
        ordered: true,
        start: 3,
        raw: '3. Checked task item\n4. Ordered second item',
        items: [
          {
            type: 'list_item',
            raw: '[x] Checked task item',
            children: [
              paragraphNode([
                { type: 'checkbox', checked: true, raw: '[x]' },
                textNode(' Checked task item'),
              ]),
            ],
          },
          {
            type: 'list_item',
            raw: 'Ordered second item',
            children: [
              paragraphNode([textNode('Ordered second item')]),
            ],
          },
        ],
      },
      {
        type: 'definition_list',
        raw: 'SSR term: SSR definition',
        items: [
          {
            type: 'definition_item',
            raw: 'SSR term: SSR definition',
            term: [textNode('SSR term')],
            definition: [paragraphNode([textNode('SSR definition')])],
          },
        ],
      },
      {
        type: 'table',
        raw: '| Column | Value |\n| --- | --- |\n| SSR | Stable |',
        loading: false,
        header: {
          type: 'table_row',
          raw: '| Column | Value |',
          cells: [
            { type: 'table_cell', header: true, raw: 'Column', children: [textNode('Column')] },
            { type: 'table_cell', header: true, raw: 'Value', children: [textNode('Value')] },
          ],
        },
        rows: [
          {
            type: 'table_row',
            raw: '| SSR | Stable |',
            cells: [
              { type: 'table_cell', header: false, raw: 'SSR', children: [textNode('SSR')] },
              { type: 'table_cell', header: false, raw: 'Stable', children: [textNode('Stable')] },
            ],
          },
        ],
      },
      {
        type: 'footnote',
        id: 'matrix-1',
        raw: '[^matrix-1]: Footnote body',
        children: [
          paragraphNode([
            textNode('Footnote body'),
            { type: 'footnote_anchor', id: 'matrix-1', raw: '↩︎' },
          ]),
        ],
      },
      {
        type: 'admonition',
        kind: 'tip',
        title: 'SSR Tip',
        raw: '::: tip SSR Tip\nAdmonition body\n:::',
        children: [
          paragraphNode([textNode('Admonition body')]),
        ],
      },
      {
        type: 'vmr_container',
        name: 'callout',
        raw: '::: callout\nContainer body\n:::',
        attrs: { 'data-ssr-container': '1' },
        children: [
          paragraphNode([textNode('Container body')]),
        ],
      },
      {
        type: 'thematic_break',
        raw: '---',
      },
    ]

    const html = await renderMarkdown('', {
      nodes: matrixNodes,
    })

    expect(html).toContain('id="ssr-matrix-heading"')
    expect(html).toContain('class="paragraph-node"')
    expect(html).toContain('class="strong-node"')
    expect(html).toContain('class="emphasis-node"')
    expect(html).toContain('class="strikethrough-node"')
    expect(html).toContain('class="highlight-node"')
    expect(html).toContain('class="insert-node"')
    expect(html).toContain('class="subscript-node"')
    expect(html).toContain('class="superscript-node"')
    expect(html).toContain('class="emoji-node"')
    expect(html).toContain('data-ssr-inline-node="1"')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('class="reference-node')
    expect(html).toContain('class="footnote-reference"')
    expect(html).toContain('class="hard-break"')
    expect(html).toContain('<blockquote')
    expect(html).toContain('class="checkbox-node"')
    expect(html).toContain('<ol')
    expect(html).toContain('<dl')
    expect(html).toContain('<table')
    expect(html).toContain('class="footnote-anchor')
    expect(html).toContain('class="admonition admonition-tip')
    expect(html).toContain('data-ssr-container="1"')
    expect(html).toContain('class="vmr-container vmr-container-callout"')
    expect(html).toContain('<hr class="hr-node"')
    expect(html).toContain('After hard break')
  })

  it('renders code blocks with an SSR pre fallback inside the code shell', async () => {
    const html = await renderMarkdown(`
\`\`\`diff
--- a/file.txt
+++ b/file.txt
@@
- old line
+ new line
\`\`\`

\`\`\`ts
export const greet = (name: string) => \`hello \${name}\`
\`\`\`
    `.trim())

    expect(html).toContain('data-markstream-code-block="1"')
    expect(html).toContain('data-markstream-enhanced="false"')
    expect(html).toContain('data-markstream-pre="1"')
    expect(html).toContain('@@')
    expect(html).toContain('new line')
    expect(html).toContain('hello ' + '$' + '{name}')
  })

  it('renders the standalone MarkdownCodeBlockNode shell during SSR', async () => {
    const html = await renderComponent(MarkdownCodeBlockNode, {
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'export const value = 1',
        raw: '```ts\nexport const value = 1\n```',
      },
      loading: false,
      stream: false,
    })

    expect(html).toContain('code-block-container')
    expect(html).toContain('code-block-header')
    expect(html).toContain('code-block-content')
    expect(html).toContain('Typescript')
  })

  it('renders KaTeX HTML during SSR when a sync loader is configured', async () => {
    enableKatex(() => katex)

    const html = await renderMarkdown(`
Inline math: $E = mc^2$.

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$
    `.trim())

    expect(html).toContain('data-markstream-math="inline"')
    expect(html).toContain('data-markstream-math="block"')
    expect(html).toContain('data-markstream-mode="katex"')
    expect(html).toContain('class="katex')
  })

  it('renders HTML and diagram fallbacks in the raw SSR response', async () => {
    const html = await renderMarkdown(`
Inline HTML stays visible: <mark data-ssr-inline-html="1">inline html</mark>.

<div data-ssr-html-block="1"><strong>HTML block</strong> is present.</div>

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

\`\`\`d2
client -> server: request
\`\`\`

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label SSR
      desc First paint
\`\`\`
    `.trim())

    expect(html).toContain('data-ssr-inline-html="1"')
    expect(html).toContain('data-ssr-html-block="1"')
    expect(html).toContain('data-markstream-mermaid="1"')
    expect(html).toContain('data-markstream-d2="1"')
    expect(html).toContain('data-markstream-infographic="1"')
    expect(html).toContain('data-markstream-mode="fallback"')
    expect(html).toContain('graph TD')
    expect(html).toContain('client -&gt; server: request')
    expect(html).toContain('label SSR')
  })

  it('keeps diagram SSR fallbacks stable when optional loaders are unavailable', async () => {
    disableMermaid()
    disableD2()
    setInfographicLoader(null)

    const html = await renderMarkdown(`
\`\`\`mermaid
graph LR
  Raw --> Stable
\`\`\`

\`\`\`d2
stable -> fallback
\`\`\`

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label Disabled
      desc Static fallback
\`\`\`
    `.trim())

    expect(html).toContain('data-markstream-mermaid="1"')
    expect(html).toContain('data-markstream-d2="1"')
    expect(html).toContain('data-markstream-infographic="1"')
    expect(html).toContain('data-markstream-mode="fallback"')
    expect(html).toContain('Raw --&gt; Stable')
    expect(html).toContain('stable -&gt; fallback')
    expect(html).toContain('label Disabled')
  })

  it('renders scoped custom overrides, custom node types, and trusted custom tags during SSR', async () => {
    const scopeId = 'ssr-render-custom-components'

    const CustomListItem = defineComponent({
      name: 'SsrCustomListItem',
      props: {
        node: { type: Object, required: true },
        indexKey: [String, Number],
        customId: String,
      },
      setup(props) {
        return () => h('li', { 'data-ssr-custom-list-item': '1' }, [
          h(MarkdownRender, {
            nodes: (props.node as any).children || [],
            customId: props.customId,
            indexKey: `ssr-custom-list-item-${String(props.indexKey ?? '')}`,
            final: true,
            typewriter: false,
            batchRendering: false,
          }),
        ])
      },
    })

    const CustomNodeCard = defineComponent({
      name: 'SsrCustomNodeCard',
      props: {
        node: { type: Object, required: true },
      },
      setup(props) {
        return () => h('section', { 'data-ssr-custom-node': '1' }, String((props.node as any).content ?? ''))
      },
    })

    const ThinkingNode = defineComponent({
      name: 'SsrThinkingNode',
      props: {
        node: { type: Object, required: true },
      },
      setup(props) {
        return () => h('aside', { 'data-ssr-custom-tag': '1' }, String((props.node as any).content ?? ''))
      },
    })

    setCustomComponents(scopeId, {
      list_item: CustomListItem,
      ssr_card: CustomNodeCard,
      thinking: ThinkingNode,
    })

    const html = await renderMarkdown('', {
      customId: scopeId,
      customHtmlTags: ['thinking'],
      nodes: [
        {
          type: 'list',
          ordered: false,
          raw: '- Override one\n- Override two',
          items: [
            {
              type: 'list_item',
              raw: 'Override one',
              children: [paragraphNode([textNode('Override one')])],
            },
            {
              type: 'list_item',
              raw: 'Override two',
              children: [paragraphNode([textNode('Override two')])],
            },
          ],
        },
        {
          type: 'ssr_card',
          raw: 'Scoped custom node content',
          content: 'Scoped custom node content',
        },
        {
          type: 'html_block',
          tag: 'thinking',
          content: '<thinking>Trusted custom tag content</thinking>',
          raw: '<thinking>Trusted custom tag content</thinking>',
          loading: false,
        },
      ],
    })

    expect(html).toContain('data-ssr-custom-list-item="1"')
    expect(html).toContain('Override one')
    expect(html).toContain('Override two')
    expect(html).toContain('data-ssr-custom-node="1"')
    expect(html).toContain('Scoped custom node content')
    expect(html).toContain('data-ssr-custom-tag="1"')
    expect(html).toContain('Trusted custom tag content')
  })

  it('renders stable raw math fallback when KaTeX is disabled or unavailable', async () => {
    disableKatex()

    const inlineHtml = await renderComponent(MathInlineNode, {
      node: {
        type: 'math_inline',
        content: 'a^2 + b^2 = c^2',
        raw: '$a^2 + b^2 = c^2$',
        markup: '$',
        loading: false,
      },
    })

    setKatexLoader(() => {
      throw new Error('KaTeX unavailable')
    })

    const blockHtml = await renderComponent(MathBlockNode, {
      node: {
        type: 'math_block',
        content: '\\sum_{n=1}^{3} n = 6',
        raw: '$$\\sum_{n=1}^{3} n = 6$$',
        markup: '$$',
        loading: false,
      },
    })

    expect(inlineHtml).toContain('data-markstream-mode="fallback"')
    expect(inlineHtml).toContain('$a^2 + b^2 = c^2$')
    expect(inlineHtml).not.toContain('class="katex')
    expect(blockHtml).toContain('data-markstream-mode="fallback"')
    expect(blockHtml).toContain('\\sum_{n=1}^{3} n = 6')
    expect(blockHtml).not.toContain('class="katex')
  })
})
