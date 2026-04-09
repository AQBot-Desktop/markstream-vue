import type React from 'react'
import type { CodeBlockNode } from 'stream-markdown-parser'

export interface CodeBlockMonacoThemeObject {
  name: string
  base?: string
  inherit?: boolean
  colors?: Record<string, string>
  rules?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export type CodeBlockMonacoTheme = string | CodeBlockMonacoThemeObject

export type CodeBlockMonacoLanguage = string | ((...args: any[]) => unknown)

export interface CodeBlockDiffHideUnchangedRegionsOptions {
  enabled?: boolean
  contextLineCount?: number
  minimumLineCount?: number
  revealLineCount?: number
}

export type CodeBlockDiffHideUnchangedRegions
  = | boolean
    | CodeBlockDiffHideUnchangedRegionsOptions

export type CodeBlockDiffLineStyle = 'background' | 'bar'

export type CodeBlockDiffAppearance = 'auto' | 'light' | 'dark'

export type CodeBlockDiffUnchangedRegionStyle = 'line-info' | 'line-info-basic' | 'metadata' | 'simple'

export type CodeBlockDiffHunkActionKind = 'revert' | 'stage'

export type CodeBlockDiffHunkSide = 'upper' | 'lower'

export interface CodeBlockDiffHunkActionContext {
  action: CodeBlockDiffHunkActionKind
  side: CodeBlockDiffHunkSide
  lineChange: unknown
  originalModel: unknown
  modifiedModel: unknown
}

export interface CodeBlockMonacoOptions {
  MAX_HEIGHT?: number | string
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  tabSize?: number
  readOnly?: boolean
  wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded' | string
  wrappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent' | string
  theme?: string
  themes?: CodeBlockMonacoTheme[]
  languages?: CodeBlockMonacoLanguage[]
  renderSideBySide?: boolean
  useInlineViewWhenSpaceIsLimited?: boolean
  enableSplitViewResizing?: boolean
  ignoreTrimWhitespace?: boolean
  maxComputationTime?: number
  diffAlgorithm?: string
  renderIndicators?: boolean
  originalEditable?: boolean
  revealDebounceMs?: number
  revealStrategy?: 'bottom' | 'centerIfOutside' | 'center'
  revealBatchOnIdleMs?: number
  updateThrottleMs?: number
  diffUpdateThrottleMs?: number
  diffAutoScroll?: boolean
  diffHideUnchangedRegions?: CodeBlockDiffHideUnchangedRegions
  diffLineStyle?: CodeBlockDiffLineStyle
  diffAppearance?: CodeBlockDiffAppearance
  diffUnchangedRegionStyle?: CodeBlockDiffUnchangedRegionStyle
  diffHunkActionsOnHover?: boolean
  diffHunkHoverHideDelayMs?: number
  onDiffHunkAction?: (context: CodeBlockDiffHunkActionContext) => void | boolean | Promise<void | boolean>
  scrollbar?: Record<string, any>
  [key: string]: any
}

export interface CodeBlockActionContext {
  collapsed: boolean
  copied: boolean
  expanded: boolean
  fontSize: number
  defaultFontSize: number
  isDark: boolean
  language: string
  displayLanguage: string
  languageIcon: string
  isPreviewable: boolean
  code: string
  toggleCollapse: () => void
  copy: () => Promise<void>
  toggleExpand: () => void
  setFontSize: (size: number) => void
  resetFontSize: () => void
  decreaseFontSize: () => void
  increaseFontSize: () => void
  previewCode: () => void
}

export interface CodeBlockNodeProps {
  node: CodeBlockNode
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  darkTheme?: CodeBlockMonacoTheme
  lightTheme?: CodeBlockMonacoTheme
  isShowPreview?: boolean
  monacoOptions?: CodeBlockMonacoOptions
  enableFontSizeControl?: boolean
  minWidth?: string | number
  maxWidth?: string | number
  themes?: CodeBlockMonacoTheme[]
  showHeader?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showCollapseButton?: boolean
  showFontSizeButtons?: boolean
  showTooltips?: boolean
  customId?: string
  renderHeaderActions?: (context: CodeBlockActionContext) => React.ReactNode
  renderHeader?: (context: CodeBlockActionContext) => React.ReactNode
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

export interface MermaidBlockActionContext {
  collapsed: boolean
  copied: boolean
  showSource: boolean
  modalOpen: boolean
  isDark: boolean
  code: string
  mermaidAvailable: boolean
  isExportDisabled: boolean
  zoom: number
  toggleCollapse: () => void
  copy: () => void
  exportSvg: () => void
  toggleFullscreen: () => void
  switchMode: (mode: 'preview' | 'source') => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export interface MermaidBlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
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
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showCollapseButton?: boolean
  showZoomControls?: boolean
  enableWheelZoom?: boolean
  isStrict?: boolean
  showTooltips?: boolean
  onRenderError?: (error: unknown, code: string, container: HTMLElement) => boolean | void
  renderHeader?: (ctx: MermaidBlockActionContext) => React.ReactNode
  renderHeaderActions?: (ctx: MermaidBlockActionContext) => React.ReactNode
  renderModeToggle?: (ctx: MermaidBlockActionContext) => React.ReactNode
  renderZoomControls?: (ctx: MermaidBlockActionContext) => React.ReactNode
}

export interface MermaidBlockEvent<TPayload = any> {
  payload?: TPayload
  defaultPrevented: boolean
  preventDefault: () => void
  svgElement?: SVGElement | null
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

export interface InfographicBlockActionContext {
  collapsed: boolean
  copied: boolean
  showSource: boolean
  modalOpen: boolean
  isDark: boolean
  code: string
  isExportDisabled: boolean
  zoom: number
  toggleCollapse: () => void
  copy: () => void
  exportSvg: () => void
  toggleFullscreen: () => void
  switchMode: (mode: 'preview' | 'source') => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export interface InfographicBlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  loading?: boolean
  isDark?: boolean
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showCollapseButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showZoomControls?: boolean
  renderHeader?: (ctx: InfographicBlockActionContext) => React.ReactNode
  renderHeaderActions?: (ctx: InfographicBlockActionContext) => React.ReactNode
  renderModeToggle?: (ctx: InfographicBlockActionContext) => React.ReactNode
  renderZoomControls?: (ctx: InfographicBlockActionContext) => React.ReactNode
}
