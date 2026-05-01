// Centralized exported props interfaces for components
import type { CodeBlockNode } from 'stream-markdown-parser'

/**
 * Monaco theme name or a lightweight theme object accepted by `stream-monaco`.
 *
 * Keep this intentionally local so `markstream-vue` does not force consumers to
 * install `stream-monaco` just to resolve exported types.
 */
export interface CodeBlockMonacoThemeObject {
  name: string
  base?: string
  inherit?: boolean
  colors?: Record<string, string>
  rules?: Array<Record<string, unknown>>
  [key: string]: unknown
}

/**
 * Theme entries forwarded to Monaco-backed code blocks.
 */
export type CodeBlockMonacoTheme = string | CodeBlockMonacoThemeObject

/**
 * Unified theme prop for code blocks.
 *
 * - `string` or `CodeBlockMonacoThemeObject`: fixed theme, ignores page dark/light
 * - `{ light, dark }`: auto-switches based on page isDark
 */
export type CodeBlockThemeProp = CodeBlockMonacoTheme | { light: CodeBlockMonacoTheme, dark: CodeBlockMonacoTheme }

/**
 * Common language entry accepted by `stream-monaco`.
 *
 * The runtime also supports advanced lazy-loader signatures; keep the union
 * broad here so hover remains useful without depending on `stream-monaco`.
 */
export type CodeBlockMonacoLanguage = string | ((...args: any[]) => unknown)

/**
 * Object form of Monaco's unchanged-region folding settings.
 */
export interface CodeBlockDiffHideUnchangedRegionsOptions {
  /** Enable unchanged-region folding for diff editors. */
  enabled?: boolean
  /** Number of context lines to keep visible around each change. */
  contextLineCount?: number
  /** Minimum unchanged span required before a region can collapse. */
  minimumLineCount?: number
  /** Number of lines to reveal when the user expands a collapsed region. */
  revealLineCount?: number
}

export type CodeBlockDiffHideUnchangedRegions
  = | boolean
    | CodeBlockDiffHideUnchangedRegionsOptions

/**
 * Visual treatment for changed diff lines.
 */
export type CodeBlockDiffLineStyle = 'background' | 'bar'

/**
 * Shell appearance for the Monaco diff surface.
 */
export type CodeBlockDiffAppearance = 'auto' | 'light' | 'dark'

/**
 * Rendering style for collapsed unchanged diff regions.
 */
export type CodeBlockDiffUnchangedRegionStyle = 'line-info' | 'line-info-basic' | 'metadata' | 'simple'

/**
 * Action names emitted by Monaco diff hunk hover controls.
 */
export type CodeBlockDiffHunkActionKind = 'revert' | 'stage'

/**
 * Which half of the diff hunk triggered the action.
 */
export type CodeBlockDiffHunkSide = 'upper' | 'lower'

/**
 * Minimal action context forwarded from `stream-monaco`.
 *
 * Use `action` and `side` for the stable contract. The model payloads are kept
 * intentionally loose to avoid introducing `stream-monaco` or Monaco types into
 * `markstream-vue`'s public declarations.
 */
export interface CodeBlockDiffHunkActionContext {
  /** The requested hunk action. */
  action: CodeBlockDiffHunkActionKind
  /** Which hunk half triggered the action. */
  side: CodeBlockDiffHunkSide
  /** Raw Monaco diff metadata for the current hunk. */
  lineChange: unknown
  /** Original Monaco model for the diff editor. */
  originalModel: unknown
  /** Modified Monaco model for the diff editor. */
  modifiedModel: unknown
}

/**
 * Monaco editor options forwarded by `CodeBlockNode`.
 *
 * This mirrors the most common `stream-monaco` options used in markstream-vue's
 * docs and examples while leaving the index signature available for advanced
 * options not modeled here yet.
 */
export interface CodeBlockMonacoOptions {
  /** Maximum editor height before the code block starts scrolling internally. */
  MAX_HEIGHT?: number | string
  /** Base font size for Monaco-rendered code. */
  fontSize?: number
  /** Explicit line height for the Monaco editor. */
  lineHeight?: number
  /** Font family override applied to the Monaco editor surface. */
  fontFamily?: string
  /** Tab width forwarded to Monaco. */
  tabSize?: number
  /** Vertical padding forwarded to Monaco. */
  padding?: { top?: number, bottom?: number }
  /** Render the Monaco editor in read-only mode. */
  readOnly?: boolean
  /** Monaco word-wrap mode for long lines. */
  wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded' | string
  /** Indentation strategy used when wrapping long lines. */
  wrappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent' | string
  /** Monaco theme name to apply on initial render. */
  theme?: string
  /** Theme names or theme objects available for this code block. */
  themes?: CodeBlockMonacoTheme[]
  /**
   * Language ids or lazy loaders to register with `stream-monaco`.
   *
   * Supplying this array replaces the default built-in language list.
   */
  languages?: CodeBlockMonacoLanguage[]
  /** Render diff editors side-by-side instead of inline. */
  renderSideBySide?: boolean
  /** Allow Monaco to fall back to inline diff mode when the editor is narrow. */
  useInlineViewWhenSpaceIsLimited?: boolean
  /** Allow resizing the split handle in side-by-side diff mode. */
  enableSplitViewResizing?: boolean
  /** Keep whitespace-only changes visible in Monaco diff editors. */
  ignoreTrimWhitespace?: boolean
  /** Disable Monaco's diff computation timeout for large diffs when needed. */
  maxComputationTime?: number
  /** Choose Monaco's diff algorithm. */
  diffAlgorithm?: string
  /** Show change indicators in the gutter. */
  renderIndicators?: boolean
  /** Allow editing the original side of a diff editor. */
  originalEditable?: boolean
  /** Debounce repeated reveal requests while content is streaming. */
  revealDebounceMs?: number
  /** How Monaco should reveal the active line while auto-scrolling. */
  revealStrategy?: 'bottom' | 'centerIfOutside' | 'center'
  /** Delay a final reveal until streaming settles for this many milliseconds. */
  revealBatchOnIdleMs?: number
  /** Extra throttle window for normal `updateCode` calls. */
  updateThrottleMs?: number
  /** Extra throttle window for diff streaming updates. */
  diffUpdateThrottleMs?: number
  /** Enable automatic scrolling on the modified side of diff editors. */
  diffAutoScroll?: boolean
  /** Fold unchanged diff regions with Monaco's diff viewer. */
  diffHideUnchangedRegions?: CodeBlockDiffHideUnchangedRegions
  /** Visual emphasis used for changed diff lines. */
  diffLineStyle?: CodeBlockDiffLineStyle
  /** Light/dark chrome mode for Monaco's diff shell. */
  diffAppearance?: CodeBlockDiffAppearance
  /** Visual style used for collapsed unchanged diff regions. */
  diffUnchangedRegionStyle?: CodeBlockDiffUnchangedRegionStyle
  /** Show per-hunk hover actions such as `revert` and `stage`. */
  diffHunkActionsOnHover?: boolean
  /** Delay before diff hover action widgets hide after mouse leave. */
  diffHunkHoverHideDelayMs?: number
  /**
   * Intercept diff hunk hover actions before `stream-monaco` applies its
   * default local model edits. Return `false` to skip the built-in behavior.
   */
  onDiffHunkAction?: (context: CodeBlockDiffHunkActionContext) => void | boolean | Promise<void | boolean>
  scrollbar?: Record<string, any>
  [key: string]: any
}

export interface CodeBlockNodeProps {
  node: CodeBlockNode
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  /**
   * Unified theme configuration.
   * - `string` or theme object: fixed theme, ignores page dark/light switch
   * - `{ light, dark }`: auto-switches based on `isDark`
   * - When omitted, falls back to `darkTheme`/`lightTheme` props
   */
  theme?: CodeBlockThemeProp
  /** @deprecated Use `theme` prop instead. Kept for backward compatibility. */
  darkTheme?: CodeBlockMonacoTheme
  /** @deprecated Use `theme` prop instead. Kept for backward compatibility. */
  lightTheme?: CodeBlockMonacoTheme
  isShowPreview?: boolean
  /** Monaco editor and diff behavior forwarded to `stream-monaco`. */
  monacoOptions?: CodeBlockMonacoOptions
  enableFontSizeControl?: boolean
  minWidth?: string | number
  maxWidth?: string | number
  /** Theme names or theme objects preloaded for this code block instance. */
  themes?: CodeBlockMonacoTheme[]
  showHeader?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showCollapseButton?: boolean
  showFontSizeButtons?: boolean
  showTooltips?: boolean
  /** Scope key used by `setCustomComponents()` and `data-custom-id` style overrides. */
  customId?: string
}

export interface ImageNodeProps {
  node: {
    type: 'image'
    src: string
    alt: string
    title: string | null
    raw: string
    loading?: boolean
  }
  fallbackSrc?: string
  lazy?: boolean
  usePlaceholder?: boolean
}

export interface LinkNodeProps {
  node: {
    type: 'link'
    href: string
    title: string | null
    text: string
    attrs?: [string, string][]
    children: { type: string, raw: string }[]
    raw: string
    loading?: boolean
  }
  indexKey: number | string
  customId?: string
  showTooltip?: boolean
  color?: string
  underlineHeight?: number
  underlineBottom?: number | string
  animationDuration?: number
  animationOpacity?: number
  animationTiming?: string
  animationIteration?: string | number
}

export interface PreCodeNodeProps {
  node: CodeBlockNode
}

export interface MermaidBlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  estimatedPreviewHeightPx?: number
  loading?: boolean
  isDark?: boolean
  workerTimeoutMs?: number
  parseTimeoutMs?: number
  renderTimeoutMs?: number
  fullRenderTimeoutMs?: number
  renderDebounceMs?: number
  contentStableDelayMs?: number
  previewPollDelayMs?: number
  previewPollMaxDelayMs?: number
  previewPollMaxAttempts?: number
  // header customization
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showCollapseButton?: boolean
  showZoomControls?: boolean
  enableWheelZoom?: boolean
  // When false, relax all sanitization/security (not recommended)
  isStrict?: boolean
  showTooltips?: boolean
  // Custom error handler called when mermaid rendering fails.
  // Receives the error, the raw mermaid code, and the container element.
  // Return true to prevent the default error display.
  onRenderError?: (error: unknown, code: string, container: HTMLElement) => boolean | void
}

// Generic event wrapper used by MermaidBlockNode emits. Consumers can call
// `preventDefault()` to stop the component's default action.
export interface MermaidBlockEvent<TPayload = any> {
  payload?: TPayload
  defaultPrevented: boolean
  preventDefault: () => void
  // optional: direct access to the rendered SVG element (if available)
  svgElement?: SVGElement | null
  // optional: serialized SVG string (may be absent to avoid extra work)
  svgString?: string | null
}

export interface D2BlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  loading?: boolean
  isDark?: boolean
  progressiveRender?: boolean
  progressiveIntervalMs?: number
  themeId?: number | null
  darkThemeId?: number | null
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showCollapseButton?: boolean
}

export interface InfographicBlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  estimatedPreviewHeightPx?: number
  loading?: boolean
  isDark?: boolean
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showCollapseButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showZoomControls?: boolean
}

export interface MathBlockNodeProps {
  node: {
    type: 'math_block'
    content: string
    raw: string
    loading?: boolean
  }
}

export interface MathInlineNodeProps {
  node: {
    type: 'math_inline'
    content: string
    raw: string
    loading?: boolean
    markup?: string
  }
}
