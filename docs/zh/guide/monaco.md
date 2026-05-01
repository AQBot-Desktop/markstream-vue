# Monaco 编辑器集成

Monaco 编辑器集成为可选功能（由 `stream-monaco` 提供）。它支持对大代码块进行快速的增量更新。

安装：

```bash
pnpm add stream-monaco
```

提示：
- 延迟初始化 Monaco（仅在可见或需要时才初始化）
- 在生产构建中需要配置 worker 打包（使用 `vite-plugin-monaco-editor-esm`）
- 如果需要更快的首次渲染，可使用 `preloadCodeBlockRuntime()` 在应用启动、空闲时间或路由进入前预加载代码块运行时
- 不需要额外导入 CSS

更多细节参见 `/zh/guide/monaco-internals`。

## Vue CLI（Webpack 4）限制

`stream-monaco` 内部会使用 `import.meta.url` 来定位 Monaco worker 资源，这在 **Webpack 4** 中无法正确编译/解析。对于 Vue CLI 4（Webpack 4）项目：

- 建议升级到 Webpack 5 或迁移到 Vite，以获得最稳定的 Monaco 体验。
- 如果必须停留在 Webpack 4：更推荐把 `code_block` 切到基于 Shiki 的渲染（`stream-markdown`），通过覆盖 `code_block` 来实现（见 [/zh/guide/code-blocks](/zh/guide/code-blocks)）。也可以在 `vue.config.js` 中显式忽略 Monaco 相关依赖：

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

### Webpack & MonacoWebpackPlugin

如果你的项目使用 `monaco-editor-webpack-plugin` 来打包 Monaco，请让该插件通过 `globalThis.MonacoEnvironment` 接管 worker 的解析与路径。`markstream-vue` 在检测到 `MonacoEnvironment.getWorker/getWorkerUrl` 已存在时，不会再覆盖它们。

### 预加载 Monaco

为了避免首次代码块挂载时出现 cold-start fallback 闪烁，可以在应用初始化、空闲时间或进入含代码块的路由前预加载：

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

`preloadCodeBlockRuntime()` 会通过 markstream-vue 内部路径动态加载 `stream-monaco`、注册 Monaco workers，并标记代码块运行时已就绪。这样后续 `CodeBlockNode` 重新挂载时可以跳过 `<pre>` 加载 fallback。

已有代码如果调用的是 `getUseMonaco()`，可以保持不变；它现在也会设置相同的 runtime-ready 状态，并继续返回已加载的 `stream-monaco` module 或 `null`。

### 添加更多语言与主题

为了保持初始化速度，默认只注册了一小部分 Monaco 语言。如果你的文档需要 Rust、Go、Bash 等额外语法，或希望注入自定义主题，可以将它们通过 `monacoOptions` 传给 `CodeBlockNode`，或者在 `MarkdownRender` 上使用 `codeBlockMonacoOptions` 统一下发。该对象会原样透传给 `useMonaco()`。

> 注意：设置 `languages` 会覆盖 `stream-monaco` 内置的 `defaultLanguages`，而不是在其基础上追加。请在数组中显式列出你需要的所有语言（包括默认语言），以免缺少语法高亮。

只有 `ts twoslash` / `vue twoslash` 代码块才会在这个文档站里显示 hover 类型信息。更推荐 hover `languages`、`themes`、`theme`、`MAX_HEIGHT`、`onDiffHunkAction` 这些具体字段。

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

> `languages` 中的每个条目都可以是 Monaco 的语言 ID，或 `stream-monaco` 文档里提到的懒加载函数（用于延迟加载语言包）。如果不是通过 `MarkdownRender`，直接在 `CodeBlockNode` 上使用 `:monaco-options="monacoOptions"` 即可。

### Diff 悬浮操作按钮

对于 diff 代码块，可以在每个 hunk 的上下分段上显示悬浮操作按钮（`Revert` / `Stage`）。这些配置同样通过 `monacoOptions` / `codeBlockMonacoOptions` 透传：

```ts twoslash
import type { CodeBlockDiffHunkActionContext, CodeBlockMonacoOptions } from 'markstream-vue'

const monacoOptions = {
  diffHunkActionsOnHover: true,
  diffHunkHoverHideDelayMs: 240,
  onDiffHunkAction(context: CodeBlockDiffHunkActionContext) {
    console.log(context.action, context.side, context.lineChange)
    // 返回 false 可以阻止 stream-monaco 的内置编辑行为。
    return false
  },
} satisfies CodeBlockMonacoOptions
```

- `diffHunkActionsOnHover`：开启 hunk 悬浮按钮
- `diffHunkHoverHideDelayMs`：控制鼠标移出后悬浮按钮延迟隐藏的时间
- `onDiffHunkAction`：在默认 `revert` / `stage` 编辑执行前进行拦截

#### 完整示例

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
    // 阻止内置编辑，方便在示例里稳定观察回调事件。
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

把鼠标移到红/绿变更 hunk 区域上，就会出现 `Revert` / `Stage` 按钮。点击后会触发 `onDiffHunkAction`。

> 当前按钮文案是 `Revert` 和 `Stage`，不是 `Stash`。
>
> 在 `markstream-vue` 里，这组配置应当在首次创建编辑器时通过初始 `monacoOptions` 传入。如果你要在运行时切换它们，请重新挂载代码块，让 Monaco diff editor 按新配置重建。
