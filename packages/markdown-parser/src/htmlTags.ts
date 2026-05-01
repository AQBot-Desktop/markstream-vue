export const VOID_HTML_TAG_NAMES = [
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
] as const

export const INLINE_HTML_TAG_NAMES = [
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'button',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
] as const

export const BLOCK_HTML_TAG_NAMES = [
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'figcaption',
  'figure',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const

export const SVG_HTML_TAG_NAMES = [
  'svg',
  'g',
  'path',
] as const

export const EXTENDED_STANDARD_HTML_TAG_NAMES = [
  'address',
  'audio',
  'body',
  'canvas',
  'caption',
  'colgroup',
  'datalist',
  'dd',
  'dialog',
  'dl',
  'dt',
  'fieldset',
  'form',
  'head',
  'hgroup',
  'html',
  'iframe',
  'legend',
  'map',
  'menu',
  'meter',
  'noscript',
  'object',
  'optgroup',
  'option',
  'output',
  'picture',
  'progress',
  'rp',
  'rt',
  'ruby',
  'script',
  'select',
  'style',
  'template',
  'textarea',
  'tfoot',
  'title',
  'video',
] as const

export const DANGEROUS_HTML_ATTR_NAMES = [
  'onclick',
  'onerror',
  'onload',
  'onmouseover',
  'onmouseout',
  'onmousedown',
  'onmouseup',
  'onkeydown',
  'onkeyup',
  'onfocus',
  'onblur',
  'onsubmit',
  'onreset',
  'onchange',
  'onselect',
  'ondblclick',
  'ontouchstart',
  'ontouchend',
  'ontouchmove',
  'ontouchcancel',
  'onwheel',
  'onscroll',
  'oncopy',
  'oncut',
  'onpaste',
  'oninput',
  'oninvalid',
  'onsearch',
] as const

export const URL_HTML_ATTR_NAMES = [
  'href',
  'src',
  'srcset',
  'xlink:href',
  'formaction',
] as const

export const BLOCKED_HTML_TAG_NAMES = [
  'script',
] as const

export const NON_STRUCTURING_HTML_TAG_NAMES = [
  'pre',
  'script',
  'style',
  'textarea',
  'title',
] as const

export const VOID_HTML_TAGS = new Set<string>(VOID_HTML_TAG_NAMES)
export const STANDARD_BLOCK_HTML_TAGS = new Set<string>(BLOCK_HTML_TAG_NAMES)
export const STANDARD_HTML_TAGS = new Set<string>([
  ...VOID_HTML_TAG_NAMES,
  ...INLINE_HTML_TAG_NAMES,
  ...BLOCK_HTML_TAG_NAMES,
  ...SVG_HTML_TAG_NAMES,
])
export const EXTENDED_STANDARD_HTML_TAGS = new Set<string>([
  ...STANDARD_HTML_TAGS,
  ...EXTENDED_STANDARD_HTML_TAG_NAMES,
])
export const DANGEROUS_HTML_ATTRS = new Set<string>(DANGEROUS_HTML_ATTR_NAMES)
export const URL_HTML_ATTRS = new Set<string>(URL_HTML_ATTR_NAMES)
export const BLOCKED_HTML_TAGS = new Set<string>(BLOCKED_HTML_TAG_NAMES)
export const NON_STRUCTURING_HTML_TAGS = new Set<string>(NON_STRUCTURING_HTML_TAG_NAMES)

export function stripHtmlControlAndWhitespace(value: string) {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code <= 0x1F || code === 0x7F)
      continue
    if (/\s/u.test(ch))
      continue
    out += ch
  }
  return out
}

export function isUnsafeHtmlUrl(value: string) {
  const normalized = stripHtmlControlAndWhitespace(value).toLowerCase()

  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:'))
    return true

  if (normalized.startsWith('data:')) {
    return !(
      normalized.startsWith('data:image/')
      || normalized.startsWith('data:video/')
      || normalized.startsWith('data:audio/')
    )
  }

  return false
}
