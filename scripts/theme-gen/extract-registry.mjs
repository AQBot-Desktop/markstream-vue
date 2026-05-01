#!/usr/bin/env node

/**
 * Extract expanded registry fields from awesome-design-md preview HTML files.
 *
 * Reads preview.html and preview-dark.html for each theme to extract:
 *   - dark section (background, foreground, surface, secondaryText, border)
 *   - error color
 *   - brandForeground (CTA button text)
 *   - ring color
 *
 * Usage:
 *   node scripts/theme-gen/extract-registry.mjs --source ../awesome-design-md/design-md
 *   node scripts/theme-gen/extract-registry.mjs --source ../awesome-design-md/design-md --only claude
 *   node scripts/theme-gen/extract-registry.mjs --source ../awesome-design-md/design-md --dry-run
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { contrastRatio, toHsl } from './color.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── CLI args ───────────────────────────────────────────────────────

const args = process.argv.slice(2)
const opts = {}
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2)
    const next = args[i + 1]
    if (!next || next.startsWith('--')) {
      opts[key] = true
    }
    else {
      opts[key] = next
      i++
    }
  }
}

const sourceDir = opts.source || resolve(__dirname, '../../../awesome-design-md/design-md')
const registryPath = resolve(__dirname, 'registry.json')
const dryRun = opts['dry-run'] || false
const onlyId = opts.only || null

// ─── Parse CSS variables from HTML ──────────────────────────────────

function extractCssVars(html) {
  const vars = {}
  for (const declaration of html.split(';')) {
    const tokenStart = declaration.lastIndexOf('--')
    if (tokenStart === -1)
      continue
    const chunk = declaration.slice(tokenStart).trim()
    const colonIndex = chunk.indexOf(':')
    if (colonIndex === -1)
      continue
    const key = chunk.slice(2, colonIndex).trim()
    const val = chunk.slice(colonIndex + 1).trim()
    if (!key || !val)
      continue
    vars[key] = val
  }
  return vars
}

/**
 * Check if a CSS color value is opaque (no alpha channel < 1).
 */
function isOpaque(val) {
  if (val.startsWith('#')) {
    // #rrggbbaa — check if alpha < ff
    if (val.length === 9)
      return val.slice(7).toLowerCase() === 'ff'
    if (val.length === 5)
      return val[4].toLowerCase() === 'f'
    return true
  }
  const alphaValue = extractFunctionalAlpha(val)
  if (alphaValue != null) {
    const a = Number.parseFloat(alphaValue)
    return a >= 0.9
  }
  return true
}

function extractFunctionalAlpha(val) {
  const openIndex = val.indexOf('(')
  const closeIndex = val.lastIndexOf(')')
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex)
    return null
  const inner = val.slice(openIndex + 1, closeIndex).trim()
  if (!inner)
    return null
  if (inner.includes('/'))
    return inner.split('/').pop()?.trim() ?? null
  const parts = inner.split(',').map(part => part.trim()).filter(Boolean)
  return parts.length === 4 ? parts[3] : null
}

/**
 * Find a color value by trying multiple candidate variable names.
 * Only returns opaque solid colors (skips rgba with alpha < 0.9).
 */
function findColor(vars, ...candidates) {
  for (const name of candidates) {
    const val = vars[name]
    if (!val)
      continue
    if ((val.startsWith('#') || val.startsWith('rgb') || val.startsWith('hsl')) && isOpaque(val))
      return val
  }
  return null
}

/**
 * Extract CTA button text color from inline styles in HTML.
 * Looks for buttons with the brand background color and extracts their text color.
 */
function findBrandForeground(html, brandColor) {
  if (!brandColor)
    return null
  const brandHex = brandColor.toLowerCase()

  // Look for button/CTA styles with brand background
  // Pattern: background: <brand>; color: <fg>;
  const brandBgRe = new RegExp(
    `style="[^"]*background:\\s*(?:var\\(--[^)]*\\)|${brandHex.replace('#', '#?')})[^"]*color:\\s*(#[\\da-f]{3,8})`,
    'gi',
  )

  // Try matching brand background specifically
  const brandBgMatch = brandBgRe.exec(html)
  if (brandBgMatch)
    return brandBgMatch[1]

  // Fallback: look for nav-cta or btn-brand class button colors
  const ctaRe = /\.(?:nav-cta|btn-brand|btn-primary)\s*\{[^}]*color:\s*(?:var\(--([\w-]+)\)|(#[\da-f]{3,8}))/gi
  let m
  while ((m = ctaRe.exec(html)) !== null) {
    if (m[2])
      return m[2]
    if (m[1]) {
      const vars = extractCssVars(html)
      const resolved = vars[m[1]]
      if (resolved && resolved.startsWith('#'))
        return resolved
    }
  }

  return null
}

/**
 * Extract ring/focus color from CSS variables.
 */
function findRing(vars) {
  // Try specific ring variables
  const ring = findColor(vars, 'color-ring-warm', 'color-ring', 'ring-warm', 'ring', 'shadow-ring-color', 'focus-ring')
  if (ring)
    return ring

  // Try parsing ring from shadow-ring value: "rgba(...) 0px 0px 0px 1px" or "color 0px 0px 0px 1px"
  for (const key of ['shadow-ring', 'shadow-ring-light']) {
    const val = vars[key]
    if (!val)
      continue
    const hexMatch = val.match(/(#[\da-f]{3,8})/i)
    if (hexMatch && isOpaque(hexMatch[1]))
      return hexMatch[1]
    const rgbMatch = val.match(/(rgb\([^)]+\))/)
    if (rgbMatch && isOpaque(rgbMatch[1]))
      return rgbMatch[1]
    // Skip rgba with alpha — those are overlays, not solid ring colors
  }

  return null
}

// ─── Main ───────────────────────────────────────────────────────────

const registry = JSON.parse(readFileSync(registryPath, 'utf-8'))

let updated = 0
let skipped = 0

for (const entry of registry) {
  if (onlyId && entry.id !== onlyId)
    continue

  // Skip Claude — already manually updated
  if (entry.id === 'claude') {
    skipped++
    continue
  }

  const themeDir = resolve(sourceDir, entry.source)
  let lightHtml, darkHtml
  try {
    lightHtml = readFileSync(resolve(themeDir, 'preview.html'), 'utf-8')
    darkHtml = readFileSync(resolve(themeDir, 'preview-dark.html'), 'utf-8')
  }
  catch {
    console.log(`  skip  ${entry.id} (no preview files at ${entry.source})`)
    skipped++
    continue
  }

  const lightVars = extractCssVars(lightHtml)
  const darkVars = extractCssVars(darkHtml)

  const changes = []

  // ── radius ──
  if (!entry.radius) {
    // Extract from card class border-radius (best proxy for container panels)
    const cardRadiusMatch = lightHtml.match(/\.card\s*\{[^}]*border-radius:\s*([\d.]+)px/i)
      || lightHtml.match(/\.card[^{]*\{[^}]*border-radius:\s*([\d.]+)px/i)
    if (cardRadiusMatch) {
      const px = Number.parseFloat(cardRadiusMatch[1])
      // Only accept reasonable container radii (4-20px)
      if (px >= 4 && px <= 20) {
        const rem = Math.round(px / 16 * 1000) / 1000
        entry.radius = `${rem}rem`
        changes.push(`radius=${px}px`)
      }
    }
  }

  // ── error ──
  if (!entry.colors.error) {
    const error = findColor(lightVars, 'color-error', 'error', 'neg', 'danger', 'destructive', 'color-danger', 'color-destructive', 'red', 'color-red')
    if (error) {
      entry.colors.error = error
      changes.push(`error=${error}`)
    }
  }

  // ── brandForeground ──
  if (!entry.colors.brandForeground) {
    const brandFg = findBrandForeground(lightHtml, entry.colors.brand)
    if (brandFg) {
      // Sanity check: must have reasonable contrast against brand (≥ 2:1)
      try {
        const cr = contrastRatio(toHsl(brandFg), toHsl(entry.colors.brand))
        if (cr >= 2) {
          entry.colors.brandForeground = brandFg
          changes.push(`brandFg=${brandFg}`)
        }
      }
      catch { /* skip unparseable */ }
    }
  }

  // ── ring ──
  if (!entry.colors.ring) {
    const ring = findRing(lightVars)
    if (ring) {
      entry.colors.ring = ring
      changes.push(`ring=${ring}`)
    }
  }

  // ── dark section ──
  if (!entry.dark) {
    const dark = {}
    const darkBg = findColor(darkVars, 'bg-page', 'bg', 'color-bg', 'background')
    const darkFg = findColor(darkVars, 'text-primary', 'color-foreground', 'fg', 'white')
    const darkSurface = findColor(darkVars, 'bg-card', 'surface', 'bg-surface', 'bg-panel', 'card')
    const darkSecondary = findColor(darkVars, 'text-secondary', 'secondary', 'color-secondary')
    const darkBorder = findColor(darkVars, 'border-color', 'border', 'border-subtle', 'color-border')
    const darkError = findColor(darkVars, 'color-error', 'error', 'neg', 'danger', 'destructive')
    const darkRing = findRing(darkVars)

    if (darkBg)
      dark.background = darkBg
    if (darkFg)
      dark.foreground = darkFg
    if (darkSurface)
      dark.surface = darkSurface
    if (darkSecondary)
      dark.secondaryText = darkSecondary
    if (darkBorder)
      dark.border = darkBorder
    if (darkError && darkError !== entry.colors.error)
      dark.error = darkError
    if (darkRing)
      dark.ring = darkRing

    // Only add dark section if we got at least background
    if (dark.background) {
      entry.dark = dark
      changes.push(`dark={bg:${dark.background} fg:${dark.foreground || '-'} surface:${dark.surface || '-'} border:${dark.border || '-'}}`)
    }
  }

  if (changes.length > 0) {
    const native = entry.native === 'dark' ? '◐' : '◑'
    console.log(`  ${native} ${entry.id.padEnd(15)} ${changes.join(', ')}`)
    updated++
  }
  else {
    skipped++
  }
}

console.log(`\n${updated} updated, ${skipped} skipped`)

if (!dryRun) {
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
  console.log(`Written → ${registryPath}`)
}
else {
  console.log('(dry run — no files written)')
}
