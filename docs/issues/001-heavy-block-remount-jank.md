# Heavy block remount jank

| 字段 | 值 |
|------|-----|
| 优先级 | P1 |
| 分类 | renderer / heavy nodes / async components |
| 状态 | done |
| 创建日期 | 2026-04-30 |
| 关联文件 | `src/components/CodeBlockNode/CodeBlockNode.vue`、`src/components/CodeBlockNode/monaco.ts`、`src/components/CodeBlockNode/runtime.ts`、`src/components/MermaidBlockNode/MermaidBlockNode.vue`、`src/components/InfographicBlockNode/InfographicBlockNode.vue`、`src/components/NodeRenderer/NodeRenderer.vue`、`src/utils/diagramHeight.ts`、`src/types/component-props.ts`、`packages/markstream-vue2/src/components/NodeRenderer/NodeRenderer.vue`、`packages/markstream-vue2/src/utils/diagramHeight.ts`、`packages/markstream-react/src/renderers/renderNode.tsx`、`packages/markstream-angular/src/components/shared/node-outlet-helpers.ts` |

## 问题

使用虚拟滚动并恢复已保存 `scrollTop` 的上层应用，在重新挂载已经加载过的内容时，重型 Markdown block 会出现可见抖动。最明显的是以下几类节点：

- `CodeBlockNode` 重新挂载时先显示 `PreCodeNode`，再切换到 Monaco code block。
- `MermaidBlockNode` 在 async component resolve 前可能先出现空白或源码 fallback，再替换成图表。
- `InfographicBlockNode` 存在同类问题：async component 没有 loading shell，并且组件先以源码模式初始化，mounted 后才切到 preview。

这些行为对冷启动首次渲染是合理的，但对已加载内容的 remount 不稳定。上层虚拟滚动已经恢复了 `scrollTop` 后，block 的 DOM 结构和高度又发生变化，就会把下方正文推开，表现为闪烁、内容瞬移，或者落入虚拟列表 stale spacer 造成的空白区域。

这是 `markstream-vue` 层的问题。上层应用可以保存和恢复滚动位置，但如果组件首帧高度、fallback 模式和最终渲染结果不一致，应用层无法稳定消除这类抖动。

后续排查确认同类风险不只存在于 Vue 3 包。`markstream-vue2` 的 Mermaid/Infographic 仍然使用异步组件首帧空壳，`markstream-react` 和 `markstream-angular` 虽然没有同样的 async component 空壳，但 Mermaid/Infographic 首帧仍缺少稳定的高度估算，切换或刷新时也可能推动后续正文。

## 根因

- code block 是否显示 fallback 只依赖当前组件实例是否完成 editor mount，没有感知共享 Monaco runtime 是否已经预热完成。
- Mermaid 和 Infographic 使用默认 async component loading 行为，首帧没有预留最终图表容器的形态和高度。
- Mermaid 和 Infographic 的 preview 高度需要等真实 SVG/HTML 渲染后才能测量。
- Infographic 默认 `showSource = true`，loader 可用时再在 mounted 后切到 preview，导致 remount 时可能先显示源码或空白。
- loading shell 和最终 header 的 padding、图标、action button 占位不一致时，即使只有几像素差异，也会让图表下方正文产生可见位移。

## 修复

### CodeBlockNode

- 增加共享 code block runtime ready 状态和 `preloadCodeBlockRuntime()`。
- `getUseMonaco()` 在 Monaco 以及 preload 工作完成后标记 runtime ready。
- runtime 已 ready 的 warm remount 不再显示可见 `PreCodeNode` fallback。
- cold start 仍然保留 fallback，直到 editor mount 和初始高度稳定。
- editor 创建失败时继续显示 fallback，保证代码内容仍可读。
- 对齐 fallback 的 font size、line height、padding 和估算内容高度，减少 fallback 到 Monaco 过程中的高度变化。

### MermaidBlockNode

- 增加基于图表源码的 preview 高度估算。
- `NodeRenderer` 在调用方没有显式传入时自动注入 `estimatedPreviewHeightPx`。
- async component resolve 前立即渲染同形态 loading shell，包括 header 和预留 preview 区域。
- Mermaid loader 已启用时，组件直接以 preview 模式初始化，不再先显示源码。
- 最终 preview 在真实内容可用前使用估算高度作为下限。

### InfographicBlockNode

- 增加和 Mermaid 同类的 preview 高度估算与 async loading shell。
- Infographic loader 已启用时，组件直接以 preview 模式初始化。
- 最终 preview 在真实内容可用前使用估算高度作为下限。
- loading shell 的 header 尺寸与最终 header 对齐，包括图标和 action button 占位，避免 async component resolve 时推动下方正文。

### 多框架对齐

- `markstream-vue2` 补齐 Mermaid/Infographic 的高度估算、async loading shell 和 `estimatedPreviewHeightPx` 注入。
- `markstream-react` 在 client/server render path 中都为 Mermaid/Infographic 注入稳定高度估算，并让组件首帧使用该高度。
- `markstream-angular` 在 NodeOutlet custom inputs 和内置 Mermaid/Infographic 组件中使用同一套高度估算，避免 custom renderer 和 builtin renderer 表现不一致。
- React/Angular 的 CodeBlock/MarkdownCodeBlock 没有 Vue3 `PreCodeNode -> CodeBlockNode` 的同一条切换链路，本次只补图表高度稳定性，不改它们的 code block 架构。

## 为什么这样改

这次修复把责任放在产生不稳定 DOM 的组件内部：

- 上层应用负责保存滚动位置、恢复滚动位置、维护虚拟列表 row measurement。
- `markstream-vue` 负责让重型 block 的首帧 DOM 形态和高度尽量接近最终状态，避免破坏上层滚动恢复。

使用 loading shell 和 estimated height floor 比关闭虚拟滚动、或者要求每个应用分别特判 Mermaid/Infographic/CodeBlock 更收敛。optional peer fallback 行为也被保留：Mermaid、Infographic 或 Monaco 不可用时，仍然回退到可读的 preformatted code。

## 验证

库侧验证：

```bash
pnpm vitest run test/node-renderer-heavy-node-props.test.ts
pnpm vitest run test/vue2-node-renderer-heavy-node-props.test.ts
pnpm vitest run test/react-render-node-heavy-props.test.ts test/react-diagram-block-parity.test.tsx
pnpm vitest run test/markstream-angular-node-outlet.test.ts
pnpm vitest run test/code-block-editor-lock.test.ts
pnpm vitest run test/mermaid-streaming-preview-regression.test.ts
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

通过 `dimcode-app` workspace link 的集成验证：

```bash
pnpm test:e2e:scroll
DIMCODE_E2E_REAL_THREAD_IDS=924740a7-8e64-454b-b4bf-7a3b462ce6bf,s_1777337966876_0 pnpm test:e2e:scroll
pnpm --filter @dimcode/renderer typecheck
git diff --check
```

e2e 覆盖：

- 已加载 thread 来回切换后，保存的滚动位置不变化。
- 当前 thread 滚动后刷新，恢复到刷新前位置。
- code block warm remount 不出现可见 `PreCodeNode` fallback。
- Mermaid 和 code block 同时出现在可视区域时，切换和刷新后 row 位置、高度、header 和后续正文稳定。
- Infographic 和 code block 同时出现在可视区域时，切换和刷新后 row 位置、高度、header 和后续正文稳定。
