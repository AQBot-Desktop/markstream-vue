# markstream-react

React renderer that consumes the structured AST output from `stream-markdown-parser` and renders it with lightweight semantic HTML components. This is the React counter-part to the Vue renderer that powers `markstream-vue`.

## Development

```bash
pnpm --filter markstream-react dev
```

## Build

```bash
pnpm --filter markstream-react build
pnpm --filter markstream-react build:analyze
pnpm --filter markstream-react size:check
```

## Usage

```tsx
import NodeRenderer from 'markstream-react'
import 'markstream-react/index.css'

export default function Article({ markdown }: { markdown: string }) {
  return (
    <NodeRenderer content={markdown} />
  )
}
```

If your app scales root font size on mobile (`html` / `body`), use `markstream-react/index.px.css` to prevent `rem`-based global scaling side effects.

You can also pass a pre-parsed `nodes` array if you already have AST data.

## Streaming best practices

- For high-frequency SSE / token streaming, prefer parsing outside the component and pass `nodes` instead of reparsing the full `content` string every chunk.
- Keep `viewportPriority` enabled unless you explicitly want eager rendering. Mermaid / Monaco / D2 blocks now stay idle while offscreen and resume when they approach the viewport.

```tsx
import NodeRenderer from 'markstream-react'

export default function StreamView({ nodes, final }: { nodes: any[], final: boolean }) {
  return (
    <NodeRenderer
      nodes={nodes}
      final={final}
      viewportPriority
      deferNodesUntilVisible
    />
  )
}
```

## Heavy-node prop forwarding

`NodeRenderer` can forward renderer-level props directly into Mermaid / D2 / Infographic blocks:

```tsx
<NodeRenderer
  content={markdown}
  mermaidProps={{
    showHeader: false,
    renderDebounceMs: 180,
    previewPollDelayMs: 500,
  }}
  d2Props={{ progressiveIntervalMs: 500 }}
  infographicProps={{ showHeader: false }}
/>
```

Notes:
- These props are forwarded to the built-in Mermaid / D2 / Infographic blocks and to custom `mermaid` / `d2` / `infographic` overrides registered with `setCustomComponents(...)`.
- `viewportPriority` applies to those heavy nodes too, so offscreen graphs will not keep doing background work while the text stream is still updating.

## Language-specific code block overrides

You can register a custom component under a fenced language key without wrapping the generic `code_block` renderer:

```tsx
import type { NodeComponentProps } from 'markstream-react'
import { setCustomComponents } from 'markstream-react'

function EChartsBlockNode(props: NodeComponentProps<any>) {
  return <div data-language={String(props.node?.language)}>{String(props.node?.code || '')}</div>
}

setCustomComponents('docs', {
  echarts: EChartsBlockNode,
})
```

Notes:
- `echarts` only catches fences whose language is `echarts`.
- Code block routing priority is exact language key -> built-in `mermaid` / `d2` / `infographic` routes -> `code_block`.
- Custom `mermaid` / `d2` / `infographic` overrides keep their specialized top-level props; other custom language keys use the normal custom component contract (`node`, `ctx`, `renderNode`, and friends).

## Mermaid tuning

Common `mermaidProps` keys for streaming scenarios:

- `renderDebounceMs`: delay progressive work during rapid token bursts.
- `contentStableDelayMs`: how long source mode waits before auto-switching back to preview when content stabilizes.
- `previewPollDelayMs`: initial delay before preview polling tries to upgrade a partial preview into a full render.
- `previewPollMaxDelayMs`: cap for preview polling backoff.
- `previewPollMaxAttempts`: maximum retry count while the Mermaid source is still incomplete.

## Bundle size notes

- Optional peers are not bundled; install only what you use (`stream-monaco`, `stream-markdown`, `mermaid`, `katex`, etc.).
- Infrequent language icons are split into an async chunk and loaded on demand.
- To avoid first-hit fallback icons, preload once when the app is idle:

```tsx
import { preloadExtendedLanguageIcons } from 'markstream-react'

if (typeof window !== 'undefined')
  void preloadExtendedLanguageIcons()
```

## Tailwind

- Non-Tailwind projects: keep importing `markstream-react/index.css` (includes precompiled utilities for the renderer).
- Tailwind projects (avoid duplicate utilities): import `markstream-react/index.tailwind.css` and add `require('markstream-react/tailwind')` to your `tailwind.config.js` `content`.

## Custom components (e.g. `<thinking>`)

Custom tag-like blocks are exposed as nodes with `type: 'thinking'` (the tag name, no angle brackets) when you register the tag in `customHtmlTags` or register a custom component mapping for it.

```tsx
import type { NodeComponentProps } from 'markstream-react'
import NodeRenderer, { setCustomComponents } from 'markstream-react'

function ThinkingNode(props: NodeComponentProps<{ type: 'thinking', content: string }>) {
  const { node, ctx } = props
  return (
    <div className="thinking-node">
      <div className="thinking-title">Thinking</div>
      <NodeRenderer
        content={node.content}
        customId={ctx?.customId}
        isDark={ctx?.isDark}
        typewriter={false}
        batchRendering={false}
        deferNodesUntilVisible={false}
        viewportPriority={false}
        maxLiveNodes={0}
      />
    </div>
  )
}

setCustomComponents('chat', { thinking: ThinkingNode })
```

## Type exports

`markstream-react` now exposes the core public types directly from the package root, including:

- `NodeRendererProps`
- `NodeComponentProps`
- `RenderContext`
- `RenderNodeFn`
- `CustomComponentMap`
- `CodeBlockMonacoOptions`
