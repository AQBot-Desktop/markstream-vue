/**
 * Layered palette generator.
 *
 * From a small set of key colors extracted from a DESIGN.md, derive the full
 * --ms-* token map that markstream-vue expects.
 *
 * Input (all optional except background + foreground + brand):
 *   { background, foreground, brand, surface?, secondaryText?, border? }
 *
 * Output: { light: { ...tokens }, dark: { ...tokens } }
 *   where each token value is a shadcn bare HSL string "H S% L%".
 */

import {
  adjustLightness,
  contrastRatio,
  hslToShadcn,
  mixHsl,
  toHsl,
} from './color.mjs'

// ─── Main entry ─────────────────────────────────────────────────────

/**
 * Generate the full --ms-* token set from key colors + typography.
 *
 * @param {object} input
 * @param {string} input.background  - Page background (hex/css)
 * @param {string} input.foreground  - Primary text (hex/css)
 * @param {string} input.brand       - Brand / accent color (hex/css)
 * @param {string} [input.surface]   - Card / surface background
 * @param {string} [input.secondaryText] - Secondary text color
 * @param {string} [input.border]    - Border color
 * @param {string} [input.error]     - Error / destructive color
 * @param {string} [input.link]      - Link color
 * @param {string} [input.brandForeground] - Text on brand buttons (overrides auto)
 * @param {string} [input.ring]      - Focus ring color
 * @param {string} [input.info]      - Info / note semantic color
 * @param {string} [input.success]   - Success / tip semantic color
 * @param {string} [input.warning]   - Warning semantic color
 * @param {string} [input.highlight] - Highlight / mark color
 * @param {string} [input.diffAdded] - Diff added color
 * @param {string} [input.diffRemoved] - Diff removed color
 * @param {string} [input.radius]    - Default component border-radius
 * @param {object} [input.fonts]     - Typography overrides
 * @param {string} [input.fonts.sans]  - Sans-serif font stack
 * @param {string} [input.fonts.mono]  - Monospace font stack
 * @param {string} [input.fonts.serif] - Serif font stack (for heading variants)
 * @returns {Record<string, string>} Map of token name → value
 */
export function generatePalette(input) {
  const bg = toHsl(input.background)
  const fg = toHsl(input.foreground)
  const brand = toHsl(input.brand)

  const isLight = bg.l > 50
  const surface = input.surface ? toHsl(input.surface) : deriveSurface(bg, isLight)
  // User-provided values pass through unchanged (trust the designer).
  // Only derived values get contrast-corrected.
  const secondaryText = input.secondaryText
    ? toHsl(input.secondaryText)
    : deriveSecondaryText(fg, bg, isLight)
  const border = input.border
    ? toHsl(input.border)
    : deriveBorder(bg, fg, isLight)
  const error = input.error ? toHsl(input.error) : deriveError(isLight)
  const link = input.link ? toHsl(input.link) : deriveLink(brand, bg, fg, isLight)

  // ── Bridge tokens (shadcn-compatible) ──
  // muted must be computed before semantic colors (used for admonition header bg)
  const muted = deriveMuted(bg, fg, isLight)
  const mutedFg = secondaryText
  const secondary = surface
  const secondaryFg = isLight
    ? adjustLightness(fg, 10)
    : adjustLightness(fg, -10)
  const accent = deriveAccent(bg, brand, isLight)
  const accentFg = isLight
    ? adjustLightness(fg, 5)
    : adjustLightness(fg, -5)
  const primary = brand
  const primaryFg = input.brandForeground
    ? toHsl(input.brandForeground)
    : derivePrimaryForeground(brand)
  const destructive = error
  const destructiveFg = derivePrimaryForeground(error)
  const ring = input.ring
    ? toHsl(input.ring)
    : fg
  const popover = bg
  const popoverFg = fg

  // ── Extension tokens (markstream-specific) ──
  // Signal & content colors are only emitted when explicitly provided.
  // When absent, the library defaults in index.css apply.
  const extensionTokens = {}

  if (input.info) {
    const c = toHsl(input.info)
    extensionTokens.info = c
    extensionTokens['info-foreground'] = derivePrimaryForeground(c)
  }
  if (input.success) {
    const c = toHsl(input.success)
    extensionTokens.success = c
    extensionTokens['success-foreground'] = derivePrimaryForeground(c)
  }
  if (input.warning) {
    const c = toHsl(input.warning)
    extensionTokens.warning = c
    extensionTokens['warning-foreground'] = derivePrimaryForeground(c)
  }
  if (input.diffAdded)
    extensionTokens['diff-added'] = toHsl(input.diffAdded)
  if (input.diffRemoved)
    extensionTokens['diff-removed'] = toHsl(input.diffRemoved)
  if (input.highlight) {
    const c = toHsl(input.highlight)
    extensionTokens.highlight = c
    extensionTokens['highlight-foreground'] = derivePrimaryForeground(c)
  }

  const colorTokens = toTokenMap({
    // Bridge
    'background': bg,
    'foreground': fg,
    'muted': muted,
    'muted-foreground': mutedFg,
    'secondary': secondary,
    'secondary-foreground': secondaryFg,
    'accent': accent,
    'accent-foreground': accentFg,
    'primary': primary,
    'primary-foreground': primaryFg,
    'destructive': destructive,
    'destructive-foreground': destructiveFg,
    'border': border,
    'ring': ring,
    'popover': popover,
    'popover-foreground': popoverFg,
    'radius': null, // not a color — handled separately

    // Extension (pass-through only)
    ...extensionTokens,
    'link': link,
  })

  // Font tokens (not color, pass through as-is)
  const fonts = input.fonts || {}
  if (fonts.sans)
    colorTokens['font-sans'] = fonts.sans
  if (fonts.mono)
    colorTokens['font-mono'] = fonts.mono
  if (fonts.serif)
    colorTokens['font-serif'] = fonts.serif

  // Radius token
  if (input.radius)
    colorTokens.radius = input.radius

  return colorTokens
}

// ─── Core contrast helper ───────────────────────────────────────────

/**
 * Iteratively adjust lightness until the color meets a target contrast ratio
 * against a reference color. Preserves hue and saturation.
 *
 * @param {object} color     - HSL color to adjust
 * @param {object} reference - HSL color to measure contrast against
 * @param {number} target    - Minimum contrast ratio (e.g. 4.5 for AA)
 * @param {boolean} darken   - Direction: true = make darker, false = make lighter
 * @returns {object} Adjusted HSL color guaranteed to meet target (or at limit)
 */
function ensureContrast(color, reference, target, darken) {
  // Add small epsilon to avoid floating-point near-misses at the boundary
  const effectiveTarget = target + 0.02
  // Coarse pass: step by 1 to find the region
  let c = { ...color }
  const coarseStep = darken ? -1 : 1
  for (let i = 0; i < 100; i++) {
    if (contrastRatio(c, reference) >= effectiveTarget)
      return c
    c = adjustLightness(c, coarseStep)
    if (c.l <= 0 || c.l >= 100)
      return c
  }
  return c
}

// ─── Derivation helpers ─────────────────────────────────────────────

/**
 * Derive surface color: slightly offset from background.
 */
function deriveSurface(bg, isLight) {
  return isLight
    ? adjustLightness(bg, -3)
    : adjustLightness(bg, 5)
}

/**
 * Derive muted background: between bg and fg, close to bg side.
 */
function deriveMuted(bg, fg, isLight) {
  return isLight
    ? adjustLightness(bg, -4)
    : adjustLightness(bg, 8)
}

/**
 * Derive secondary text: mix fg/bg, then iterate to guarantee ≥ 4.5:1 against bg.
 */
function deriveSecondaryText(fg, bg, isLight) {
  const seed = mixHsl(fg, bg, 0.35)
  return ensureContrast(seed, bg, 4.5, isLight)
}

/**
 * Derive border: must meet WCAG non-text contrast (≥ 3:1) against background.
 * Starts from a subtle mix, then pushes until 3:1 is reached.
 */
function deriveBorder(bg, fg, isLight) {
  const seed = isLight ? mixHsl(bg, fg, 0.1) : mixHsl(bg, fg, 0.12)
  return ensureContrast(seed, bg, 3, isLight)
}

/**
 * Derive accent: bg tinted with brand, subtle.
 */
function deriveAccent(bg, brand, isLight) {
  return isLight
    ? mixHsl(bg, brand, 0.06)
    : mixHsl(bg, brand, 0.1)
}

/**
 * Derive error color (default red if not provided).
 */
function deriveError(isLight) {
  return isLight
    ? { h: 0, s: 84.2, l: 60.2 }
    : { h: 0, s: 62.8, l: 30.6 }
}

/**
 * Derive link color from brand. Targets:
 *   1. ≥ 4.5:1 against background (AA text — hard requirement)
 *   2. ≥ 3:1 against foreground (color-only link distinguishability — best-effort)
 *
 * Sweeps H/S/L to find the best feasible link. If both constraints are
 * mathematically impossible (e.g. very dark fg + very light bg with blue hue),
 * prioritizes bg contrast and maximizes fg contrast within that constraint.
 */
function deriveLink(brand, bg, fg, isLight) {
  const h = brand.h
  const isBlueish = h >= 180 && h <= 290
  const seedH = isBlueish ? brand.h : 212
  const seedS = isBlueish ? Math.min(brand.s, 100) : 100
  const seedL = isLight ? 38 : 68

  // Sweep S and L. Two-tier strategy:
  //   Tier 1: find candidates meeting BOTH bg≥4.5 AND fg≥3, pick closest to seed.
  //   Tier 2: if none found, pick the L closest to seed that meets bg≥4.5.
  //   (fg shortfall will be honestly reported by validateContrast)
  let tier1 = null
  let tier1Dist = Infinity
  let tier2 = null
  let tier2Dist = Infinity

  // Always sweep nearby hues — even blue brands may need a hue shift for contrast
  const hueSet = new Set([seedH])
  for (let dh = -15; dh <= 15; dh += 5) {
    hueSet.add(((seedH + dh) % 360 + 360) % 360)
  }
  const hues = [...hueSet]

  for (const sh of hues) {
    for (let s = seedS; s >= 40; s -= 5) {
      for (let l = 0; l <= 100; l++) {
        const candidate = { h: sh, s, l }
        const crBg = contrastRatio(candidate, bg)
        if (crBg < 4.5)
          continue

        const dist = Math.abs(l - seedL) + Math.abs(s - seedS) * 0.1 + Math.abs(sh - seedH) * 0.2

        // Tier 2: any bg-passing candidate
        if (dist < tier2Dist) {
          tier2Dist = dist
          tier2 = candidate
        }

        // Tier 1: also meets fg≥3
        const crFg = contrastRatio(candidate, fg)
        if (crFg >= 3 && dist < tier1Dist) {
          tier1Dist = dist
          tier1 = candidate
        }
      }
    }
  }

  return tier1 || tier2 || ensureContrast({ h: seedH, s: seedS, l: seedL }, bg, 4.5, isLight)
}

/**
 * Derive primary foreground: white or dark text depending on brand lightness.
 * Tries tinted white/dark first for warmth, falls back to pure white/black.
 * Always picks whichever option has the best contrast.
 */
function derivePrimaryForeground(brand) {
  const candidates = [
    { h: 210, s: 40, l: 98 }, // tinted white
    { h: 222.2, s: 47.4, l: 11.2 }, // tinted dark
    { h: 0, s: 0, l: 100 }, // pure white
    { h: 0, s: 0, l: 0 }, // pure black
  ]

  let best = candidates[0]
  let bestCr = 0
  for (const c of candidates) {
    const cr = contrastRatio(c, brand)
    if (cr > bestCr) {
      bestCr = cr
      best = c
    }
  }
  return best
}

// ─── Output formatting ──────────────────────────────────────────────

/**
 * Convert named HSL objects to { tokenName: "H S% L%" } map.
 */
function toTokenMap(obj) {
  const result = {}
  for (const [key, val] of Object.entries(obj)) {
    if (val === null)
      continue
    result[key] = hslToShadcn(val)
  }
  return result
}

// ─── Token metadata (for documentation / validation) ────────────────

/**
 * All bridge token names that map to shadcn variables.
 */
export const BRIDGE_TOKENS = [
  'background',
  'foreground',
  'muted',
  'muted-foreground',
  'secondary',
  'secondary-foreground',
  'accent',
  'accent-foreground',
  'primary',
  'primary-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'ring',
  'popover',
  'popover-foreground',
]

/**
 * All extension token names specific to markstream-vue.
 * Signal & content tokens are optional — only emitted when the registry provides them.
 * When absent, the library defaults in src/index.css apply.
 */
export const EXTENSION_TOKENS = [
  'info',
  'info-foreground',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  'diff-added',
  'diff-removed',
  'highlight',
  'highlight-foreground',
  'link',
]
