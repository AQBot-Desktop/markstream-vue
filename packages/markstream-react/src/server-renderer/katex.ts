import { normalizeKaTeXRenderInput } from '../utils/normalizeKaTeXRenderInput'

let katexModule: any | undefined
let katexLoadAttempted = false

function getRequire() {
  try {
    const processWithBuiltins = Reflect.get(globalThis, 'process') as {
      getBuiltinModule?: (specifier: string) => any
    } | undefined
    const moduleApi = typeof processWithBuiltins?.getBuiltinModule === 'function'
      ? processWithBuiltins.getBuiltinModule('module')
      : null
    return typeof moduleApi?.createRequire === 'function'
      ? moduleApi.createRequire(import.meta.url)
      : null
  }
  catch {
    return null
  }
}

function loadKatex() {
  if (katexModule)
    return katexModule
  if (katexLoadAttempted)
    return null

  katexLoadAttempted = true

  try {
    const require = getRequire()
    if (!require)
      return null
    const katex = require('katex')
    try {
      require('katex/contrib/mhchem')
    }
    catch {
      // optional extension
    }
    katexModule = katex
    return katexModule
  }
  catch {
    return null
  }
}

export function renderKatexToHtml(
  content: string,
  displayMode: boolean,
  throwOnError: boolean,
) {
  const normalizedContent = normalizeKaTeXRenderInput(content)
  if (!normalizedContent)
    return null
  if ((globalThis as any).__MARKSTREAM_REACT_DISABLE_SYNC_KATEX__)
    return null

  const katex = loadKatex()
  if (!katex)
    return null

  try {
    return katex.renderToString(normalizedContent, {
      displayMode,
      throwOnError,
    })
  }
  catch {
    return null
  }
}
