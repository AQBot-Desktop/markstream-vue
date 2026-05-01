#!/usr/bin/env node
/**
 * Extracts language-relevant SVGs from the material-icon-theme npm package
 * and writes them to src/icon-themes/material/svg/.
 *
 * Usage: node scripts/vendor-material-icons.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SOURCE = join(ROOT, 'node_modules/material-icon-theme/icons')
const TARGET = join(ROOT, 'src/icon-themes/material/svg')

// Mapping: our language identifier → material-icon-theme filename (without .svg)
const ICON_MAP = {
  // Core languages (~27)
  javascript: 'javascript',
  typescript: 'typescript',
  jsx: 'react',
  tsx: 'react_ts',
  html: 'html',
  css: 'css',
  scss: 'sass',
  json: 'json',
  python: 'python',
  ruby: 'ruby',
  go: 'go',
  java: 'java',
  kotlin: 'kotlin',
  c: 'c',
  cpp: 'cpp',
  csharp: 'csharp',
  php: 'php',
  shell: 'console',
  powershell: 'powershell',
  sql: 'database',
  yaml: 'yaml',
  markdown: 'markdown',
  xml: 'xml',
  rust: 'rust',
  vue: 'vue',
  text: 'document',
  plain: 'document',

  // Extended languages (~33)
  ada: 'ada',
  applescript: 'applescript',
  assembly: 'assembly',
  clojure: 'clojure',
  cobol: 'cobol',
  crystal: 'crystal',
  dart: 'dart',
  dlang: 'd',
  docker: 'docker',
  elixir: 'elixir',
  erlang: 'erlang',
  fortran: 'fortran',
  groovy: 'groovy',
  haskell: 'haskell',
  julia: 'julia',
  lisp: 'lisp',
  lua: 'lua',
  nim: 'nim',
  objectivec: 'c',
  objectivecpp: 'cpp',
  ocaml: 'ocaml',
  perl: 'perl',
  prolog: 'prolog',
  r: 'r',
  scala: 'scala',
  solidity: 'solidity',
  svelte: 'svelte',
  svg: 'xml',
  swift: 'swift',
  terraform: 'terraform',
  vbnet: 'csharp',
  mermaid: 'markdown', // no dedicated mermaid icon, use markdown
}

// Ensure target directory exists
mkdirSync(TARGET, { recursive: true })

let copied = 0
let missing = 0

for (const [lang, materialName] of Object.entries(ICON_MAP)) {
  const srcFile = join(SOURCE, `${materialName}.svg`)
  const dstFile = join(TARGET, `${lang}.svg`)

  if (!existsSync(srcFile)) {
    console.warn(`  MISS: ${lang} → ${materialName}.svg not found`)
    missing++
    continue
  }

  // Read SVG and ensure width/height attributes exist for proper inline rendering
  const svg = readFileSync(srcFile, 'utf-8')
  writeFileSync(dstFile, svg)
  copied++
}

// Also copy a generic code icon for fallback
const fallbackSrc = join(SOURCE, 'console.svg')
const fallbackDst = join(TARGET, '_fallback.svg')
if (existsSync(fallbackSrc)) {
  let svg = readFileSync(fallbackSrc, 'utf-8')
  // Only check the <svg> opening tag for width attribute
  const svgTag = svg.match(/<svg[^>]*>/)?.[0] ?? ''
  if (!svgTag.includes(' width=')) {
    svg = svg.replace('<svg ', '<svg width="16" height="16" ')
  }
  writeFileSync(fallbackDst, svg)
}

// Copy license
const licenseSrc = join(ROOT, 'node_modules/material-icon-theme/LICENSE')
if (existsSync(licenseSrc)) {
  copyFileSync(licenseSrc, join(dirname(TARGET), 'LICENSE-material-icon-theme'))
}

console.log(`\nDone: ${copied} icons copied, ${missing} missing`)
console.log(`Target: ${TARGET}`)
