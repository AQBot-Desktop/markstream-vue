import { resetLastAppliedThemeKey, scheduleMonacoThemeUpdate } from './monacoThemeScheduler'

type MonacoTheme = any
type SetThemeFn = (theme: MonacoTheme, force?: boolean) => Promise<void> | void

let desiredTheme: MonacoTheme | null = null
let desiredKey: string | null = null
let setThemeImpl: SetThemeFn | null = null
const listeners = new Set<() => void>()

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

function notify() {
  for (const listener of Array.from(listeners)) {
    try {
      listener()
    }
    catch {}
  }
}

export function subscribeMonacoThemeApplied(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function registerMonacoThemeSetter(setTheme: SetThemeFn | null | undefined) {
  if (typeof setTheme !== 'function')
    return
  const isNewSetter = setThemeImpl !== setTheme
  setThemeImpl = setTheme
  if (isNewSetter) {
    resetLastAppliedThemeKey()
  }
  console.log('[AQBot Theme Debug] registry: new setter registered, desiredKey:', desiredKey, 'isNew:', isNewSetter)
  if (desiredTheme != null && desiredKey != null) {
    void scheduleMonacoThemeUpdate(desiredTheme, setThemeImpl)
      .then(() => notify())
      .catch(() => {})
  }
}

export function setDesiredMonacoTheme(theme: MonacoTheme | null | undefined) {
  if (theme == null)
    return
  const key = themeKey(theme)
  if (!key)
    return
  if (desiredKey === key) {
    console.log('[AQBot Theme Debug] registry: desiredKey === key, skipping:', key)
    return
  }
  desiredTheme = theme
  desiredKey = key
  console.log('[AQBot Theme Debug] registry: setDesiredMonacoTheme:', key, 'hasImpl:', !!setThemeImpl)
  if (!setThemeImpl)
    return
  void scheduleMonacoThemeUpdate(desiredTheme, setThemeImpl)
    .then(() => notify())
    .catch(() => {})
}

export function getDesiredMonacoTheme(): MonacoTheme | null {
  return desiredTheme
}
