const FILENAMEISH_EXTENSION_RE = /\.([a-z0-9]{1,10})$/i
const FILENAMEISH_SEGMENT_RE = /[_()[\]{}<>]/u
const URL_PREFIX_HINT_RE = /^(?:https?:\/\/|ftp:\/\/|mailto:|www\.)/i
const URL_QUERY_OR_AUTH_HINT_RE = /[?#@]/u
const PATH_SEPARATOR_RE = /[\\/]/u
const DOMAINISH_TEXT_RE = /^[\p{L}\p{N}./\\-]+$/u
const DOMAIN_LABEL_RE = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/u
const PUNYCODE_TLD_RE = /^xn--[a-z0-9-]{2,59}$/i
const AMBIGUOUS_BARE_DOMAIN_EXTENSIONS = new Set([
  'ai',
  'md',
  'py',
  'rs',
  'sh',
  'zip',
])
const FILENAMEISH_LINK_EXTENSIONS = new Set([
  '7z',
  'ai',
  'astro',
  'avi',
  'bash',
  'bz2',
  'c',
  'cjs',
  'cpp',
  'cs',
  'csv',
  'doc',
  'docx',
  'fish',
  'flac',
  'gif',
  'go',
  'gz',
  'h',
  'hpp',
  'html',
  'java',
  'jpeg',
  'jpg',
  'js',
  'json',
  'jsx',
  'kt',
  'md',
  'mdx',
  'mjs',
  'mov',
  'mp3',
  'mp4',
  'pdf',
  'php',
  'png',
  'ppt',
  'pptx',
  'ps1',
  'py',
  'rar',
  'rb',
  'rs',
  'sh',
  'sql',
  'svg',
  'swift',
  'svelte',
  'tar',
  'tgz',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'wav',
  'webp',
  'xls',
  'xlsx',
  'xml',
  'yaml',
  'yml',
  'zip',
  'zsh',
])

function isPlausibleBareDomain(text: string) {
  const labels = text.split('.')
  if (labels.length < 2)
    return false

  const tld = labels[labels.length - 1]?.toLowerCase() ?? ''
  if (!(DOMAIN_LABEL_RE.test(tld) || PUNYCODE_TLD_RE.test(tld)))
    return false

  return labels.every(label => DOMAIN_LABEL_RE.test(label))
}

function hasDomainAuthorityPrefix(text: string) {
  const prefix = text.split(/[\\/]/)[0] ?? ''
  return isPlausibleBareDomain(prefix)
}

function isUppercaseFilenameSegment(segment: string) {
  const lettersOnly = segment.replace(/[^a-z]/gi, '')
  return lettersOnly.length >= 2 && lettersOnly === lettersOnly.toUpperCase()
}

function hasStrongFilenameSignals(linkText: string) {
  if (FILENAMEISH_SEGMENT_RE.test(linkText))
    return true

  if (!DOMAINISH_TEXT_RE.test(linkText))
    return true

  if (PATH_SEPARATOR_RE.test(linkText))
    return !hasDomainAuthorityPrefix(linkText)

  const extensionless = linkText.replace(FILENAMEISH_EXTENSION_RE, '')
  const filenameLikeSegments = extensionless.split('.').filter(Boolean)
  return filenameLikeSegments.some(isUppercaseFilenameSegment)
}

export function shouldDemoteFilenameLikeLinkify(linkText: string) {
  if (!linkText || URL_PREFIX_HINT_RE.test(linkText) || URL_QUERY_OR_AUTH_HINT_RE.test(linkText))
    return false

  const extensionMatch = linkText.match(FILENAMEISH_EXTENSION_RE)
  if (!extensionMatch)
    return false

  const extension = String(extensionMatch[1] ?? '').toLowerCase()
  if (!FILENAMEISH_LINK_EXTENSIONS.has(extension))
    return false

  // Extensions like `.ai` and `.md` can be both real bare-domain TLDs and
  // common filenames. Keep those linkified unless we also see stronger
  // filename-only signals such as path separators, underscores, brackets, or
  // all-uppercase filename segments like `README`.
  if (!AMBIGUOUS_BARE_DOMAIN_EXTENSIONS.has(extension))
    return true

  return hasStrongFilenameSignals(linkText)
}
