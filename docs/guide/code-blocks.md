# Code Block Rendering

## Overview

Code blocks can be rendered in three ways depending on which optional dependencies you install and how you configure the library:

- Monaco (recommended for large/interactive code blocks): installs and uses `stream-monaco` to provide an editor-like, incremental rendering experience. The library lazy-loads `stream-monaco` at runtime when available.
- Shiki (MarkdownCodeBlockNode): install `stream-markdown` and override the `code_block` node via `setCustomComponents` to use a lightweight Markdown-driven renderer.
- Fallback (no extra deps): if neither optional package is installed, code blocks render as plain `<pre><code>` blocks (basic styling / no Monaco features).

## Monaco (recommended)

- Install:

```bash
pnpm add stream-monaco
# or
npm i stream-monaco
```

- Behavior: when `stream-monaco` is present the built-in `CodeBlockNode` will use Monaco-based streaming updates for large or frequently-updated code blocks.

- Vite worker note: Monaco and some worker-backed features require appropriate worker bundling configuration in your bundler (Vite) so the editor/workers are available at runtime. See [/nuxt-ssr](/nuxt-ssr) for guidance and examples of configuring workers and client-only initialization.
- See also: [/guide/monaco](/guide/monaco) for worker bundling tips and preload snippets.

## Shiki mode (MarkdownCodeBlockNode)

- Install:

```bash
pnpm add stream-markdown
# or
npm i stream-markdown
```

- Override the `code_block` node via `setCustomComponents` to register the Shiki-based renderer:

```ts twoslash
import { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue'

setCustomComponents({ code_block: MarkdownCodeBlockNode })
```

Once set, `MarkdownCodeBlockNode` (powered by Shiki via `stream-markdown`) will be used for `code_block` nodes. You can also supply your own component that uses `stream-markdown` directly.

### Language icon lazy loading

To keep the main bundle smaller, infrequent language icons are split into an async chunk:

- Common languages (JS/TS/HTML/CSS/JSON/Python/etc.) stay in the main bundle.
- Rare languages load on demand and will update icon output automatically after the async chunk resolves.
- If you prefer to avoid first-hit fallback icons, preload once during app idle:

```ts twoslash
import { preloadExtendedLanguageIcons } from 'markstream-vue'

if (typeof window !== 'undefined')
  void preloadExtendedLanguageIcons()
```

### Vue CLI 4 (Webpack 4) notes

If you use Vue CLI 4 (Webpack 4), it’s recommended to use the Shiki mode for code blocks and **override** `code_block` to avoid Monaco + legacy-bundler edge cases.

Key pitfalls and fixes (see `playground-vue2-cli`):

- Webpack 4 doesn’t support `package.json#exports` → prefer `dist/*` paths via `resolve.alias`.
- ESM-only packages (like `stream-markdown`) may not be discoverable via `require.resolve()` inside `vue.config.js` (CJS) → use a filesystem fallback to find `node_modules/stream-markdown`, and alias it to `dist/index.js`.
- If you use `IgnorePlugin` to skip optional deps, don’t accidentally ignore `stream-markdown` (otherwise you’ll get `webpackMissingModule` at runtime).

## Fallback

If you don't install either optional package the renderer falls back to a simple `pre`/`code` representation.

## Links & further reading

- Worker / SSR guidance: [/nuxt-ssr](/nuxt-ssr)
- Installation notes: [/guide/installation](/guide/installation)

Try this — simple CodeBlock render:

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'js',
  code: 'console.log(42)',
  raw: 'console.log(42)',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode :node="node" />
</template>
```
