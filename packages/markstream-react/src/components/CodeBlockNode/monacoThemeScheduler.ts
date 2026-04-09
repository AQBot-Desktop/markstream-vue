type MonacoTheme = any
type SetThemeFn = (theme: MonacoTheme, force?: boolean) => Promise<void> | void

let setThemeImpl: SetThemeFn | null = null
let applying = false
let inFlight: Promise<void> | null = null
let inFlightKey: string | null = null
let pendingTheme: MonacoTheme | null = null
let pendingKey: string | null = null
let lastAppliedKey: string | null = null

const themeKeyCache = new WeakMap<object, string>()
let themeKeySeq = 0

function themeKey(theme: MonacoTheme): string | null {
  if (theme == null)
    return null
  if (typeof theme === 'string')
    return theme
  if (typeof theme === 'object' && theme && 'name' in theme)
    return String((theme as any).name)
  if (typeof theme === 'object') {
    const cached = themeKeyCache.get(theme)
    if (cached)
      return cached
    try {
      const str = JSON.stringify(theme)
      if (str) {
        themeKeyCache.set(theme, str)
        return str
      }
    }
    catch {}
    const id = `__theme_${++themeKeySeq}`
    themeKeyCache.set(theme, id)
    return id
  }
  return String(theme)
}

export function resetLastAppliedThemeKey() {
  lastAppliedKey = null
}

export function scheduleMonacoThemeUpdate(theme: MonacoTheme, setTheme: SetThemeFn): Promise<void> {
  const key = themeKey(theme)
  if (!key)
    return Promise.resolve()

  if (setThemeImpl !== setTheme)
    setThemeImpl = setTheme

  if (!applying && lastAppliedKey === key) {
    console.log('[AQBot Theme Debug] scheduler: skipping, lastAppliedKey === key:', key)
    return Promise.resolve()
  }

  if (inFlight && (pendingKey === key || inFlightKey === key))
    return inFlight

  pendingTheme = theme
  pendingKey = key

  if (inFlight)
    return inFlight

  applying = true
  inFlight = (async () => {
    while (pendingTheme != null && pendingKey != null) {
      const nextTheme = pendingTheme
      const nextKey = pendingKey
      pendingTheme = null
      pendingKey = null
      if (lastAppliedKey === nextKey)
        continue
      const impl = setThemeImpl
      if (!impl)
        break
      try {
        inFlightKey = nextKey
        console.log('[AQBot Theme Debug] scheduler: applying theme:', nextKey)
        await Promise.resolve(impl(nextTheme))
        lastAppliedKey = nextKey
        console.log('[AQBot Theme Debug] scheduler: applied successfully:', nextKey)
      }
      catch (err) {
        console.error('[AQBot Theme Debug] scheduler: apply failed:', nextKey, err)
      }
    }
  })().finally(() => {
    applying = false
    inFlight = null
    inFlightKey = null
  })

  return inFlight
}
