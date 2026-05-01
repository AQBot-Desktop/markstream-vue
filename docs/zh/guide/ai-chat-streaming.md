---
description: 用 nodes 加 final 模式构建 AI 聊天与流式 Markdown 界面，并掌握性能、可信标签与 SSR 安全接入方式。
---

# AI 聊天与流式输出

当你在做聊天界面、token 流式输出、SSE 响应预览，或者任何“用户正在看着内容持续变化”的 Markdown 场景时，就走这条路径。

如果你的页面其实是静态文章、文档站或低频更新页面，请回到 [使用与流式渲染](/zh/guide/usage)，优先使用更简单的 `content` 路径。

## 1. 先选最小安装组合

| 需求 | 安装包 | 适合场景 |
| --- | --- | --- |
| 纯文本或轻量聊天界面 | `markstream-vue` | 基础 Markdown、列表、链接、引用 |
| 不用 Monaco 的代码高亮 | `markstream-vue stream-markdown` | SSR 友好的聊天记录、较小 bundle |
| 更强的代码交互 | `markstream-vue stream-monaco` | 复制、预览、diff、Monaco 代码块 |
| 聊天内容里有图表或公式 | `markstream-vue mermaid katex` | Mermaid 图表和 KaTeX 公式 |

只安装你预期回复里真的会出现的能力，对聊天界面的收益通常很大。

## 2. 推荐的数据流

对于高频更新场景，把解析放到 `MarkdownRender` 外面，然后传 `nodes` + `final`。

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

这样做的好处：

- 每次 token 更新时，不需要在 `MarkdownRender` 内部整篇重解析。
- 未来想把解析移到 store、worker 或消息流水线里时，不用改渲染器接法。
- `custom-id="chat"` 给了你一个安全的作用域，用来定制聊天界面样式或替换单个节点。

## 3. 这几个渲染配置通常最稳

- 长聊天记录优先保留默认虚拟化；只有在你有明确性能测量时再去调 `maxLiveNodes`。
- 如果代码块很多，但 Monaco 对当前聊天界面太重，可以先用 `renderCodeBlocksAsPre` 降级。
- 重型 peers 先别全装。聊天类页面最容易从“不默认带 Mermaid、KaTeX、Monaco”里拿到体积收益。
- 如果你关闭虚拟化（`:max-live-nodes="0"`），那 [Props 与选项](/zh/guide/props) 里的 batching 相关配置就会更重要。

## 4. 常见升级路径

### 更好的代码块

- 想要更轻的文档风格：用 `MarkdownCodeBlockNode`，配 `stream-markdown`
- 想要更强的预览 / diff / 交互：用 `CodeBlockNode`，配 `stream-monaco`

具体差异看 [渲染器与节点组件](/zh/guide/components)。

### `thinking` 这类可信标签

使用 `custom-html-tags` + `setCustomComponents('chat', mapping)`，让自定义标签只作用在聊天区域。

详见 [自定义标签与高级组件](/zh/guide/custom-components)。

### 只在一个消息区域里做覆盖

通过 `setCustomComponents('chat', { image: ChatImageNode })` 注册，再配合 `custom-id="chat"` 渲染。

详见 [覆盖内置组件](/zh/guide/component-overrides)。

## 5. CSS 与 SSR 检查清单

- 先引入 reset，再在 `@layer components` 中导入 `markstream-vue/index.css`
- 只有启用数学公式时，才额外导入 `katex/dist/katex.min.css`
- SSR 场景下，把 Mermaid、D2、Monaco 这类浏览器专属依赖放到 client-only 边界之后
- 如果样式串到别的区域，所有聊天界面的定制都收口到 `[data-custom-id="chat"]`

页面效果不对时，先从这里开始排： [故障排除](/zh/guide/troubleshooting#css-looks-wrong-start-here)

## 6. 什么时候不该走这条路径

- 更新频率不高、页面基本静态时，用 `content` 更简单
- 如果服务端或别的层已经接管 Markdown 解析，就直接用预解析后的 `nodes`
- 如果当前问题主要是 SSR / runtime 边界，而不是流式输出本身，优先看对应框架文档

## 下一步继续看

- [安装](/zh/guide/installation)：选 peers
- [使用与流式渲染](/zh/guide/usage)：理解 `content` vs `nodes`
- [性能](/zh/guide/performance)：处理更长的聊天记录
- [渲染器与节点组件](/zh/guide/components)：选择代码块 / 图表 / 公式组件
- [故障排除](/zh/guide/troubleshooting)：排 CSS、peers 和 SSR
