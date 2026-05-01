#!/usr/bin/env node

/**
 * Theme generation CLI.
 *
 * Usage:
 *   # Generate from key colors (hex)
 *   node scripts/theme-gen/cli.mjs generate \
 *     --name claude \
 *     --bg "#f5f4ed" --fg "#141413" --brand "#c96442" \
 *     [--surface "#faf9f5"] [--border "#e8e6dc"] [--link "#0366d6"]
 *
 *   # Convert a single color
 *   node scripts/theme-gen/cli.mjs convert "#c96442"
 *
 *   # Validate contrast of a generated theme
 *   node scripts/theme-gen/cli.mjs validate --file themes/claude.css
 *
 *   # Demo: generate themes for several well-known DESIGN.md palettes
 *   node scripts/theme-gen/cli.mjs demo
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { hslObjToHex, toHsl, toOklch, toOklchCss, toShadcnHsl } from './color.mjs'
import { generateBothSchemes, validateContrast } from './dark.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Token keys that are not color values (font stacks, radius, etc.) — rendered in the shared block */
const NON_COLOR_TOKENS = new Set(['font-sans', 'font-mono', 'font-serif', 'radius'])

// ─── CLI dispatch ───────────────────────────────────────────────────

const [,, command, ...args] = process.argv

const commands = { generate, convert, validate, build }

if (!command || !commands[command]) {
  console.log(`
Theme Generator for markstream-vue

Commands:
  build      Build all themes from registry.json
  generate   Generate a single theme CSS from key colors
  convert    Convert a CSS color to shadcn HSL / OKLCH
  validate   Check WCAG contrast for a theme

Run with --help for per-command usage.
`)
  process.exit(0)
}

commands[command](args)

// ─── Commands ───────────────────────────────────────────────────────

function convert(args) {
  const color = args[0]
  if (!color) {
    console.error('Usage: convert <color>\n  e.g. convert "#c96442"\n  e.g. convert "oklch(0.6 0.15 40)"')
    process.exit(1)
  }

  const hsl = toHsl(color)
  const shadcn = toShadcnHsl(color)
  const hex = hslObjToHex(hsl)
  const oklch = toOklch(color)
  const oklchCss = toOklchCss(color)

  console.log(`Input:    ${color}`)
  console.log(`hex:      ${hex}`)
  console.log(`HSL:      h=${hsl.h} s=${hsl.s}% l=${hsl.l}%${hsl.a < 1 ? ` a=${hsl.a}` : ''}`)
  console.log(`shadcn:   ${shadcn}`)
  console.log(`OKLCH:    L=${oklch.l} C=${oklch.c} H=${oklch.h}${oklch.a < 1 ? ` a=${oklch.a}` : ''}`)
  console.log(`oklch():  ${oklchCss}`)
}

function generate(args) {
  const opts = parseArgs(args)

  if (opts.help) {
    console.log(`
Usage: generate --name <name> --bg <hex> --fg <hex> --brand <hex>
                [--surface <hex>] [--border <hex>] [--link <hex>]
                [--error <hex>] [--secondary-text <hex>]
                [--brand-fg <hex>] [--ring <hex>]
                [--font-sans <stack>] [--font-mono <stack>] [--font-serif <stack>]
                [--out <dir>] [--format css|json]
`)
    process.exit(0)
  }

  const name = opts.name || 'custom'
  const format = opts.format || 'css'
  const outDir = opts.out || resolve(__dirname, '../../themes')

  if (!opts.bg || !opts.fg || !opts.brand) {
    console.error('Error: --bg, --fg, and --brand are required.')
    process.exit(1)
  }

  // Build font overrides if any --font-* flags provided
  const fonts = {}
  if (opts['font-sans'])
    fonts.sans = opts['font-sans']
  if (opts['font-mono'])
    fonts.mono = opts['font-mono']
  if (opts['font-serif'])
    fonts.serif = opts['font-serif']

  const keyColors = {
    background: opts.bg,
    foreground: opts.fg,
    brand: opts.brand,
    ...(opts.surface && { surface: opts.surface }),
    ...(opts.border && { border: opts.border }),
    ...(opts.link && { link: opts.link }),
    ...(opts.error && { error: opts.error }),
    ...(opts['secondary-text'] && { secondaryText: opts['secondary-text'] }),
    ...(opts['brand-fg'] && { brandForeground: opts['brand-fg'] }),
    ...(opts.ring && { ring: opts.ring }),
    ...(Object.keys(fonts).length > 0 && { fonts }),
  }

  const { light, dark } = generateBothSchemes(keyColors)

  // Validate contrast
  console.log(`\n── ${name} (light) ──`)
  printContrast(validateContrast(light))
  console.log(`\n── ${name} (dark) ──`)
  printContrast(validateContrast(dark))

  // Output
  mkdirSync(outDir, { recursive: true })

  if (format === 'json') {
    const path = resolve(outDir, `${name}.json`)
    writeFileSync(path, JSON.stringify({ name, light, dark }, null, 2))
    console.log(`\nWritten: ${path}`)
  }
  else {
    const css = renderThemeCss(name, light, dark)
    const path = resolve(outDir, `${name}.css`)
    writeFileSync(path, css)
    console.log(`\nWritten: ${path}`)
  }
}

function validate(args) {
  const opts = parseArgs(args)
  const filePath = opts.file || args[0]

  if (!filePath) {
    console.error('Usage: validate --file <path-to-theme.css>')
    process.exit(1)
  }

  const css = readFileSync(resolve(filePath), 'utf-8')
  const tokens = parseCssTokens(css)

  if (tokens.light) {
    console.log('\n── Light scheme ──')
    printContrast(validateContrast(tokens.light))
  }
  if (tokens.dark) {
    console.log('\n── Dark scheme ──')
    printContrast(validateContrast(tokens.dark))
  }
}

function build(args) {
  const opts = parseArgs(args)
  const registryPath = opts.registry || resolve(__dirname, 'registry.json')
  const outDir = opts.out || resolve(__dirname, '../../themes')
  const filter = opts.only ? opts.only.split(',') : null

  const registry = JSON.parse(readFileSync(registryPath, 'utf-8'))
  const entries = filter
    ? registry.filter(e => filter.includes(e.id) || filter.includes(e.category))
    : registry

  console.log(`Building ${entries.length} themes from registry...\n`)

  mkdirSync(outDir, { recursive: true })

  let passCount = 0
  let warnCount = 0
  let failCount = 0

  for (const entry of entries) {
    const keyColors = {
      background: entry.colors.background,
      foreground: entry.colors.foreground,
      brand: entry.colors.brand,
      ...(entry.colors.surface && { surface: entry.colors.surface }),
      ...(entry.colors.secondaryText && { secondaryText: entry.colors.secondaryText }),
      ...(entry.colors.border && { border: entry.colors.border }),
      ...(entry.colors.error && { error: entry.colors.error }),
      ...(entry.colors.link && { link: entry.colors.link }),
      ...(entry.colors.brandForeground && { brandForeground: entry.colors.brandForeground }),
      ...(entry.colors.ring && { ring: entry.colors.ring }),
      ...(entry.colors.info && { info: entry.colors.info }),
      ...(entry.colors.success && { success: entry.colors.success }),
      ...(entry.colors.warning && { warning: entry.colors.warning }),
      ...(entry.colors.highlight && { highlight: entry.colors.highlight }),
      ...(entry.colors.diffAdded && { diffAdded: entry.colors.diffAdded }),
      ...(entry.colors.diffRemoved && { diffRemoved: entry.colors.diffRemoved }),
      ...(entry.fonts && { fonts: entry.fonts }),
      ...(entry.radius && { radius: entry.radius }),
      ...(entry.dark && { dark: entry.dark }),
    }

    const { light, dark } = generateBothSchemes(keyColors)

    const lightReport = validateContrast(light)
    const darkReport = validateContrast(dark)
    const errors = [...lightReport, ...darkReport].filter(r => !r.passAA && r.severity === 'error').length
    const warns = [...lightReport, ...darkReport].filter(r => !r.passAA && r.severity === 'warn').length

    let status
    if (errors > 0) {
      status = `✗ ${errors}`
      failCount++
    }
    else if (warns > 0) {
      status = `~ ${warns}`
      warnCount++
    }
    else {
      status = '✓'
      passCount++
    }

    const css = renderThemeCss(entry.id, light, dark)
    const path = resolve(outDir, `${entry.id}.css`)
    writeFileSync(path, css)

    const cat = (entry.category || '').padEnd(10)
    const mode = entry.native === 'dark' ? '◐' : '◑'
    console.log(`  ${status}  ${mode} ${cat} ${entry.id}`)
  }

  console.log(`\n${passCount} pass, ${warnCount} warn, ${failCount} fail — ${entries.length} themes → themes/`)

  // Also generate an index CSS that imports all themes
  const indexLines = entries.map(e => `@import './${e.id}.css';`)
  writeFileSync(resolve(outDir, 'index.css'), `${indexLines.join('\n')}\n`)
  console.log(`Index written → themes/index.css`)
}

// ─── CSS rendering ──────────────────────────────────────────────────

function splitTokens(tokens) {
  const colors = {}
  const shared = {}
  for (const [key, val] of Object.entries(tokens)) {
    if (NON_COLOR_TOKENS.has(key))
      shared[key] = val
    else
      colors[key] = val
  }
  return { colors, shared }
}

function renderThemeCss(name, light, dark) {
  const { colors: lightColors, shared } = splitTokens(light)
  const { colors: darkColors } = splitTokens(dark)

  const lines = []
  lines.push(`/**`)
  lines.push(` * markstream-vue theme: ${name}`)
  lines.push(` * Auto-generated by scripts/theme-gen/cli.mjs`)
  lines.push(` */`)
  lines.push('')

  // Shared tokens (fonts, radius — mode-independent)
  if (Object.keys(shared).length > 0) {
    lines.push(`/* ── Shared ── */`)
    lines.push(`.markstream-vue[data-theme="${name}"] {`)
    for (const [key, val] of Object.entries(shared)) {
      lines.push(`  --ms-${key}: ${val};`)
    }
    lines.push('}')
    lines.push('')
  }

  lines.push(`/* ── Light ── */`)
  lines.push(`.markstream-vue[data-theme="${name}"] {`)
  for (const [key, val] of Object.entries(lightColors)) {
    lines.push(`  --ms-${key}: ${val};`)
  }
  lines.push('}')
  lines.push('')
  lines.push(`/* ── Dark ── */`)
  lines.push(`.dark .markstream-vue[data-theme="${name}"],`)
  lines.push(`.markstream-vue[data-theme="${name}"].dark {`)
  for (const [key, val] of Object.entries(darkColors)) {
    lines.push(`  --ms-${key}: ${val};`)
  }
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

// ─── Helpers ────────────────────────────────────────────────────────

function parseArgs(args) {
  const result = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const next = args[i + 1]
      if (!next || next.startsWith('--')) {
        result[key] = true
      }
      else {
        result[key] = next
        i++
      }
    }
    else {
      result._positional = result._positional || []
      result._positional.push(args[i])
    }
  }
  return result
}

/**
 * Parse --ms-* tokens from a CSS file (simple regex, not a full parser).
 */
function parseCssTokens(css) {
  const result = {}
  // Find light block (first rule block)
  const lightMatch = css.match(/\.markstream-vue\[data-theme[^\]]+\]\s*\{([^}]+)\}/)
  if (lightMatch) {
    result.light = extractTokens(lightMatch[1])
  }
  // Find dark block
  const darkMatch = css.match(/\.dark[^{]*\{([^}]+)\}\s*$/)
  if (darkMatch) {
    result.dark = extractTokens(darkMatch[1])
  }
  return result
}

function extractTokens(block) {
  const tokens = {}
  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('--ms-'))
      continue
    const colonIndex = trimmed.indexOf(':')
    const semicolonIndex = trimmed.lastIndexOf(';')
    if (colonIndex === -1 || semicolonIndex === -1 || semicolonIndex <= colonIndex)
      continue
    const key = trimmed.slice('--ms-'.length, colonIndex).trim()
    const value = trimmed.slice(colonIndex + 1, semicolonIndex).trim()
    if (!key || !value)
      continue
    tokens[key] = value
  }
  return tokens
}

function printContrast(results) {
  for (const r of results) {
    const icon = r.passAA ? (r.passAAA ? '◉' : '○') : (r.severity === 'error' ? '✗' : '~')
    const ratio = r.ratio.toFixed(1).padStart(5)
    const sev = r.severity === 'warn' && !r.passAA ? ' [warn]' : ''
    console.log(`  ${icon} ${ratio}:1  ${r.pair} (≥${r.threshold})${sev}`)
  }
}
