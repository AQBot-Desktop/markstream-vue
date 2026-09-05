import { findTagCloseIndexOutsideQuotes } from '../htmlTagUtils'

function isIndentWs(ch: string) {
  return ch === ' ' || ch === '\t'
}

function isNameChar(ch: string) {
  const c = ch.charCodeAt(0)
  return (
    (c >= 65 && c <= 90)
    || (c >= 97 && c <= 122)
    || (c >= 48 && c <= 57)
    || ch === '_'
    || ch === '-'
  )
}

function isIndentedCodeLine(line: string) {
  if (!line)
    return false
  if (line[0] === '\t')
    return true
  let spaces = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === ' ') {
      spaces++
      if (spaces >= 4)
        return true
      continue
    }
    if (ch === '\t')
      return true
    break
  }
  return false
}

function parseFenceMarker(line: string) {
  let i = 0
  while (i < line.length && isIndentWs(line[i])) i++
  const ch = line[i]
  if (ch !== '`' && ch !== '~')
    return null
  let j = i
  while (j < line.length && line[j] === ch) j++
  const len = j - i
  if (len < 3)
    return null
  return { markerChar: ch as '`' | '~', markerLen: len, rest: line.slice(j) }
}

function leadingIndent(line: string) {
  let i = 0
  while (i < line.length && isIndentWs(line[i])) i++
  return i
}

function findMatchingCloseOnLine(line: string, tag: string, from: number) {
  const lowerTag = tag.toLowerCase()
  let depth = 0
  let pos = line.indexOf('<', from)

  while (pos !== -1) {
    let i = pos + 1
    while (i < line.length && isIndentWs(line[i])) i++
    if (i >= line.length) {
      pos = line.indexOf('<', pos + 1)
      continue
    }

    const isClose = line[i] === '/'
    if (isClose) {
      i++
      while (i < line.length && isIndentWs(line[i])) i++
    }

    const nameStart = i
    while (i < line.length && isNameChar(line[i])) i++
    if (i === nameStart) {
      pos = line.indexOf('<', pos + 1)
      continue
    }

    const name = line.slice(nameStart, i).toLowerCase()
    if (name !== lowerTag) {
      pos = line.indexOf('<', pos + 1)
      continue
    }

    const gtRel = findTagCloseIndexOutsideQuotes(line.slice(pos))
    if (gtRel === -1)
      return null
    const end = pos + gtRel + 1

    if (isClose) {
      if (depth === 0)
        return { start: pos, end }
      depth--
    }
    else if (!/\/\s*>$/.test(line.slice(pos, end))) {
      depth++
    }

    pos = line.indexOf('<', end)
  }

  return null
}

function splitCompleteCustomHtmlLine(line: string, tagSet: Set<string>) {
  if (!line || isIndentedCodeLine(line))
    return null

  const indentEnd = leadingIndent(line)
  const body = line.slice(indentEnd)
  if (!body.startsWith('<'))
    return null

  let i = 1
  while (i < body.length && isIndentWs(body[i])) i++
  if (i >= body.length || body[i] === '/' || body[i] === '!' || body[i] === '?')
    return null

  const nameStart = i
  while (i < body.length && isNameChar(body[i])) i++
  if (i === nameStart)
    return null

  const tagName = body.slice(nameStart, i).toLowerCase()
  if (!tagSet.has(tagName))
    return null

  const openRel = findTagCloseIndexOutsideQuotes(body.slice(i))
  if (openRel === -1)
    return null

  const openEnd = indentEnd + i + openRel
  const openTag = line.slice(indentEnd, openEnd + 1)
  if (/\/\s*>$/.test(openTag))
    return null

  const close = findMatchingCloseOnLine(line, tagName, openEnd + 1)
  if (!close)
    return null

  for (let k = close.end; k < line.length; k++) {
    if (!isIndentWs(line[k]))
      return null
  }

  const inner = line.slice(openEnd + 1, close.start)
  if (!shouldPromoteCompleteCustomHtmlToBlock(inner))
    return null

  const indent = line.slice(0, indentEnd)
  const closeTag = line.slice(close.start)
  return `${indent}${openTag}\n${inner}\n${indent}${closeTag}`
}

function hasOddTrailingBackslashes(value: string) {
  let count = 0
  for (let i = value.length - 1; i >= 0 && value[i] === '\\'; i--)
    count++
  return count % 2 === 1
}

function shouldPromoteCompleteCustomHtmlToBlock(inner: string) {
  // Keep markdown-ish custom bodies (e.g. <thinking>**bold**</thinking>) inline
  // so nested formatting still parses. Promote raw command summaries whose
  // characters would make markdown-it treat `\<` as an escaped closer or
  // tokenize quotes/underscores/HTML as markup.
  return hasOddTrailingBackslashes(inner) || /["'<>&]/.test(inner)
}

/**
 * Send a complete custom HTML element that occupies its own line through the
 * existing html_block / source-slice path. Inline HTML treats `\<` as an
 * escaped `<`, so a summary ending in `\` would swallow `</tool-call>` and
 * the following markdown.
 */
export function normalizeCompleteCustomHtmlElementsOnOwnLine(markdown: string, tags: string[]) {
  if (!markdown || !tags.length)
    return markdown

  const tagSet = new Set(tags.map(t => String(t ?? '').toLowerCase()).filter(Boolean))
  if (!tagSet.size)
    return markdown

  let inFence = false
  let fenceChar: '`' | '~' | '' = ''
  let fenceLen = 0
  let out = ''
  let idx = 0

  while (idx < markdown.length) {
    const nl = markdown.indexOf('\n', idx)
    const hasNl = nl !== -1
    const isCrlf = hasNl && nl > idx && markdown[nl - 1] === '\r'
    const lineEnd = hasNl ? (isCrlf ? nl - 1 : nl) : markdown.length
    const line = markdown.slice(idx, lineEnd)
    const newline = hasNl ? (isCrlf ? '\r\n' : '\n') : ''
    const fenceMatch = parseFenceMarker(line)

    let nextLine = line
    if (!inFence && !fenceMatch) {
      nextLine = splitCompleteCustomHtmlLine(line, tagSet) ?? line
    }

    out += nextLine
    out += newline

    if (fenceMatch) {
      if (inFence) {
        if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen && /^\s*$/.test(fenceMatch.rest)) {
          inFence = false
          fenceChar = ''
          fenceLen = 0
        }
      }
      else {
        inFence = true
        fenceChar = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
      }
    }

    idx = hasNl ? nl + 1 : markdown.length
  }

  return out
}
