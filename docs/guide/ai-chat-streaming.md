---
description: Build AI chat and streaming Markdown UIs with nodes plus final patterns, performance guidance, trusted custom tags, and SSR-safe setup.
---

# AI Chat & Streaming

Use this path when you are building a chat UI, token stream, SSE response viewer, or any screen where Markdown updates frequently while the user is watching.

If you only render static articles or docs pages, go back to [Usage & Streaming](/guide/usage) and prefer the simpler `content` path.

## 1. Choose the leanest install

| Need | Packages | Best for |
| --- | --- | --- |
| Text-only or lightweight chat UI | `markstream-vue` | Basic Markdown, lists, links, blockquotes |
| Syntax-highlighted code without Monaco | `markstream-vue stream-markdown` | SSR-friendly transcripts, lower bundle budgets |
| Rich code interactions | `markstream-vue stream-monaco` | Copy, preview, diff, and Monaco-powered code blocks |
| Diagrams or math in chat output | `markstream-vue mermaid katex` | Mermaid fences and KaTeX formulas |

Install only the peers you actually expect to show up in responses.

## 2. Recommended data flow

For frequent updates, keep parsing outside `MarkdownRender` and pass `nodes` + `final`.

```vue
<script setup lang="ts">
import MarkdownRender, { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'
import { computed, ref } from 'vue'

const streamedText = ref('')
const final = ref(false)
const md = getMarkdown('chat-message')

const nodes = computed(() =>
  parseMarkdownToStructure(streamedText.value, md, { final: final.value }),
)
</script>

<template>
  <MarkdownRender
    custom-id="chat"
    :nodes="nodes"
    :final="final"
  />
</template>
```

Why this path works better:

- `MarkdownRender` does not need to reparse the full string on every tiny token update.
- You can move parsing into a store, worker, or message pipeline later without changing the renderer contract.
- `custom-id="chat"` gives you a scoped place to theme the chat surface or override one renderer safely.

## 3. Renderer settings that usually work well

- Keep the default virtualization behavior for long transcripts. Only tune `maxLiveNodes` if you have a measured reason.
- Use `renderCodeBlocksAsPre` when code fences appear often but Monaco is too heavy for your chat surface.
- Leave heavy peers off until you need them. Chat UIs get a large win from not shipping Mermaid, KaTeX, or Monaco by default.
- If you disable virtualization (`:max-live-nodes="0"`), then the batching props in [Props & Options](/guide/props) become more important.

## 4. Common upgrade paths

### Better code blocks

- Want a lighter docs-style look: use `MarkdownCodeBlockNode` with `stream-markdown`
- Want richer preview/diff controls: use `CodeBlockNode` with `stream-monaco`

See [Renderer & Node Components](/guide/components) for the trade-offs.

### Trusted tags such as `thinking`

Use `custom-html-tags` plus `setCustomComponents('chat', mapping)` so custom tags only affect the chat surface.

See [Custom Tags & Advanced Components](/guide/custom-components).

### Scoped overrides for one message surface

Use `setCustomComponents('chat', { image: ChatImageNode })` and render with `custom-id="chat"`.

See [Override Built-in Components](/guide/component-overrides).

## 5. CSS and SSR checklist

- Load your reset first, then import `markstream-vue/index.css` inside `@layer components`.
- Import `katex/dist/katex.min.css` only if math is enabled.
- Gate browser-only peers such as Mermaid, D2, or Monaco behind client-only boundaries in SSR setups.
- If styles leak, scope your chat tweaks under `[data-custom-id="chat"]`.

Start here when visuals look wrong: [Troubleshooting](/guide/troubleshooting#css-looks-wrong-start-here)

## 6. When not to use this path

- Use `content` when updates are infrequent or the page is basically static.
- Use server-side preparse + `nodes` when another layer already owns Markdown parsing.
- Use the framework-specific guides when SSR/runtime rules matter more than streaming itself.

## Next pages

- [Installation](/guide/installation) for peer decisions
- [Usage & Streaming](/guide/usage) for `content` vs `nodes`
- [Performance](/guide/performance) for larger transcripts
- [Renderer & Node Components](/guide/components) for code/math/diagram component choices
- [Troubleshooting](/guide/troubleshooting) when CSS, peers, or SSR behave unexpectedly
