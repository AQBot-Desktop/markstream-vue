# Monaco Editor Integration

Monaco integration is provided by `stream-monaco` and is optional. It supports fast, incremental updates for large code blocks.

Install:

```bash
pnpm add stream-monaco
```

Use `CodeBlockNode` (default) to render Monaco-powered code blocks. For read-only usage, use `MarkdownCodeBlockNode`.

Tips:
- Defer Monaco initialization for offscreen code blocks
- Use `codeBlockStream: false` to avoid partial updates if desired
- Preload via `preloadCodeBlockRuntime()` during app idle or route setup when code blocks are likely
- No additional CSS import is required

![Monaco demo](/screenshots/codeblock-demo.svg)

## Vue CLI (Webpack 4) limitation

`stream-monaco` relies on `import.meta.url` to locate Monaco worker assets, which **Webpack 4** cannot compile reliably. For Vue CLI 4 (Webpack 4):

- Prefer upgrading to Webpack 5 or migrating to Vite for the best Monaco experience.
- If you must stay on Webpack 4, prefer switching code blocks to the Shiki-based renderer (`stream-markdown`) by overriding `code_block` (see [/guide/code-blocks](/guide/code-blocks)). You can also explicitly ignore Monaco deps in `vue.config.js`:

```js
// vue.config.js
const webpack = require('webpack')

module.exports = {
  configureWebpack: {
    plugins: [
      new webpack.IgnorePlugin({ resourceRegExp: /^stream-monaco$/ }),
      new webpack.IgnorePlugin({ resourceRegExp: /^monaco-editor$/ }),
    ],
  },
}
```

### Vite & worker setup

Monaco requires worker packaging for production builds. Use `vite-plugin-monaco-editor-esm` to ensure workers are bundled into your app's build output. Example config:

```ts
import path from 'node:path'
import { defineConfig } from 'vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      languageWorkers: [
        'editorWorkerService',
        'typescript',
        'css',
        'html',
        'json',
      ],
      customDistPath(root, buildOutDir, base) {
        return path.resolve(buildOutDir, 'monacoeditorwork')
      },
    }),
  ],
})
```

### Preloading Monaco

To avoid a cold-start fallback flash when the first code block mounts, preload the code block runtime during app initialization, app idle time, or on first route mount:

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

`preloadCodeBlockRuntime()` dynamically imports `stream-monaco`, registers Monaco workers through markstream-vue's runtime path, and marks the code block runtime as ready so later `CodeBlockNode` remounts can skip the `<pre>` loading fallback.

Existing code that calls `getUseMonaco()` can stay as-is; it now has the same runtime-ready side effect and still returns the loaded `stream-monaco` module or `null`.

### Webpack & MonacoWebpackPlugin

If your app bundles Monaco with `monaco-editor-webpack-plugin`, let the plugin own worker resolution via `globalThis.MonacoEnvironment`. `markstream-vue` will not override `MonacoEnvironment.getWorker/getWorkerUrl` when they already exist.

Quick try — Render a monaco-enabled code block (after installing `stream-monaco`):

```vue
<script setup>
import { CodeBlockNode } from 'markstream-vue'

const node = { type: 'code_block', language: 'js', raw: 'console.log(123)', code: 'console.log(123)' }
</script>

<template>
  <CodeBlockNode :node="node" />
</template>
```

### Add extra languages & themes

Only a minimal set of Monaco languages ships with the default integration to keep the first render fast. When you need additional grammars (Rust, Go, Bash, etc.) or want to ship your own VS Code themes, pass them through `monacoOptions` — either directly on `CodeBlockNode` or globally via `MarkdownRender`'s `codeBlockMonacoOptions` prop. The object is forwarded to `useMonaco()` unchanged.

> `languages` is **not** appended to the built-in defaults from `stream-monaco`; providing this array replaces the internal `defaultLanguages`. Include every language you need (even the original ones) whenever you override it.

Only `ts twoslash` and `vue twoslash` fences in this docs site enable hoverable type details. Hover `languages`, `themes`, `theme`, `MAX_HEIGHT`, or `onDiffHunkAction` below for the useful payloads.

```vue twoslash
<script setup lang="ts">
import type { CodeBlockMonacoOptions, CodeBlockMonacoTheme } from 'markstream-vue'
import MarkdownRender from 'markstream-vue'

const docsDark: CodeBlockMonacoTheme = {
  name: 'docs-dark',
  base: 'vs-dark',
  inherit: true,
  colors: {
    'editor.background': '#05060a',
  },
  rules: [],
}

const docsLight: CodeBlockMonacoTheme = {
  name: 'docs-light',
  base: 'vs',
  inherit: true,
  colors: {
    'editor.background': '#ffffff',
  },
  rules: [],
}

const monacoOptions = {
  languages: ['javascript', 'python', 'rust', 'shell'],
  themes: [docsDark, docsLight],
  theme: 'docs-dark',
  MAX_HEIGHT: 640,
} satisfies CodeBlockMonacoOptions

const markdown = `
\`\`\`python
print("extra languages go here")
\`\`\`

\`\`\`rust
fn main() {}
\`\`\`
`
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="markdown"
    :code-block-monaco-options="monacoOptions"
  />
</template>
```

> Each entry in `languages` can be a Monaco language id string or the loader signature that `stream-monaco` documents (for lazy language bundles). When not using `MarkdownRender`, pass the same `monacoOptions` object directly to `CodeBlockNode` via `:monaco-options`.

### Diff hover actions

Diff code blocks can show hover action buttons for each hunk split (`Revert` / `Stage`). These options are also passed through `monacoOptions` / `codeBlockMonacoOptions`:

```ts twoslash
import type { CodeBlockDiffHunkActionContext, CodeBlockMonacoOptions } from 'markstream-vue'

const monacoOptions = {
  diffHunkActionsOnHover: true,
  diffHunkHoverHideDelayMs: 240,
  onDiffHunkAction(context: CodeBlockDiffHunkActionContext) {
    console.log(context.action, context.side, context.lineChange)
    // Return false to prevent stream-monaco's built-in model edits.
    return false
  },
} satisfies CodeBlockMonacoOptions
```

- `diffHunkActionsOnHover`: enable the hover buttons
- `diffHunkHoverHideDelayMs`: control how long the hover widget stays visible after mouse leave
- `onDiffHunkAction`: intercept `revert` / `stage` before the default edit runs

#### Full example

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const actionLogs = ref<string[]>([])

const monacoOptions = {
  diffHunkActionsOnHover: true,
  diffHunkHoverHideDelayMs: 240,
  onDiffHunkAction(context) {
    actionLogs.value = [
      `${context.action}:${context.side}`,
      ...actionLogs.value,
    ].slice(0, 6)
    // Prevent built-in edits so the demo stays stable while you inspect events.
    return false
  },
}

const markdown = [
  '```diff json:package.json',
  '{',
  '  "name": "markstream-vue",',
  '-  "version": "0.0.49",',
  '+  "version": "0.0.54-beta.1",',
  '  "packageManager": "pnpm@10.16.1"',
  '}',
  '```',
].join('\\n')
</script>

<template>
  <MarkdownRender
    :content="markdown"
    :code-block-monaco-options="monacoOptions"
  />

  <ul>
    <li v-for="(item, index) in actionLogs" :key="`${item}-${index}`">
      {{ item }}
    </li>
  </ul>
</template>
```

Hover the changed red/green hunk area to reveal the `Revert` / `Stage` buttons. Clicking either button will call `onDiffHunkAction`.

> The current action labels are `Revert` and `Stage` (not `Stash`).
>
> In `markstream-vue`, these options should be provided in the initial `monacoOptions` object used to create the editor. If you need to toggle them at runtime, remount the code block so the Monaco diff editor is recreated with the new options.
