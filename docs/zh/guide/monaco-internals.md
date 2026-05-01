# Monaco 内部实现

本文档介绍在 `markstream-vue` 中使用 `monaco-editor` 时的打包和运行时要点（用于在项目中集成大型编辑器时减少问题）。

## 安装

```bash
pnpm add stream-monaco
```

## Vite 打包建议
- Monaco 使用 Web Worker 来处理语法高亮与语言服务；在生产环境下需要正确的 worker 配置。
- 推荐使用 `vite-plugin-monaco-editor-esm` 或 `vite-plugin-monaco-editor` 来确保 worker 文件被正确打包。

示例：

```ts
import { defineConfig } from 'vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'

export default defineConfig({ plugins: [monacoEditorPlugin()] })
```

## 避免 `Failed to load Monaco worker` 错误
- 确认插件将 worker 文件打包到可访问的路径（可通过插件提供的 `customDistPath` 配置来控制）。
- 在构建产物中检查 worker 文件是否存在，并确认 CDN 或静态资源路径可访问。

如果你将 `markstream-vue` 发布为库，请确保使用者把 `stream-monaco` 作为 peer 依赖安装；否则在运行时找不到 Monaco worker 与 runtime。

## 运行时行为与性能
- 本库设计为当 `CodeBlockNode` 挂载时懒加载 Monaco，从而减少首次渲染时的包体积。仅在需要时才初始化 Monaco 编辑器。
- 在大量 CodeBlock 的页面中，启用 `viewportPriority` 或在父组件中延迟加载可以显著降低内存占用并提升首屏速度。
- 如果宿主应用希望更早预热 Monaco，请调用 `markstream-vue` 暴露的 `preloadCodeBlockRuntime()`，不要直接 import `stream-monaco` 做预热。这样 Monaco worker 预热和 markstream-vue 内部的代码块 runtime-ready 状态会保持一致。

## 打包到库的注意事项
- 当把本库打包进其他项目时，请在目标项目中正确配置 worker 路径或使用插件的选项来重新定位。
- 可在页面需要时调用 `preloadCodeBlockRuntime()` 预加载代码块运行时，以改善首次打开大型文档时的响应，并避免已预热后的代码块重新挂载时闪回 `<pre>` fallback。
- 已有代码如果使用 `getUseMonaco()`，可以保持不变；它也会设置相同的 runtime-ready 状态。

## 常见故障排查
- 如果看到 `Failed to load Monaco worker`，先在浏览器网络面板（Network）中检查 worker 文件的请求与响应；资源 404 或路径不正确通常就是问题所在。
- 如果在 SSR 场景报错，请确认 Monaco 仅在客户端初始化（使用动态导入或 `onMounted` 来隔离）。
