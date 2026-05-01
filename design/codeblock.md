# CodeBlock 主题架构

> 核心决策：Shell（外壳）与内容渲染器**严格分离**。Shell 走 token，渲染器各自管理。

---

## 整体架构

### Shell + Renderer 分离

```
内置模式（自动套 Shell）：

  ┌─ CodeBlockShell ──────────────────────────┐
  │  header: 标题、语言标签、操作按钮          │  ← token 驱动
  │  border / shadow / 圆角                    │
  │  折叠/展开                                 │
  │  骨架屏                                    │
  │                                             │
  │  ┌─ Renderer（可替换） ─────────────────┐  │
  │  │  Monaco / Shiki / <pre>              │  │  ← 渲染器自治
  │  └─────────────────────────────────────┘  │
  └────────────────────────────────────────────┘

自定义模式（无 Shell，用户全权控制）：

  ┌─ UserComponent ────────────────────────────┐
  │  用户自己实现全部 UI                        │
  └────────────────────────────────────────────┘
```

### 三档内置渲染器

| 模式 | 渲染器 | Shell | 特点 | 选择方式 |
|---|---|---|---|---|
| Monaco | CodeBlockNode | **有** | 完整编辑器，语法高亮，diff | 默认 |
| Shiki | MarkdownCodeBlockNode | **有** | 轻量高亮，无编辑器，适合大量只读展示 | `setCustomComponents` 注册 |
| Pre | PreCodeNode | **无** | 纯 `<pre><code>`，无高亮，超轻量 | `renderCodeBlocksAsPre: true` |

CodeBlockNode 和 MarkdownCodeBlockNode 共享 `CodeBlockShell`（header、操作按钮、骨架屏、折叠）。
PreCodeNode 有意不套 Shell — 它是超轻量选项，不需要 header/按钮。需要这些功能应使用 Shiki 或 Monaco 模式。

### 自定义组件

通过 `setCustomComponents({ code_block: UserComponent })` 注册的组件：
- **不套 Shell**，直接渲染
- 用户全权控制 UI，库不干预
- 可选择通过 slot 或 composable 自行引入 Shell 能力（如果需要）

---

## Shell 与 Monaco 渲染器的边界

以下仅针对 Monaco 渲染器（CodeBlockNode）的内部架构：

```
┌─ Shell（token 驱动）─────────────────────────┐
│  header / 操作按钮 / 骨架屏 / diff 外框       │
│                                               │
│  ┌─ Monaco 渲染器（Monaco 主题自治）────────┐ │
│  │  编辑器背景/前景、语法高亮               │ │
│  │  行号、选区背景                          │ │
│  │  diff 行背景、内联高亮、gutter 标记      │ │
│  └──────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

---

## 边界规则（每个元素只归一个区域）

### Shell 区域 — 页面主题 token

| 元素 | token | 说明 |
|---|---|---|
| 容器边框 | `var(--code-border)` | |
| **Header 背景** | `var(--code-header-bg)` | **改动：不再使用 `--vscode-editor-background`** |
| **Header 文字** | `var(--code-fg)` | **改动：不再使用 `--vscode-editor-foreground`** |
| 操作按钮默认色 | `var(--code-action-fg)` | |
| 操作按钮 hover | `var(--code-action-hover-bg/fg)` | **改动：不再使用 `--vscode-editor-selectionBackground`** |
| 操作按钮 active | `var(--code-action-active-bg/fg)` | 模式切换活跃态 |
| 骨架屏 | `var(--loading-shimmer)` | **改动：不再受 `.is-dark` 影响** |
| Diff 外框/阴影 | `var(--code-border)` 等 | |
| Diff 标题栏 | `var(--code-header-bg)` | |

**规则**：Shell 元素只用 `var(--code-*)` 和 `var(--ms-*)` token。不引用任何 `--vscode-*` 变量。
跟随页面 `.dark` 自动切换，无需 `.is-dark`。

### Monaco 区域 — Monaco 主题自治

| 元素 | 取值来源 | 说明 |
|---|---|---|
| 编辑器背景/前景 | Monaco theme | `--vscode-editor-background/foreground` |
| 语法高亮色 | Monaco theme | 完全由 Monaco token colors 决定 |
| 行号色 | Monaco theme | `--vscode-editorLineNumber-foreground` |
| 选区背景 | Monaco theme | `--vscode-editor-selectionBackground` |
| Diff 行背景 | 基于 Monaco 明暗 | `.is-dark` 切换 opacity |
| Diff 内联高亮 | 基于 Monaco 明暗 | `.is-dark` 切换 opacity |
| Gutter 标记 | 基于 Monaco 明暗 | `.is-dark` 切换 opacity |

**规则**：Monaco 区域由 Monaco 主题 + `.is-dark` class 驱动。diff 基色（色相）仍来自全局
`--ms-diff-added` / `--ms-diff-removed`，但 opacity 和阴影深度由 `.is-dark` 控制。

---

## Monaco 主题 Props 设计

### 统一为单个 `theme` prop

取代现有的 `darkTheme` + `lightTheme` + 新增的 `forceTheme` 三 prop 设计，
合并为一个灵活的 `theme` prop：

```ts
type CodeBlockTheme = string | MonacoThemeObject

interface CodeBlockProps {
  /**
   * Monaco 主题配置。
   *
   * - 字符串 / 对象：固定主题，不随页面明暗切换
   *   theme="monokai"
   *   theme={...customThemeObject}
   *
   * - { light, dark } 配对：随页面明暗自动切换
   *   theme={{ light: 'github-light', dark: 'one-dark-pro' }}
   *
   * - 未指定：使用内置默认 light/dark 主题
   */
  theme?: CodeBlockTheme | { light: CodeBlockTheme, dark: CodeBlockTheme }
}
```

### 切换逻辑

```ts
const activeTheme = computed(() => {
  const t = props.theme
  if (!t) {
    // 未指定：内置默认
    return isDark.value ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME
  }
  if (typeof t === 'string' || isThemeObject(t)) {
    // 单主题：固定使用，不切换
    return t
  }
  // 配对：按页面明暗切换
  return isDark.value ? t.dark : t.light
})
```

### 用法示例

```html
<!-- 自动切换（大多数场景） -->
<CodeBlock :theme="{ light: 'github-light', dark: 'one-dark-pro' }" />

<!-- 固定主题（不随页面切换） -->
<CodeBlock theme="monokai" />

<!-- 默认（内置 light/dark） -->
<CodeBlock />
```

### 向后兼容

保留 `darkTheme` / `lightTheme` prop 作为 deprecated alias：

```ts
const resolvedThemeProp = computed(() => {
  if (props.theme)
    return props.theme
  // 向后兼容
  if (props.darkTheme || props.lightTheme) {
    return { light: props.lightTheme ?? DEFAULT_LIGHT, dark: props.darkTheme ?? DEFAULT_DARK }
  }
  return undefined
})
```

---

## `.is-dark` 的角色

### 触发规则

```ts
const editorSurfaceIsDark = computed(() => {
  const t = activeTheme.value
  // 配对模式：跟随页面
  if (!props.theme || isPairedTheme(props.theme))
    return isDark.value
  // 单主题模式：检测主题名/亮度
  return detectThemeDarkness(t)
})
```

### 检测主题明暗

```ts
function detectThemeDarkness(theme: CodeBlockTheme): boolean {
  if (typeof theme === 'string')
    return themeLooksDark(theme)
  // 主题对象：检测 background 色的亮度
  if (theme.colors?.['editor.background']) {
    return getLuminance(theme.colors['editor.background']) < 128
  }
  // 兜底
  return isDark.value
}
```

### `.is-dark` 只作用于 Monaco 区域

`.is-dark` class **只影响**编辑器内部和 diff 行/gutter 的 opacity 系数。
Shell 元素（header、按钮、边框、骨架屏）**完全不受** `.is-dark` 影响。

---

## Diff stage 背景层

**决策：移除 `--markstream-diff-stage-bg` 渐变，直接使用编辑器背景。**

```css
/* 之前 */
.code-block-container.is-diff .code-editor-layer {
  background: var(--markstream-diff-stage-bg); /* 复杂渐变 */
}

/* 之后 */
.code-block-container.is-diff .code-editor-layer {
  background: transparent; /* Monaco 自己控制背景 */
}
```

简化层级，避免 Shell token 渐变和 Monaco 背景色叠加不协调。

---

## `--markstream-diff-*` 变量归属

### 归 Shell（迁移到 token / 删除）

| 变量 | 处理 |
|---|---|
| `--markstream-diff-frame-border` | → `var(--code-border)` |
| `--markstream-diff-frame-shadow` | → 基于 `hsl(var(--ms-foreground) / ...)` |
| `--markstream-diff-shell-*` | → token 化 |
| `--markstream-diff-header-border` | → `var(--code-border)` |
| `--markstream-diff-stage-bg` | → **删除**（stage 背景移除） |
| `--markstream-diff-focus` | → `var(--focus-ring)` |
| `--markstream-diff-action-hover` | → `var(--code-action-hover-bg)` |
| `--markstream-diff-panel-bg*` | → token 化 |
| `--markstream-diff-panel-border` | → token 化 |
| `--markstream-diff-pane-divider` | → token 化 |
| `--markstream-diff-widget-shadow` | → 基于 `hsl(var(--ms-foreground) / ...)` |

### 归 Monaco（保留组件内，跟随 `.is-dark`）

| 变量 | 原因 |
|---|---|
| `--markstream-diff-editor-bg/fg` | 匹配 Monaco 表面 |
| `--markstream-diff-added-fg/bg` | 匹配编辑器表面亮度 |
| `--markstream-diff-removed-fg/bg` | 匹配编辑器表面亮度 |
| `--markstream-diff-added/removed-inline` | 匹配编辑器表面亮度 |
| `--markstream-diff-added/removed-gutter` | 匹配编辑器表面亮度 |
| `--markstream-diff-line-number*` | 匹配 Monaco 行号色 |
| `--markstream-diff-unchanged-*` | 匹配编辑器表面 |
| `--markstream-diff-gutter-*` | 匹配编辑器表面 |
| `--markstream-diff-added/removed-line-fill` | 匹配编辑器表面亮度 |

Diff 基色仍引用全局 token：`--ms-diff-added` / `--ms-diff-removed`。

---

## MarkdownCodeBlockNode 处理

### 现状

- 默认不使用，仅在用户通过 `setCustomComponents` 注册时生效
- 用 Shiki 渲染语法高亮（比 Monaco 轻量），不加载编辑器
- Shell 部分（header、操作按钮、骨架屏）与 CodeBlockNode **大量重复**
- 已作为公开 API 导出

### 决策：保留，接入共享 Shell

Shiki 版本服务于**大量只读代码展示**场景（如文档站、博客、教程），
这类场景下加载 Monaco 编辑器不合理（包体积大、初始化慢、无需编辑功能）。

**重构方向**：所有内置渲染器接入共享 Shell

```
CodeBlockShell（共享）
├─ header（标题、语言图标、操作按钮）
├─ 边框 / 圆角 / 阴影
├─ 骨架屏
├─ 折叠/展开
└─ token 体系接入
└─ slot: 内容区域 → 由渲染器填充

三档内置渲染器：
  Shell + CodeBlockNode（Monaco）       ← 默认
  Shell + MarkdownCodeBlockNode（Shiki） ← 轻量高亮
  Shell + PreCodeNode（<pre>）           ← 纯文本

自定义组件（setCustomComponents）：
  → 不套 Shell，直接渲染，用户全权控制
```

步骤：
1. 抽取 Shell 为共享子组件（header、按钮、骨架屏、折叠逻辑）
2. CodeBlockNode、MarkdownCodeBlockNode、PreCodeNode 各自作为 Shell 的内容渲染器
3. 三者的 `theme` prop 设计保持一致（字符串 = 固定，`{ light, dark }` = 配对）
4. NodeRenderer 路由逻辑：内置组件走 Shell 包裹，自定义组件直接渲染
5. MarkdownCodeBlockNode 的 Shiki 主题切换与 CodeBlockNode 的 Monaco 主题切换对齐

---

## 已识别的边界问题及处理

| 问题 | 决策 |
|---|---|
| Header 当前用 `--vscode-*` 颜色 | **改为 token**。Header 归 Shell，用 `--code-header-bg/fg` |
| 操作按钮 hover 用 `--vscode-editor-selectionBackground` | **改为 token**。用 `--code-action-hover-bg` |
| 骨架屏受 `.is-dark` 影响 | **改为纯 token**。骨架屏归 Shell，不看 `.is-dark` |
| 折叠时 CSS 变量仍活跃 | **可接受**。`v-show` 隐藏但变量不影响其他元素 |
| `resolvedChromeIsDark` 命名 | **重命名为 `editorSurfaceIsDark`** |
| 主题名字符串检测不精确 | **增加对象主题亮度检测**（读取 `editor.background`） |
| `syncEditorCssVars` 跨边界同步 | **限制范围**。仅同步到 Monaco 容器内，不上浮到根元素 |
| Diff stage 渐变背景 | **删除**。让 Monaco 自己控制背景 |

---

## 实施步骤

| 阶段 | 内容 |
|---|---|
| 1 | **Header 归 Shell**：移除 `headerStyle` 中的 `--vscode-*` 引用，改用 token |
| 2 | **按钮归 Shell**：hover 改用 `--code-action-hover-bg`，移除 `--vscode-*` |
| 3 | **骨架屏归 Shell**：移除 `.is-dark .skeleton-line` 规则 |
| 4 | **Diff stage 简化**：移除 `--markstream-diff-stage-bg` 渐变 |
| 5 | **Shell diff 变量 token 化**：将 Shell 归属变量替换为 token 引用 |
| 6 | **限制 `syncEditorCssVars`**：不再将 `--vscode-*` 同步到根容器 |
| 7 | **实现 `theme` prop**：统一 API，向后兼容 `darkTheme`/`lightTheme` |
| 8 | **重命名 `.is-dark` 推导**：`resolvedChromeIsDark` → `editorSurfaceIsDark`，增加对象主题检测 |
| 9 | **抽取共享 Shell**：CodeBlockShell.vue — header / 按钮 / 骨架屏 / 折叠，内容区域用 slot |
| 10 | **CodeBlockNode + MarkdownCodeBlockNode 接入 Shell**：PreCodeNode 不套 Shell（超轻量设计意图） |
| 11 | NodeRenderer 路由不变 — Shell 内嵌在各组件中，自定义组件直接渲染 |
