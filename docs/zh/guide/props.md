---
description: 通过 MarkdownRender 的 props 精细控制流式渲染、暗色主题、自定义标签、解析选项与重节点行为。
---

# 组件 Props 与选项

在集成 `markstream-vue` 时，常会需要微调流式行为、控制重节点渲染或避免 Tailwind/UnoCSS 样式冲突。本页提供对照表与排障提示。

## `MarkdownRender` 核心 props

| Prop | 类型 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `content` | `string` | – | 原始 Markdown 字符串（除非提供 `nodes`，否则必填）。 |
| `nodes` | `BaseNode[]` | – | 预解析后的 AST（通常为 `parseMarkdownToStructure` 返回的 `ParsedNode[]`）。 |
| `custom-id` | `string` | – | 作用域键，可在 `setCustomComponents` 注册映射并用 `[data-custom-id="docs"]` 做样式覆盖。 |
| `is-dark` | `boolean` | `false` | 主题标记，会透传给 Mermaid/D2/KaTeX/CodeBlock，并在根容器上添加 `.dark`。 |
| `index-key` | `number \| string` | – | 内部节点 key 前缀；嵌套渲染或列表中渲染多实例时建议显式传入。 |
| `final` | `boolean` | `false` | 是否为“流结束/最终态”。开启后会关闭解析器的中间态（loading）行为，避免末尾残留分隔符（如 `$$`、未闭合 code fence）永远停留在 loading。 |
| `parse-options` | `ParseOptions` | – | Token 级钩子（`preTransformTokens`、`postTransformTokens`），仅在传入 `content` 时生效。 |
| `custom-html-tags` | `string[]` | – | 扩展流式内联 HTML 中间态白名单，并将这些标签直接输出为自定义节点（如 `type: 'thinking'`）以便 `setCustomComponents` 映射（会传给 `getMarkdown`，如 `['thinking']`）。 |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | – | 自定义内部 MarkdownIt 实例（加插件、改配置）。 |
| `debug-performance` | `boolean` | `false` | 打印解析/渲染耗时与虚拟化统计（仅 dev）。 |
| `typewriter` | `boolean` | `true` | 控制轻量进入动画。生成静态截图或 SSR 输出时可关闭。 |

## 流式与重节点开关

| Flag | 默认值 | 功能 |
| ---- | ------ | ---- |
| `render-code-blocks-as-pre` | `false` | 将非 Mermaid/Infographic/D2 的 `code_block` 渲染为 `<pre><code>`，适合仅查看或排查 Monaco/Tailwind 样式问题。Mermaid/infographic/D2 仍会路由到各自组件，除非用 `setCustomComponents` 覆盖。 |
| `code-block-stream` | `true` | 启用流式代码块更新；关闭后会保持加载态直到完整文本就绪，避免频繁初始化 Monaco。 |
| `viewport-priority` | `true` | 优先渲染视窗内的 Mermaid/D2/Monaco/KaTeX 等重节点，延迟离屏渲染以提升交互体验。 |
| `defer-nodes-until-visible` | `true` | 启用后，重节点在接近视口前可先渲染为占位（仅在非虚拟化模式生效）。 |

## 渲染性能（虚拟化 & 分批渲染）

| Prop | 默认值 | 说明 |
| ---- | ------ | ---- |
| `max-live-nodes` | `320` | 虚拟化阈值；设为 `0` 可关闭虚拟化（全部渲染）。 |
| `live-node-buffer` | `60` | 视窗前后保留的节点数量（overscan）。 |
| `batch-rendering` | `true` | 分批渲染（仅当 `max-live-nodes <= 0` 时启用）。 |
| `initial-render-batch-size` | `40` | 初始立即渲染的节点数。 |
| `render-batch-size` | `80` | 每批渲染的节点数。 |
| `render-batch-delay` | `16` | 每批在 rAF 之后额外延迟（ms）。 |
| `render-batch-budget-ms` | `6` | 单批预算（ms），超过后会自适应缩小后续 batch。 |
| `render-batch-idle-timeout-ms` | `120` | `requestIdleCallback` 切片的超时（ms，若可用）。 |

## 代码块全局选项（由 `MarkdownRender` 下发）

这些 props 会被转发到 `CodeBlockNode` / `MarkdownCodeBlockNode`（但 **不会** 转发到 Mermaid/D2/Infographic 代码块，因为它们会路由到各自组件）：

- `code-block-dark-theme`, `code-block-light-theme`
- `code-block-monaco-options`
- `code-block-min-width`, `code-block-max-width`
- `code-block-props`（额外代码块 props，例如 `showHeader`、`showFontSizeButtons`、`showTooltips`，同时保留自定义透传字段）
- `themes`（在安装 `stream-monaco` 时，会转发给其主题系统）

注意：`code-block-monaco-options` 仅作用于 Monaco 版 `CodeBlockNode`。如果你把 `code_block` 覆盖成 `MarkdownCodeBlockNode`，此时 `code-block-dark-theme` / `code-block-light-theme` 应填写 Shiki 主题名，`themes` 为需要预加载的 Shiki 主题列表。

只有 `ts twoslash` / `vue twoslash` 代码块才会在这个文档站里显示 hover 类型信息。更推荐 hover 下面对象里的字段，或者模板里的 `:code-block-monaco-options`，而不是只 hover 导入的类型名。

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

`code-block-props` 也可以直接走渲染器公开类型，不需要再退回 `any`：

```ts twoslash
import type { NodeRendererProps } from 'markstream-vue'

const codeBlockProps: NonNullable<NodeRendererProps['codeBlockProps']> = {
  showHeader: false,
  showFontSizeButtons: false,
  showTooltips: false,
}
```

## 图表节点全局下发参数

如果你希望统一控制 Mermaid / D2 / Infographic 的工具栏、渐进渲染参数或交互细节，而不手动覆盖组件，可直接在 `MarkdownRender` 上传这些对象：

- `mermaid-props`：透传给 `MermaidBlockNode`
- `d2-props`：透传给 `D2BlockNode`
- `infographic-props`：透传给 `InfographicBlockNode`

对于 Mermaid 和 Infographic 围栏，调用方未传入时 `MarkdownRender` 会自动注入 `estimatedPreviewHeightPx`，用于为异步加载和重新挂载预留稳定的首屏 preview 高度。自定义 `mermaid` / `infographic` 渲染器也会收到这个 prop；如果自定义块自己渲染 preview shell，应继续转发或使用它。

示例：

```vue
<MarkdownRender
  :content="md"
  :mermaid-props="{ showHeader: false, renderDebounceMs: 180, previewPollDelayMs: 500 }"
  :d2-props="{ progressiveIntervalMs: 450, showCopyButton: false }"
/>
```

其中 `mermaid-props` 很适合用于流式调优，常用项包括：

- `renderDebounceMs`
- `contentStableDelayMs`
- `previewPollDelayMs`
- `previewPollMaxDelayMs`
- `previewPollMaxAttempts`
- `showHeader`、`showModeToggle`、`showExportButton`、`showZoomControls` 等工具栏开关

## 代码块头部控制

可直接传给 `CodeBlockNode` / `MarkdownCodeBlockNode` / `MermaidBlockNode`，或在 `MarkdownRender` 上用 `code-block-props` 统一下发：

- `show-header`
- `show-copy-button`
- `show-expand-button`
- `show-preview-button`
- `show-collapse-button`
- `show-font-size-buttons`
- `show-tooltips`（全局控制 `LinkNode` + 代码块节点的 tooltip + Mermaid块节点的 tooltip）

更多细节请参考 `/zh/guide/codeblock-header` 及类型定义。

示例（全局默认）：

```vue
<template>
  <MarkdownRender
    :content="md"
    :code-block-props="{ showHeader: false, showFontSizeButtons: false, showTooltips: false }"
  />
</template>
```

## 示例

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# 标题\n\n演示 props 用法。'
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

## 样式与排障提示

1. **先引入 reset**（`modern-css-reset`、`@tailwind base`、`@unocss/reset`），再在 `@layer components` 中导入 `markstream-vue/index.css`，避免被 utilities 覆盖。详见 [Tailwind 指南](/zh/guide/tailwind)。
2. **使用 `custom-id`** 与 `[data-custom-id="docs"]` 限定覆盖范围。
3. **检查同伴 CSS** 是否导入（KaTeX），Mermaid/D2 不需要额外 CSS。
4. **查阅 [样式排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here)**，确保 reset、layer、Uno/Tailwind 配置正确。
