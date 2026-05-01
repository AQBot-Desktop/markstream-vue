function humanizeKey(key: string) {
  const s = key.split('.').pop() || key
  return s
    .replace(/[_-]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

const defaultMap: Record<string, string> = {
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.decrease': 'Decrease',
  'common.reset': 'Reset',
  'common.increase': 'Increase',
  'common.expand': 'Expand',
  'common.collapse': 'Collapse',
  'common.preview': 'Preview',
  'common.source': 'Source',
  'common.export': 'Export',
  'common.open': 'Open',
  'common.minimize': 'Minimize',
  'common.zoomIn': 'Zoom in',
  'common.zoomOut': 'Zoom out',
  'common.resetZoom': 'Reset zoom',
  'image.loadError': 'Image failed to load',
  'image.loading': 'Loading image...',

}

/**
 * Replace default fallback translations.
 * Consumers can call this to provide their own fallback translations (e.g. Chinese).
 */
export function setDefaultI18nMap(map: Partial<Record<keyof typeof defaultMap, string>>) {
  Object.assign(defaultMap, map)
}

interface Translator {
  t: (key: string) => string
  te?: (key: string) => boolean
}

const fallbackT = (key: string) => defaultMap[key] ?? humanizeKey(key)

function withFallback(translator: Translator) {
  return {
    t(key: string) {
      if (translator.te && defaultMap[key] && !translator.te(key))
        return fallbackT(key)

      const translated = translator.t(key)
      return translated === key && defaultMap[key] ? fallbackT(key) : translated
    },
  }
}

export function useSafeI18n() {
  // Synchronous fallback in case `vue-i18n` is not installed.
  // Vue 2 build avoids dynamic import; consumers can provide `$vueI18nUse`.
  try {
    // Try to use global installed vue-i18n if available synchronously via composition API
    // This will work when the consumer has set up vue-i18n and the bundler left
    // the runtime entry available. We access it via (global) require-ish path.
    // Keep this non-throwing.
    const possible = (globalThis as any).$vueI18nUse || null
    if (possible && typeof possible === 'function') {
      try {
        const i18n = possible()
        if (i18n && typeof i18n.t === 'function') {
          return withFallback({
            t: (i18n.t as any).bind(i18n),
            te: typeof i18n.te === 'function' ? (i18n.te as any).bind(i18n) : undefined,
          })
        }
      }
      catch {}
    }
  }
  catch {}

  // Vue 2 build: avoid dynamic importing vue-i18n to prevent bundling Vue 3-only builds.
  // Consumers can still register a global `$vueI18nUse` hook to provide translations.

  return { t: fallbackT }
}
