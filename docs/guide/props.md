---
description: Fine-tune markstream-vue with MarkdownRender props for streaming, dark mode, custom tags, parser options, and heavy-node control.
---

# Component props & options

Use this page when you need to fine-tune streaming behaviour, control heavy nodes, or understand how `MarkdownRender` interacts with Tailwind/UnoCSS projects.

## Core props on `MarkdownRender`

| Prop | Type | Default | Notes |
| ---- | ---- | ------- | ----- |
| `content` | `string` | – | Raw Markdown string (required unless `nodes` is provided). |
| `nodes` | `BaseNode[]` | – | Pre-parsed AST structure (typically `ParsedNode[]` from `parseMarkdownToStructure`). Skip this when you want the component to parse internally. |
| `custom-id` | `string` | – | Scopes `setCustomComponents` mappings and lets you target CSS via `[data-custom-id="..."]`. |
| `is-dark` | `boolean` | `false` | Theme flag forwarded to heavy nodes (Mermaid/D2/KaTeX/CodeBlock). Also adds `.dark` on the root container. |
| `index-key` | `number \| string` | – | Key prefix for internal node keys; set this when nesting or rendering multiple MarkdownRender instances in the same list. |
| `final` | `boolean` | `false` | Marks the input as end-of-stream. Disables streaming mid-state (loading) parsing so trailing delimiters (like `$$` or an unclosed code fence) won’t get stuck in a perpetual loading state. |
| `parse-options` | `ParseOptions` | – | Token hooks (`preTransformTokens`, `postTransformTokens`). Applies only when `content` is provided. |
| `custom-html-tags` | `string[]` | – | Extra HTML-like tags treated as common during streaming mid‑states and emitted as custom nodes (`type: 'thinking'`, etc.) for `setCustomComponents` mapping (forwarded to `getMarkdown`, e.g. `['thinking']`). |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | – | Customize the internal MarkdownIt instance (add plugins, tweak options). |
| `debug-performance` | `boolean` | `false` | Logs parse/render timing and virtualization stats (dev only). |
| `typewriter` | `boolean` | `true` | Enables the subtle enter animation. Disable if you need zero animation for SSR snapshots. |

## Streaming & heavy-node toggles

| Flag | Default | What it does |
| ---- | ------- | ------------ |
| `render-code-blocks-as-pre` | `false` | Render non‑Mermaid/Infographic/D2 `code_block` nodes as `<pre><code>` (uses `PreCodeNode`). Mermaid/infographic/D2 blocks still route to their dedicated nodes unless you override them via `setCustomComponents`. |
| `code-block-stream` | `true` | Stream code blocks as content arrives. Disable to keep Monaco in a loading state until the final chunk lands—useful when incomplete code causes parser hiccups. |
| `viewport-priority` | `true` | Defers heavy work (Monaco, Mermaid, D2, KaTeX) when elements are offscreen. Turn off if you need deterministic renders for PDF/print pipelines. |
| `defer-nodes-until-visible` | `true` | When enabled, heavy nodes can render as placeholders until they approach the viewport (non-virtualized mode only). |

## Rendering performance (virtualization & batching)

| Prop | Default | Notes |
| ---- | ------- | ----- |
| `max-live-nodes` | `320` | Virtualization threshold; set `0` to disable virtualization (renders everything). |
| `live-node-buffer` | `60` | Overscan window (how many nodes to keep before/after the focus range). |
| `batch-rendering` | `true` | Incremental rendering batches (only when `max-live-nodes <= 0`). |
| `initial-render-batch-size` | `40` | How many nodes render immediately before batching begins. |
| `render-batch-size` | `80` | How many nodes render per batch tick. |
| `render-batch-delay` | `16` | Extra delay (ms) before each batch after rAF. |
| `render-batch-budget-ms` | `6` | Time budget (ms) before adaptive batch sizes shrink. |
| `render-batch-idle-timeout-ms` | `120` | Timeout (ms) for `requestIdleCallback` slices (when available). |

## Global code block options (forwarded from `MarkdownRender`)

These props are forwarded to `CodeBlockNode` / `MarkdownCodeBlockNode` (but **not** to Mermaid/D2/Infographic blocks, which route to their dedicated nodes):

- `code-block-dark-theme`, `code-block-light-theme`
- `code-block-monaco-options`
- `code-block-min-width`, `code-block-max-width`
- `code-block-props` (extra code-block props such as `showHeader`, `showFontSizeButtons`, and `showTooltips`, plus any custom forwarded keys)
- `themes` (theme list forwarded to `stream-monaco` when present)

Note: `code-block-monaco-options` is only used by the Monaco-backed `CodeBlockNode`. If you override `code_block` with `MarkdownCodeBlockNode`, treat `code-block-dark-theme` / `code-block-light-theme` as Shiki theme names, and `themes` as the Shiki theme list to preload.

Only `ts twoslash` and `vue twoslash` fences in this docs site enable hoverable type details. Hover the object keys below, or `:code-block-monaco-options` in the template, instead of the imported type name.

```vue twoslash
<script setup lang="ts">
import type { CodeBlockMonacoOptions } from 'markstream-vue'
import MarkdownRender from 'markstream-vue'

const md = '```ts\nconsole.log("hover monaco options")\n```'
const monacoOptions = {
  themes: ['vitesse-dark', 'vitesse-light'],
  languages: ['typescript', 'vue', 'json'],
  theme: 'vitesse-dark',
  MAX_HEIGHT: 640,
  diffHideUnchangedRegions: {
    enabled: true,
    contextLineCount: 2,
  },
  diffHunkActionsOnHover: true,
  diffHunkHoverHideDelayMs: 240,
} satisfies CodeBlockMonacoOptions
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="md"
    :code-block-monaco-options="monacoOptions"
  />
</template>
```

`code-block-props` is also strongly typed through the renderer props surface, so you can reuse it without falling back to `any`:

```ts twoslash
import type { NodeRendererProps } from 'markstream-vue'

const codeBlockProps: NonNullable<NodeRendererProps['codeBlockProps']> = {
  showHeader: false,
  showFontSizeButtons: false,
  showTooltips: false,
}
```

## Diagram node props forwarded from `MarkdownRender`

Use these to control specialized block renderers without overriding components manually:

- `mermaid-props` forwards props to `MermaidBlockNode`
- `d2-props` forwards props to `D2BlockNode`
- `infographic-props` forwards props to `InfographicBlockNode`

For Mermaid and Infographic fences, `MarkdownRender` injects an `estimatedPreviewHeightPx` value when the caller does not provide one. This reserves a stable first-preview height for async loading and remounts. Custom `mermaid` and `infographic` renderers receive the same prop, so forward or consume it if the custom block renders its own preview shell.

Example:

```vue
<MarkdownRender
  :content="md"
  :mermaid-props="{ showHeader: false, renderDebounceMs: 180, previewPollDelayMs: 500 }"
  :d2-props="{ progressiveIntervalMs: 450, showCopyButton: false }"
/>
```

`mermaid-props` is especially useful for streaming tuning. Common keys include:

- `renderDebounceMs`
- `contentStableDelayMs`
- `previewPollDelayMs`
- `previewPollMaxDelayMs`
- `previewPollMaxAttempts`
- toolbar toggles such as `showHeader`, `showModeToggle`, `showExportButton`, `showZoomControls`

## Code block header controls

Pass these props directly to `CodeBlockNode` / `MarkdownCodeBlockNode / MermaidBlockNode`, or globally via `code-block-props` on `MarkdownRender`:

- `show-header`
- `show-copy-button`
- `show-expand-button`
- `show-preview-button`
- `show-collapse-button`
- `show-font-size-buttons`
- `show-tooltips` (global tooltip switch for `LinkNode` + code-block nodes + mermaid-block nodes)

See `/guide/codeblock-header` and the `CodeBlockNode` types for the exhaustive list.

Example (global defaults):

```vue
<template>
  <MarkdownRender
    :content="md"
    :code-block-props="{ showHeader: false, showFontSizeButtons: false, showTooltips: false }"
  />
</template>
```

## Quick example

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Title\n\nSome content here.'
</script>

<template>
  <MarkdownRender
    :content="md"
    custom-id="docs"
    :viewport-priority="true"
    :code-block-stream="true"
  />
</template>
```

## Styling & troubleshooting reminders

1. **Import a reset first** (`modern-css-reset`, `@tailwind base`, or `@unocss/reset`), then wrap `markstream-vue/index.css` inside `@layer components` so Tailwind/Uno utilities don’t override node styles. See the [Tailwind guide](/guide/tailwind) for concrete snippets.
2. **Scope overrides** with `custom-id` and `[data-custom-id="docs"]` selectors.
3. **Confirm peer CSS** (KaTeX) is imported; Mermaid/D2 do not require extra CSS.
4. **Check the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here)** whenever visuals look off.
