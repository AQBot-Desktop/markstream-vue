import {
  BLOCKED_HTML_TAGS,
  DANGEROUS_HTML_ATTRS,
  EXTENDED_STANDARD_HTML_TAGS,
  isUnsafeHtmlUrl,
  URL_HTML_ATTRS,
  VOID_HTML_TAGS,
} from './htmlTags'

export interface HtmlToken {
  type: 'text' | 'tag_open' | 'tag_close' | 'self_closing'
  tagName?: string
  attrs?: Record<string, string>
  content?: string
}

const CUSTOM_TAG_REGEX = /<([a-z][a-z0-9-]*)\b[^>]*>/gi

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function getString(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value == null
      ? ''
      : String(value)
}

function isSafeAttrName(value: string): boolean {
  return /^[^\s"'<>`=]+$/.test(value) && !/^on/i.test(value)
}

function escapeHtml(value: unknown): string {
  return getString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function normalizeTagName(tagName: string | undefined): string {
  return String(tagName ?? '').trim().toLowerCase()
}

function serializeAttrs(attrs: Record<string, string>): string {
  const pairs = Object.entries(attrs)
  if (pairs.length === 0)
    return ''

  return pairs
    .map(([name, value]) => value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`)
    .join('')
}

function sanitizeHtmlContentAttrs(attrs: Record<string, string>) {
  const clean: Record<string, string> = {}

  for (const [key, value] of Object.entries(attrs)) {
    const safeName = key.trim()
    const lowerKey = safeName.toLowerCase()
    if (!safeName || !isSafeAttrName(safeName))
      continue
    if (DANGEROUS_HTML_ATTRS.has(lowerKey))
      continue
    if (URL_HTML_ATTRS.has(lowerKey) && value && isUnsafeHtmlUrl(value))
      continue
    clean[safeName] = value
  }

  return clean
}

export function isCustomHtmlComponentTag(
  tagName: string,
  customComponents: Record<string, unknown>,
) {
  const lowerTag = tagName.toLowerCase()
  if (EXTENDED_STANDARD_HTML_TAGS.has(lowerTag))
    return false
  return hasOwn(customComponents, lowerTag) || hasOwn(customComponents, tagName)
}

export function sanitizeHtmlAttrs(attrs: Record<string, string>) {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(attrs)) {
    const lowerKey = key.toLowerCase()
    if (DANGEROUS_HTML_ATTRS.has(lowerKey))
      continue
    if (URL_HTML_ATTRS.has(lowerKey) && value && isUnsafeHtmlUrl(value))
      continue
    clean[key] = value
  }
  return clean
}

export function tokenAttrsToRecord(attrs?: Array<[string, string | null]> | null) {
  const record: Record<string, string> = {}
  if (!Array.isArray(attrs) || attrs.length === 0)
    return record

  for (const [key, value] of attrs) {
    if (!key)
      continue
    record[String(key)] = value == null ? '' : String(value)
  }

  return record
}

export function sanitizeHtmlTokenAttrs(attrs?: Array<[string, string | null]> | null) {
  const sanitized = sanitizeHtmlAttrs(tokenAttrsToRecord(attrs))
  const pairs = Object.entries(sanitized).map(([key, value]) => [key, value] as [string, string])
  return pairs.length > 0 ? pairs : undefined
}

export function convertHtmlPropValue(value: string, key: string): any {
  const lowerKey = key.toLowerCase()

  if (['checked', 'disabled', 'readonly', 'required', 'autofocus', 'multiple', 'hidden'].includes(lowerKey))
    return value === 'true' || value === '' || value === key

  if (['value', 'min', 'max', 'step', 'width', 'height', 'size', 'maxlength'].includes(lowerKey)) {
    const num = Number(value)
    if (value !== '' && !Number.isNaN(num))
      return num
  }

  return value
}

export function convertHtmlAttrsToProps(attrs: Record<string, string>) {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(attrs))
    result[key] = convertHtmlPropValue(value, key)
  return result
}

function isMeaningfulText(text: string) {
  return text.trim().length > 0
}

export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  let pos = 0

  while (pos < html.length) {
    if (html.startsWith('<!--', pos)) {
      const commentEnd = html.indexOf('-->', pos)
      if (commentEnd !== -1) {
        pos = commentEnd + 3
        continue
      }
      break
    }

    const tagStart = html.indexOf('<', pos)
    if (tagStart === -1) {
      if (pos < html.length) {
        const remainingText = html.slice(pos)
        if (isMeaningfulText(remainingText))
          tokens.push({ type: 'text', content: remainingText })
      }
      break
    }

    if (tagStart > pos) {
      const textContent = html.slice(pos, tagStart)
      if (isMeaningfulText(textContent))
        tokens.push({ type: 'text', content: textContent })
    }

    if (html.startsWith('![CDATA[', tagStart + 1)) {
      const cdataEnd = html.indexOf(']]>', tagStart)
      if (cdataEnd !== -1) {
        tokens.push({ type: 'text', content: html.slice(tagStart, cdataEnd + 3) })
        pos = cdataEnd + 3
        continue
      }
      break
    }

    if (html.startsWith('!', tagStart + 1)) {
      const specialEnd = html.indexOf('>', tagStart)
      if (specialEnd !== -1) {
        pos = specialEnd + 1
        continue
      }
      break
    }

    const tagEnd = html.indexOf('>', tagStart)
    if (tagEnd === -1)
      break

    const tagContent = html.slice(tagStart + 1, tagEnd).trim()
    const isClosingTag = tagContent.startsWith('/')
    const isSelfClosing = tagContent.endsWith('/')

    if (isClosingTag) {
      const tagName = tagContent.slice(1).trim()
      tokens.push({ type: 'tag_close', tagName })
    }
    else {
      const spaceIndex = tagContent.indexOf(' ')
      let tagName: string
      let attrsStr = ''

      if (spaceIndex === -1) {
        tagName = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim()
      }
      else {
        tagName = tagContent.slice(0, spaceIndex).trim()
        attrsStr = tagContent.slice(spaceIndex + 1)
      }

      const attrs: Record<string, string> = {}
      if (attrsStr) {
        const attrRegex = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S*)))?/g
        let attrMatch: RegExpExecArray | null
        while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
          const name = attrMatch[1]
          const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
          if (name && !name.endsWith('/'))
            attrs[name] = value
        }
      }

      tokens.push({
        type: isSelfClosing || VOID_HTML_TAGS.has(tagName.toLowerCase()) ? 'self_closing' : 'tag_open',
        tagName,
        attrs,
      })
    }

    pos = tagEnd + 1
  }

  return tokens
}

function tokenizeHtmlPreservingText(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  let pos = 0

  while (pos < html.length) {
    if (html.startsWith('<!--', pos)) {
      const commentEnd = html.indexOf('-->', pos)
      if (commentEnd !== -1) {
        pos = commentEnd + 3
        continue
      }
      break
    }

    const tagStart = html.indexOf('<', pos)
    if (tagStart === -1) {
      if (pos < html.length)
        tokens.push({ type: 'text', content: html.slice(pos) })
      break
    }

    if (tagStart > pos)
      tokens.push({ type: 'text', content: html.slice(pos, tagStart) })

    if (html.startsWith('![CDATA[', tagStart + 1)) {
      const cdataEnd = html.indexOf(']]>', tagStart)
      if (cdataEnd !== -1) {
        tokens.push({ type: 'text', content: html.slice(tagStart, cdataEnd + 3) })
        pos = cdataEnd + 3
        continue
      }
      break
    }

    if (html.startsWith('!', tagStart + 1)) {
      const specialEnd = html.indexOf('>', tagStart)
      if (specialEnd !== -1) {
        pos = specialEnd + 1
        continue
      }
      break
    }

    const tagEnd = html.indexOf('>', tagStart)
    if (tagEnd === -1)
      break

    const tagContent = html.slice(tagStart + 1, tagEnd).trim()
    if (!tagContent) {
      pos = tagEnd + 1
      continue
    }

    const isClosingTag = tagContent.startsWith('/')
    const isSelfClosing = tagContent.endsWith('/')

    if (isClosingTag) {
      const tagName = tagContent.slice(1).trim()
      tokens.push({ type: 'tag_close', tagName })
      pos = tagEnd + 1
      continue
    }

    const spaceIndex = tagContent.indexOf(' ')
    let tagName = ''
    let attrsStr = ''
    if (spaceIndex === -1) {
      tagName = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim()
    }
    else {
      tagName = tagContent.slice(0, spaceIndex).trim()
      attrsStr = tagContent.slice(spaceIndex + 1)
    }

    const attrs: Record<string, string> = {}
    if (attrsStr) {
      const attrRegex = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S*)))?/g
      let attrMatch: RegExpExecArray | null
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        const name = attrMatch[1]
        const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
        if (name && !name.endsWith('/'))
          attrs[name] = value
      }
    }

    tokens.push({
      type: isSelfClosing || VOID_HTML_TAGS.has(tagName.toLowerCase()) ? 'self_closing' : 'tag_open',
      tagName,
      attrs,
    })

    pos = tagEnd + 1
  }

  return tokens
}

export function hasCustomHtmlComponents(
  content: string,
  customComponents: Record<string, unknown>,
) {
  if (!content || !content.includes('<'))
    return false
  if (!customComponents || Object.keys(customComponents).length === 0)
    return false
  CUSTOM_TAG_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CUSTOM_TAG_REGEX.exec(content)) !== null) {
    if (isCustomHtmlComponentTag(match[1], customComponents))
      return true
  }
  return false
}

export function sanitizeHtmlContent(content: string): string {
  if (!content)
    return ''

  const tokens = tokenizeHtmlPreservingText(content)
  const stack: string[] = []
  const output: string[] = []
  let blockedDepth = 0

  for (const token of tokens) {
    if (token.type === 'text') {
      if (blockedDepth === 0)
        output.push(escapeHtml(token.content ?? ''))
      continue
    }

    const tagName = normalizeTagName(token.tagName)
    if (!tagName)
      continue

    if (BLOCKED_HTML_TAGS.has(tagName)) {
      if (token.type === 'tag_open')
        blockedDepth += 1
      else if (token.type === 'tag_close' && blockedDepth > 0)
        blockedDepth -= 1
      continue
    }

    if (blockedDepth > 0)
      continue

    if (token.type === 'self_closing') {
      output.push(`<${tagName}${serializeAttrs(sanitizeHtmlContentAttrs(token.attrs ?? {}))}>`)
      continue
    }

    if (token.type === 'tag_open') {
      output.push(`<${tagName}${serializeAttrs(sanitizeHtmlContentAttrs(token.attrs ?? {}))}>`)
      if (!VOID_HTML_TAGS.has(tagName))
        stack.push(tagName)
      continue
    }

    const matchedIndex = stack.lastIndexOf(tagName)
    if (matchedIndex === -1)
      continue

    while (stack.length > matchedIndex + 1) {
      const danglingTag = stack.pop()
      if (danglingTag)
        output.push(`</${danglingTag}>`)
    }

    const closingTag = stack.pop()
    if (closingTag)
      output.push(`</${closingTag}>`)
  }

  while (stack.length > 0) {
    const danglingTag = stack.pop()
    if (danglingTag)
      output.push(`</${danglingTag}>`)
  }

  return output.join('')
}
