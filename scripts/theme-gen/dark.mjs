/**
 * Dark / light scheme generator.
 *
 * Takes a palette token map (from palette.mjs) and produces the opposite
 * scheme. Preserves hue identity, adjusts lightness/saturation, and
 * validates WCAG contrast.
 *
 * Strategy:
 *   Light → Dark:  backgrounds go very dark, text goes light, brand adjusts for contrast
 *   Dark → Light:  backgrounds go very light, text goes dark, brand adjusts for contrast
 */

import {
  adjustLightness,
  contrastRatio,
  hslToRgb,
  meetsAA,
  rgbToHsl,
  toHsl,
} from './color.mjs'
import { generatePalette } from './palette.mjs'

// ─── Main entry ─────────────────────────────────────────────────────

/**
 * Given a token map (Record<string, "H S% L%">), generate the opposite scheme.
 *
 * @param {Record<string, string>} tokens - Token map from generatePalette()
 * @param {'light'|'dark'} sourceMode - What mode the input tokens represent
 * @returns {Record<string, string>} Token map for the opposite mode
 */
export function generateOppositeScheme(tokens, sourceMode) {
  const bg = parseShadcnHsl(tokens.background)
  const fg = parseShadcnHsl(tokens.foreground)
  const brand = parseShadcnHsl(tokens.primary)

  const targetIsLight = sourceMode === 'dark'

  // Core strategy: flip lightness around the midpoint, keep hue + saturation close
  const newBg = flipForBackground(bg, targetIsLight)
  const newFg = flipForForeground(fg, targetIsLight, newBg)
  const newBrand = adjustBrandForScheme(brand, targetIsLight, newBg)

  // Generate full palette from derived key colors.
  // Signal & content tokens are not passed — the opposite scheme
  // only emits them if the source registry provided them.
  return generatePalette({
    background: hslToHex(newBg),
    foreground: hslToHex(newFg),
    brand: hslToHex(newBrand),
  })
}

/**
 * Generate both light and dark from any single scheme.
 *
 * @param {object} keyColors - { background, foreground, brand, ... }
 * @returns {{ light: Record<string, string>, dark: Record<string, string> }}
 */
export function generateBothSchemes(keyColors) {
  const bg = toHsl(keyColors.background)
  const sourceIsLight = bg.l > 50

  const primary = generatePalette(keyColors)

  let opposite
  if (keyColors.dark && keyColors.dark.background && sourceIsLight) {
    // Explicit dark palette provided — use directly instead of algorithmic flip.
    // Missing fields fall back to light-side values.
    opposite = generatePalette({
      background: keyColors.dark.background,
      foreground: keyColors.dark.foreground || keyColors.foreground,
      brand: keyColors.dark.brand || keyColors.brand,
      ...(keyColors.dark.surface && { surface: keyColors.dark.surface }),
      ...((keyColors.dark.secondaryText || keyColors.secondaryText) && {
        secondaryText: keyColors.dark.secondaryText || keyColors.secondaryText,
      }),
      ...((keyColors.dark.border) && { border: keyColors.dark.border }),
      ...((keyColors.dark.error || keyColors.error) && {
        error: keyColors.dark.error || keyColors.error,
      }),
      ...((keyColors.dark.link || keyColors.link) && {
        link: keyColors.dark.link || keyColors.link,
      }),
      ...((keyColors.dark.brandForeground || keyColors.brandForeground) && {
        brandForeground: keyColors.dark.brandForeground || keyColors.brandForeground,
      }),
      ...((keyColors.dark.ring) && { ring: keyColors.dark.ring }),
      ...((keyColors.dark.info || keyColors.info) && {
        info: keyColors.dark.info || keyColors.info,
      }),
      ...((keyColors.dark.success || keyColors.success) && {
        success: keyColors.dark.success || keyColors.success,
      }),
      ...((keyColors.dark.warning || keyColors.warning) && {
        warning: keyColors.dark.warning || keyColors.warning,
      }),
      ...((keyColors.dark.highlight || keyColors.highlight) && {
        highlight: keyColors.dark.highlight || keyColors.highlight,
      }),
      ...((keyColors.dark.diffAdded || keyColors.diffAdded) && {
        diffAdded: keyColors.dark.diffAdded || keyColors.diffAdded,
      }),
      ...((keyColors.dark.diffRemoved || keyColors.diffRemoved) && {
        diffRemoved: keyColors.dark.diffRemoved || keyColors.diffRemoved,
      }),
      ...(keyColors.fonts && { fonts: keyColors.fonts }),
    })
  }
  else {
    opposite = generateOppositeScheme(primary, sourceIsLight ? 'light' : 'dark')
  }

  // Shared tokens are mode-independent — copy from primary to opposite
  for (const key of ['font-sans', 'font-mono', 'font-serif', 'radius']) {
    if (primary[key] && !opposite[key])
      opposite[key] = primary[key]
  }

  return sourceIsLight
    ? { light: primary, dark: opposite }
    : { light: opposite, dark: primary }
}

// ─── Lightness flipping ─────────────────────────────────────────────

/**
 * Flip background lightness for the target scheme.
 */
function flipForBackground(bg, targetIsLight) {
  if (targetIsLight) {
    // Dark → Light: target L around 97-100, keep hue, reduce saturation slightly
    return {
      h: bg.h,
      s: Math.max(bg.s * 0.6, 0),
      l: mapRange(bg.l, 0, 20, 96, 100),
    }
  }
  else {
    // Light → Dark: target L around 4-10, keep hue, reduce saturation
    return {
      h: bg.h,
      s: Math.max(bg.s * 0.8, 0),
      l: mapRange(bg.l, 90, 100, 4, 10),
    }
  }
}

/**
 * Flip foreground lightness for the target scheme.
 */
function flipForForeground(fg, targetIsLight, newBg) {
  let newFg
  if (targetIsLight) {
    // Dark → Light: target L around 5-15
    newFg = {
      h: fg.h,
      s: Math.min(fg.s * 1.3, 100),
      l: mapRange(fg.l, 85, 100, 4, 12),
    }
  }
  else {
    // Light → Dark: target L around 90-98
    newFg = {
      h: fg.h,
      s: Math.max(fg.s * 0.7, 0),
      l: mapRange(fg.l, 0, 15, 92, 98),
    }
  }

  // Ensure sufficient contrast
  if (!meetsAA(newFg, newBg)) {
    newFg = targetIsLight
      ? adjustLightness(newFg, -10)
      : adjustLightness(newFg, 10)
  }

  return newFg
}

/**
 * Adjust brand color for the target scheme — preserve identity, ensure contrast.
 */
function adjustBrandForScheme(brand, targetIsLight, newBg) {
  let adjusted = { ...brand }

  if (targetIsLight) {
    // For light scheme, brand may need to be darker for contrast
    if (adjusted.l > 60)
      adjusted.l = 45
  }
  else {
    // For dark scheme, brand may need to be lighter for visibility
    if (adjusted.l < 40)
      adjusted.l = 55
  }

  // Fine-tune for contrast against background
  const cr = contrastRatio(adjusted, newBg)
  if (cr < 3) {
    adjusted = targetIsLight
      ? adjustLightness(adjusted, -15)
      : adjustLightness(adjusted, 15)
  }

  return adjusted
}

// ─── Contrast validation report ─────────────────────────────────────

/**
 * Validate a token map for WCAG contrast on all critical pairs.
 *
 * Each check has a severity:
 *   'error'   — text readability, will cause real accessibility issues
 *   'warn'    — best-practice, may not cause issues if supplemented (hover, underline)
 *
 * Returns an array of { pair, ratio, passAA, threshold, severity } objects.
 */
export function validateContrast(tokens) {
  // [fgKey, bgKey, label, threshold, severity]
  const pairs = [
    // Hard: text readability
    ['foreground', 'background', 'Primary text', 4.5, 'error'],
    ['muted-foreground', 'background', 'Secondary text', 4.5, 'error'],
    ['primary-foreground', 'primary', 'Button text', 4.5, 'error'],
    ['accent-foreground', 'accent', 'Accent text', 4.5, 'error'],
    ['destructive-foreground', 'destructive', 'Error text', 4.5, 'error'],
    ['popover-foreground', 'popover', 'Popover text', 4.5, 'error'],
    ['link', 'background', 'Link on background', 4.5, 'error'],
    // Soft: supplementary / non-text
    ['link', 'foreground', 'Link vs body text', 3, 'warn'],
    ['border', 'background', 'Border visibility', 3, 'warn'],
  ]

  const bgL = parseShadcnHsl(tokens.background).l
  const isLight = bgL > 50

  // Semantic colors as text on REAL admonition header background:
  // alphaBlend(semanticColor, muted, alpha) where alpha = 0.06 (light) / 0.12 (dark)
  if (tokens.muted) {
    const muted = parseShadcnHsl(tokens.muted)
    const alpha = isLight ? 0.06 : 0.12
    for (const key of ['info', 'success', 'warning']) {
      if (!tokens[key])
        continue
      const semColor = parseShadcnHsl(tokens[key])
      const headerBg = alphaBlendHsl(semColor, muted, alpha)
      const ratio = contrastRatio(semColor, headerBg)
      pairs.push([key, null, `${key} on header bg`, 4.5, 'error', ratio, headerBg])
    }
  }

  return pairs.map(([fgKey, bgKey, label, threshold, severity, preRatio]) => {
    let ratio
    if (preRatio !== undefined) {
      ratio = preRatio
    }
    else {
      const fg = parseShadcnHsl(tokens[fgKey])
      const bg = parseShadcnHsl(tokens[bgKey])
      ratio = contrastRatio(fg, bg)
    }
    return {
      pair: label,
      fg: fgKey,
      bg: bgKey,
      ratio: Math.round(ratio * 100) / 100,
      passAA: ratio >= threshold,
      passAAA: ratio >= (threshold === 3 ? 4.5 : 7),
      threshold,
      severity,
    }
  })
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Alpha-blend fg over bg in RGB space (same as CSS alpha compositing). */
function alphaBlendHsl(fg, bg, alpha) {
  const f = hslToRgb(fg.h, fg.s, fg.l)
  const b = hslToRgb(bg.h, bg.s, bg.l)
  return rgbToHsl(
    Math.round(f.r * alpha + b.r * (1 - alpha)),
    Math.round(f.g * alpha + b.g * (1 - alpha)),
    Math.round(f.b * alpha + b.b * (1 - alpha)),
  )
}

/**
 * Parse shadcn bare HSL "H S% L%" back to { h, s, l }.
 */
function parseShadcnHsl(str) {
  const parts = str.match(/[\d.]+/g)
  if (!parts || parts.length < 3)
    throw new Error(`Invalid shadcn HSL: "${str}"`)
  return {
    h: Number.parseFloat(parts[0]),
    s: Number.parseFloat(parts[1]),
    l: Number.parseFloat(parts[2]),
  }
}

/**
 * HSL object → hex (for feeding back to generatePalette).
 */
function hslToHex({ h, s, l }) {
  // Import would create circular dep, inline the conversion
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r, g, b
  if (h < 60)
    [r, g, b] = [c, x, 0]
  else if (h < 120)
    [r, g, b] = [x, c, 0]
  else if (h < 180)
    [r, g, b] = [0, c, x]
  else if (h < 240)
    [r, g, b] = [0, x, c]
  else if (h < 300)
    [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Map a value from one range to another, clamped.
 */
function mapRange(value, inMin, inMax, outMin, outMax) {
  const clamped = Math.min(Math.max(value, inMin), inMax)
  const ratio = (clamped - inMin) / (inMax - inMin)
  return outMin + ratio * (outMax - outMin)
}
