/**
 * Color conversion utilities for theme generation.
 * Zero dependencies — pure math.
 *
 * Supported color spaces: sRGB, HSL, OKLCH.
 * All public functions accept flexible input (hex, rgba, hsl, oklch string)
 * and output either structured objects or shadcn bare format "H S% L%".
 */

// ─── Parsing ────────────────────────────────────────────────────────

/**
 * Parse any CSS color string into { r, g, b, a } (0-255 / 0-1).
 * Supports: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(), oklch().
 */
export function parseColor(str) {
  str = str.trim()

  // hex
  if (str.startsWith('#'))
    return parseHex(str)

  // rgb / rgba
  const rgbArgs = extractFunctionArgs(str, ['rgb', 'rgba'])
  if (rgbArgs)
    return parseRgbArgs(rgbArgs)

  // hsl / hsla  →  convert to rgb internally
  const hslArgs = extractFunctionArgs(str, ['hsl', 'hsla'])
  if (hslArgs)
    return parseHslArgs(hslArgs)

  // oklch  →  convert to rgb via OKLab → linear RGB → sRGB
  const oklchArgs = extractFunctionArgs(str, ['oklch'])
  if (oklchArgs)
    return parseOklchArgs(oklchArgs)

  throw new Error(`Unsupported color format: "${str}"`)
}

function extractFunctionArgs(str, names) {
  const lower = str.toLowerCase()
  for (const name of names) {
    const prefix = `${name}(`
    if (lower.startsWith(prefix) && str.endsWith(')'))
      return str.slice(prefix.length, -1).trim()
  }
  return null
}

function parseHex(hex) {
  hex = hex.replace('#', '')
  if (hex.length === 3)
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  if (hex.length === 4)
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]

  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1

  return { r, g, b, a }
}

function parseRgbArgs(args) {
  // Handles both comma-separated and space-separated (with optional / alpha)
  // Channels can be 0-255 or 0%-100% (100% = 255)
  const parts = args.split(/[\s,/]+/).map(s => s.trim()).filter(Boolean)
  const r = parseRgbChannel(parts[0])
  const g = parseRgbChannel(parts[1])
  const b = parseRgbChannel(parts[2])
  const a = parts[3] !== undefined ? parseAlpha(parts[3]) : 1
  return { r, g, b, a }
}

function parseRgbChannel(v) {
  if (v.endsWith('%'))
    return Math.round(Number.parseFloat(v) / 100 * 255)
  return Number.parseFloat(v)
}

function parseHslArgs(args) {
  // H: angle — deg (default), rad, grad, turn
  // S, L: percentage (the % sign is required per spec but we tolerate bare numbers)
  const parts = args.split(/[\s,/]+/).map(s => s.trim()).filter(Boolean)
  let h = Number.parseFloat(parts[0])
  h = parseAngle(parts[0], h)
  const s = Number.parseFloat(parts[1]) / 100
  const l = Number.parseFloat(parts[2]) / 100
  const a = parts[3] !== undefined ? parseAlpha(parts[3]) : 1
  const { r, g, b } = hslToRgbRaw(h, s, l)
  return { r, g, b, a }
}

function parseOklchArgs(args) {
  // CSS oklch: oklch(L C H) or oklch(L C H / alpha)
  // L: 0-1 or 0%-100%  (100% = 1)
  // C: 0-0.4 or 0%-100% (100% = 0.4, per CSS Color 4)
  // H: angle — deg (default), rad, grad, turn
  const parts = args.split(/[\s,/]+/).map(s => s.trim()).filter(Boolean)

  let l = Number.parseFloat(parts[0])
  if (parts[0].endsWith('%'))
    l /= 100
  l = Math.min(Math.max(l, 0), 1)

  let c = Number.parseFloat(parts[1])
  if (parts[1]?.endsWith('%'))
    c = c / 100 * 0.4 // CSS Color 4: 100% chroma = 0.4

  let h = Number.parseFloat(parts[2]) || 0
  h = parseAngle(parts[2], h)

  const a = parts[3] !== undefined ? parseAlpha(parts[3]) : 1

  const { r, g, b } = oklchToSrgb(l, c, h)
  return { r, g, b, a }
}

function parseAlpha(v) {
  if (v.endsWith('%'))
    return Number.parseFloat(v) / 100
  return Number.parseFloat(v)
}

/**
 * Parse CSS angle units. Returns degrees.
 * Supports: deg (default), rad, grad, turn.
 * Note: 'grad' must be checked before 'rad' since 'grad'.endsWith('rad') === true.
 */
function parseAngle(raw, numericValue) {
  if (!raw)
    return numericValue
  if (raw.endsWith('grad'))
    return numericValue * 0.9
  if (raw.endsWith('rad'))
    return numericValue * 180 / Math.PI
  if (raw.endsWith('turn'))
    return numericValue * 360
  // 'deg' suffix or bare number — already in degrees
  return numericValue
}

// ─── OKLCH ↔ sRGB conversion chain ─────────────────────────────────
//
//   OKLCH ↔ OKLab ↔ LMS (cube) ↔ Linear RGB ↔ sRGB (gamma)
//
// Reference: Björn Ottosson — https://bottosson.github.io/posts/oklab/

/**
 * OKLCH → sRGB { r, g, b } (0-255).
 * Uses CSS Color 4 gamut mapping: binary-search chroma reduction in OKLCH
 * to preserve lightness and hue. Falls back to simple clamp only for
 * achromatic colors or near-boundary values.
 *
 * @param {number} L  Lightness 0-1
 * @param {number} C  Chroma ≥ 0
 * @param {number} H  Hue 0-360
 */
function oklchToSrgb(L, C, H) {
  // Fast path: achromatic or no chroma
  if (C <= 0 || Number.isNaN(H))
    return oklabToLinearSrgb_gammaEncode(L, 0, 0)

  // Try direct conversion first
  const direct = oklchToLinearSrgbChannels(L, C, H)
  if (isInGamut(direct))
    return gammaEncodeRgb(direct)

  // CSS Color 4 gamut mapping: binary search on chroma, keep L and H fixed.
  // Tolerance: ΔE_ok < 0.002 (spec uses 0.02 in deltaEOK, ≈ 0.002 in raw OKLab)
  const EPSILON = 0.001
  let lo = 0
  let hi = C
  let mapped = direct

  while (hi - lo > EPSILON) {
    const mid = (lo + hi) / 2
    mapped = oklchToLinearSrgbChannels(L, mid, H)
    if (isInGamut(mapped))
      lo = mid
    else
      hi = mid
  }

  // Use the last in-gamut result (lo), clamp rounding errors
  mapped = oklchToLinearSrgbChannels(L, lo, H)
  return gammaEncodeRgb(mapped)
}

/** Check if linear RGB channels are within [0, 1] gamut (with tiny tolerance). */
function isInGamut({ lr, lg, lb }) {
  const E = 0.000075 // tolerance for floating point
  return lr >= -E && lr <= 1 + E
    && lg >= -E && lg <= 1 + E
    && lb >= -E && lb <= 1 + E
}

/** OKLCH → raw linear sRGB channels (may be out of gamut). */
function oklchToLinearSrgbChannels(L, C, H) {
  const hRad = H * Math.PI / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)

  // OKLab → LMS (cube root form)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return {
    lr: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    lg: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    lb: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  }
}

/** Gamma-encode and clamp linear RGB channels → sRGB { r, g, b } 0-255. */
function gammaEncodeRgb({ lr, lg, lb }) {
  return {
    r: clamp(Math.round(linearToGamma(clamp(lr, 0, 1)) * 255), 0, 255),
    g: clamp(Math.round(linearToGamma(clamp(lg, 0, 1)) * 255), 0, 255),
    b: clamp(Math.round(linearToGamma(clamp(lb, 0, 1)) * 255), 0, 255),
  }
}

/**
 * OKLab → sRGB { r, g, b } (0-255). Direct conversion with gamma encode + clamp.
 * Used internally for achromatic fast path.
 */
function oklabToLinearSrgb_gammaEncode(L) {
  // For achromatic, a=0 b=0 so we just need L → LMS → linear RGB
  const l_ = L
  const m_ = L
  const s_ = L
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return gammaEncodeRgb({
    lr: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    lg: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    lb: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  })
}

/**
 * sRGB { r, g, b } (0-255) → OKLab { L, a, b }.
 */
function srgbToOklab(r, g, b) {
  // sRGB → Linear sRGB
  const lr = gammaToLinear(r / 255)
  const lg = gammaToLinear(g / 255)
  const lb = gammaToLinear(b / 255)

  // Linear sRGB → LMS
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  // Cube root
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  // LMS → OKLab
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  }
}

/**
 * sRGB { r, g, b } (0-255) → OKLCH { l: 0-1, c: ≥0, h: 0-360 }.
 */
export function rgbToOklch(r, g, b) {
  const { L, a, b: b_ } = srgbToOklab(r, g, b)
  const c = Math.sqrt(a * a + b_ * b_)
  let h = Math.atan2(b_, a) * 180 / Math.PI
  if (h < 0)
    h += 360
  return {
    l: round(L, 4),
    c: round(c, 4),
    h: round(h, 2),
  }
}

/**
 * OKLCH { l, c, h } → sRGB { r, g, b } (0-255).
 */
export function oklchToRgb(l, c, h) {
  return oklchToSrgb(l, c, h)
}

/** sRGB gamma encode (linear → gamma). */
function linearToGamma(x) {
  if (x <= 0)
    return 0
  if (x >= 1)
    return 1
  return x <= 0.0031308
    ? 12.92 * x
    : 1.055 * (x ** (1 / 2.4)) - 0.055
}

/** sRGB gamma decode (gamma → linear). */
function gammaToLinear(x) {
  if (x <= 0)
    return 0
  if (x >= 1)
    return 1
  return x <= 0.04045
    ? x / 12.92
    : ((x + 0.055) / 1.055) ** 2.4
}

// ─── Conversions ────────────────────────────────────────────────────

/**
 * RGB (0-255) → HSL { h: 0-360, s: 0-100, l: 0-100 }
 */
export function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return {
    h: round(h * 360, 1),
    s: round(s * 100, 1),
    l: round(l * 100, 1),
  }
}

/**
 * HSL (h: 0-360, s: 0-1, l: 0-1) → RGB { r, g, b } (0-255)
 */
function hslToRgbRaw(h, s, l) {
  h = ((h % 360) + 360) % 360

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

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

export function hslToRgb(h, s, l) {
  return hslToRgbRaw(h, s / 100, l / 100)
}

/**
 * HSL → hex string "#rrggbb"
 */
export function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l)
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`
}

// ─── Format helpers ─────────────────────────────────────────────────

/**
 * Any CSS color string → shadcn bare HSL format "H S% L%"
 * e.g. "222.2 84% 4.9%"
 */
export function toShadcnHsl(color) {
  const { r, g, b } = parseColor(color)
  const { h, s, l } = rgbToHsl(r, g, b)
  return `${h} ${s}% ${l}%`
}

/**
 * Any CSS color string → { h, s, l, a } (h: 0-360, s: 0-100, l: 0-100)
 */
export function toHsl(color) {
  const { r, g, b, a } = parseColor(color)
  const { h, s, l } = rgbToHsl(r, g, b)
  return { h, s, l, a }
}

/**
 * HSL object → shadcn bare format "H S% L%"
 */
export function hslToShadcn({ h, s, l }) {
  return `${round(h, 1)} ${round(s, 1)}% ${round(l, 1)}%`
}

/**
 * HSL object → hex "#rrggbb"
 */
export function hslObjToHex({ h, s, l }) {
  return hslToHex(h, s, l)
}

// ─── OKLCH format helpers ───────────────────────────────────────────

/**
 * Any CSS color string → OKLCH { l: 0-1, c: ≥0, h: 0-360, a: 0-1 }
 */
export function toOklch(color) {
  const { r, g, b, a } = parseColor(color)
  const oklch = rgbToOklch(r, g, b)
  return { ...oklch, a }
}

/**
 * Any CSS color string → CSS oklch() string "oklch(L C H)"
 */
export function toOklchCss(color) {
  const { l, c, h, a } = toOklch(color)
  const base = `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)})`
  if (a < 1)
    return `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)} / ${round(a, 3)})`
  return base
}

/**
 * OKLCH object → CSS oklch() string
 */
export function oklchToCss({ l, c, h, a }) {
  if (a !== undefined && a < 1)
    return `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)} / ${round(a, 3)})`
  return `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)})`
}

/**
 * OKLCH object → hex "#rrggbb"
 */
export function oklchToHex({ l, c, h }) {
  const { r, g, b } = oklchToRgb(l, c, h)
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * HSL object { h, s, l } → OKLCH { l, c, h }
 */
export function hslToOklch({ h, s, l }) {
  const { r, g, b } = hslToRgb(h, s, l)
  return rgbToOklch(r, g, b)
}

/**
 * OKLCH { l, c, h } → HSL { h, s, l } (all 0-360/0-100 range)
 */
export function oklchToHsl({ l, c, h }) {
  const { r, g, b } = oklchToRgb(l, c, h)
  return rgbToHsl(r, g, b)
}

// ─── Color manipulation ─────────────────────────────────────────────

/**
 * Adjust lightness: positive = lighter, negative = darker.
 * Clamps 0-100.
 */
export function adjustLightness(hsl, amount) {
  return { ...hsl, l: clamp(hsl.l + amount, 0, 100) }
}

/**
 * Adjust saturation: positive = more saturated, negative = less.
 * Clamps 0-100.
 */
export function adjustSaturation(hsl, amount) {
  return { ...hsl, s: clamp(hsl.s + amount, 0, 100) }
}

/**
 * Mix two HSL colors by ratio (0 = all colorA, 1 = all colorB).
 */
export function mixHsl(a, b, ratio = 0.5) {
  return {
    h: lerpHue(a.h, b.h, ratio),
    s: lerp(a.s, b.s, ratio),
    l: lerp(a.l, b.l, ratio),
    a: lerp(a.a ?? 1, b.a ?? 1, ratio),
  }
}

/**
 * Mix two colors in OKLCH space (perceptually uniform).
 * Inputs/outputs are OKLCH { l, c, h }.
 */
export function mixOklch(a, b, ratio = 0.5) {
  return {
    l: lerp(a.l, b.l, ratio),
    c: lerp(a.c, b.c, ratio),
    h: lerpHue(a.h, b.h, ratio),
    a: lerp(a.a ?? 1, b.a ?? 1, ratio),
  }
}

/**
 * Adjust OKLCH lightness: positive = lighter, negative = darker.
 * Clamps 0-1.
 */
export function adjustOklchLightness(oklch, amount) {
  return { ...oklch, l: clamp(oklch.l + amount, 0, 1) }
}

/**
 * Adjust OKLCH chroma: positive = more vivid, negative = more muted.
 * Clamps ≥ 0.
 */
export function adjustOklchChroma(oklch, amount) {
  return { ...oklch, c: Math.max(0, oklch.c + amount) }
}

// ─── WCAG Contrast ──────────────────────────────────────────────────

/**
 * Relative luminance from HSL (WCAG 2.1 definition).
 */
export function luminance(hsl) {
  const { r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l)
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * WCAG contrast ratio between two HSL colors. Returns 1–21.
 */
export function contrastRatio(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Check if contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text).
 */
export function meetsAA(fg, bg, largeText = false) {
  return contrastRatio(fg, bg) >= (largeText ? 3 : 4.5)
}

/**
 * Check if contrast meets WCAG AAA (7:1 for normal text, 4.5:1 for large text).
 */
export function meetsAAA(fg, bg, largeText = false) {
  return contrastRatio(fg, bg) >= (largeText ? 4.5 : 7)
}

// ─── Internal helpers ───────────────────────────────────────────────

function round(n, decimals = 1) {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Interpolate hue on the shortest arc.
 */
function lerpHue(a, b, t) {
  let diff = b - a
  if (diff > 180)
    diff -= 360
  if (diff < -180)
    diff += 360
  return ((a + diff * t) % 360 + 360) % 360
}
