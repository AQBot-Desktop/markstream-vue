import type { CodeBlockMonacoOptions, CodeBlockMonacoTheme } from '../../types/component-props'
import { preload } from '../NodeRenderer/preloadMonaco'
import { markCodeBlockRuntimeReady } from './runtime'

export { isCodeBlockRuntimeReady } from './runtime'

export interface MonacoDisposableLike {
  dispose?: () => void
}

export interface MonacoModelLike {
  getLineCount?: () => number
}

export interface MonacoEditorViewLike {
  getModel?: () => MonacoModelLike | null | undefined
  getOption?: (option: unknown) => unknown
  updateOptions?: (options: Record<string, unknown>) => void
  layout?: () => void
  getContentHeight?: () => number
  onDidContentSizeChange?: (listener: () => void) => MonacoDisposableLike | void
  onDidLayoutChange?: (listener: () => void) => MonacoDisposableLike | void
}

export interface MonacoDiffLineChangeLike {
  originalStartLineNumber?: number
  originalEndLineNumber?: number
  modifiedStartLineNumber?: number
  modifiedEndLineNumber?: number
}

export interface MonacoDiffEditorViewLike extends MonacoEditorViewLike {
  getOriginalEditor?: () => MonacoEditorViewLike | null | undefined
  getModifiedEditor?: () => MonacoEditorViewLike | null | undefined
  getLineChanges?: () => MonacoDiffLineChangeLike[] | null | undefined
  onDidUpdateDiff?: (listener: () => void) => MonacoDisposableLike | void
}

export interface MonacoNamespaceLike {
  EditorOption?: {
    fontInfo?: unknown
    lineHeight?: unknown
  }
}

export interface MonacoRuntimeOptions extends Omit<CodeBlockMonacoOptions, 'theme'> {
  theme?: CodeBlockMonacoTheme
  themes?: CodeBlockMonacoTheme[]
  onThemeChange?: () => void
}

export interface MonacoHelpers {
  createEditor?: (container: HTMLElement, code: string, language: string) => Promise<unknown> | unknown
  createDiffEditor?: (container: HTMLElement, original: string, modified: string, language: string) => Promise<unknown> | unknown
  updateCode?: (code: string, language: string) => Promise<unknown> | unknown
  updateDiff?: (original: string, modified: string, language: string) => Promise<unknown> | unknown
  getEditor?: () => MonacoNamespaceLike | null
  getEditorView?: () => MonacoEditorViewLike | null
  getDiffEditorView?: () => MonacoDiffEditorViewLike | null
  cleanupEditor?: () => void
  safeClean?: () => void
  refreshDiffPresentation?: () => void
  setTheme?: (theme: CodeBlockMonacoTheme | undefined) => Promise<void> | void
}

export interface MonacoModule {
  useMonaco?: (options: MonacoRuntimeOptions) => MonacoHelpers | null | undefined
  detectLanguage?: (code: string) => string
  preloadMonacoWorkers?: () => Promise<unknown> | unknown
}

let mod: MonacoModule | null = null
let importFailed = false
let loadingPromise: Promise<MonacoModule | null> | null = null

export async function preloadCodeBlockRuntime() {
  const runtime = await getUseMonaco()
  return !!runtime
}

export async function getUseMonaco(): Promise<MonacoModule | null> {
  if (loadingPromise)
    return loadingPromise

  loadingPromise = (async () => {
    if (!mod) {
      if (importFailed)
        return null
      try {
        mod = await import('stream-monaco') as MonacoModule
      }
      catch {
        importFailed = true
        return null
      }
    }

    try {
      await preload(mod)
      markCodeBlockRuntimeReady()
      return mod
    }
    catch {
      // Keep the imported module cached so temporary preload failures can retry.
      return null
    }
  })()

  try {
    return await loadingPromise
  }
  finally {
    loadingPromise = null
  }
}
