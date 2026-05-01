import { deflateSync, inflateSync } from 'fflate'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

export interface FrameworkTarget {
  id: string
  origin: string
  localPort: number | null
}

export interface LocationLike {
  hostname: string
  protocol: string
}

export type TestPageViewMode = 'lab' | 'preview'

const FALLBACK_ORIGIN = 'https://markstream.local'
const RAW_PREFIX = 'raw:'
const DEFLATE_PREFIX = 'z:'
const BROTLI_PREFIX = 'br:'
const BASE64_CHUNK_SIZE = 0x8000

interface BrotliCompressModule {
  compress: (input: Uint8Array, options?: { quality?: number }) => Promise<Uint8Array>
  decompress: (input: Uint8Array) => Promise<Uint8Array>
  default?: BrotliCompressModule
}

let brotliCompressPromise: Promise<BrotliCompressModule> | null = null

async function loadBrotliCompress() {
  brotliCompressPromise ||= import('brotli-compress').then((module) => {
    const loaded = module as BrotliCompressModule
    return loaded.compress ? loaded : loaded.default!
  })
  return brotliCompressPromise
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_SIZE)
    binary += String.fromCharCode(...bytes.subarray(index, index + BASE64_CHUNK_SIZE))

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeBase64Url(payload: string) {
  const normalized = payload
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(payload.length + ((4 - payload.length % 4) % 4), '=')

  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)

  return bytes
}

function encodeDeflatedPayload(markdown: string) {
  try {
    const compressed = deflateSync(new TextEncoder().encode(markdown), { level: 9 })
    return `${DEFLATE_PREFIX}${encodeBase64Url(compressed)}`
  }
  catch {
    return ''
  }
}

async function encodeBrotliPayload(markdown: string) {
  try {
    const brotli = await loadBrotliCompress()
    const compressed = await brotli.compress(new TextEncoder().encode(markdown), { quality: 11 })
    return `${BROTLI_PREFIX}${encodeBase64Url(compressed)}`
  }
  catch {
    return ''
  }
}

export function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export function encodeMarkdownPayload(markdown: string) {
  if (!markdown)
    return ''

  const encodedRaw = encodeURIComponent(markdown)
  const rawPayload = `${RAW_PREFIX}${encodedRaw}`
  const legacyCompressed = compressToEncodedURIComponent(markdown)
  const deflated = encodeDeflatedPayload(markdown)

  const candidates = [rawPayload, legacyCompressed, deflated].filter(Boolean)
  if (!candidates.length)
    return ''

  return candidates.reduce((shortest, candidate) => candidate.length < shortest.length ? candidate : shortest)
}

export async function encodeMarkdownPayloadAsync(markdown: string) {
  if (!markdown)
    return ''

  const currentPayload = encodeMarkdownPayload(markdown)
  const brotliPayload = await encodeBrotliPayload(markdown)
  const candidates = [currentPayload, brotliPayload].filter(Boolean)
  if (!candidates.length)
    return ''

  return candidates.reduce((shortest, candidate) => candidate.length < shortest.length ? candidate : shortest)
}

export function createMarkdownHash(markdown: string) {
  const payload = encodeMarkdownPayload(markdown)
  return payload ? `data=${payload}` : ''
}

export async function createMarkdownHashAsync(markdown: string) {
  const payload = await encodeMarkdownPayloadAsync(markdown)
  return payload ? `data=${payload}` : ''
}

export function decodeMarkdownHash(hash: string) {
  const matched = (hash || '').match(/^#?data=([^&]+)/)
  if (!matched?.[1])
    return null

  const payload = matched[1]
  if (payload.startsWith(RAW_PREFIX)) {
    try {
      return decodeURIComponent(payload.slice(RAW_PREFIX.length))
    }
    catch {
      return null
    }
  }

  if (payload.startsWith(DEFLATE_PREFIX)) {
    try {
      return new TextDecoder().decode(inflateSync(decodeBase64Url(payload.slice(DEFLATE_PREFIX.length))))
    }
    catch {
      return null
    }
  }

  if (payload.startsWith(BROTLI_PREFIX))
    return null

  try {
    return decompressFromEncodedURIComponent(payload) || null
  }
  catch {
    return null
  }
}

export async function decodeMarkdownHashAsync(hash: string) {
  const matched = (hash || '').match(/^#?data=([^&]+)/)
  if (!matched?.[1])
    return null

  const payload = matched[1]
  if (!payload.startsWith(BROTLI_PREFIX))
    return decodeMarkdownHash(hash)

  try {
    const brotli = await loadBrotliCompress()
    return new TextDecoder().decode(await brotli.decompress(decodeBase64Url(payload.slice(BROTLI_PREFIX.length))))
  }
  catch {
    return null
  }
}

export function withMarkdownHash(baseUrl: string, markdown: string) {
  const nextHash = createMarkdownHash(markdown)
  if (!nextHash)
    return baseUrl

  const isAbsolute = /^[a-z]+:\/\//i.test(baseUrl)
  const url = new URL(baseUrl, FALLBACK_ORIGIN)
  url.hash = nextHash

  if (isAbsolute)
    return url.toString()

  return `${url.pathname}${url.search}${url.hash}`
}

export async function withMarkdownHashAsync(baseUrl: string, markdown: string) {
  const nextHash = await createMarkdownHashAsync(markdown)
  if (!nextHash)
    return baseUrl

  const isAbsolute = /^[a-z]+:\/\//i.test(baseUrl)
  const url = new URL(baseUrl, FALLBACK_ORIGIN)
  url.hash = nextHash

  if (isAbsolute)
    return url.toString()

  return `${url.pathname}${url.search}${url.hash}`
}

export function resolveTestPageViewMode(search: string): TestPageViewMode {
  const params = new URLSearchParams(search)
  return params.get('view') === 'preview' ? 'preview' : 'lab'
}

export function withTestPageViewMode(baseUrl: string, viewMode: TestPageViewMode = 'lab') {
  const isAbsolute = /^[a-z]+:\/\//i.test(baseUrl)
  const url = new URL(baseUrl, FALLBACK_ORIGIN)

  if (viewMode === 'preview')
    url.searchParams.set('view', 'preview')
  else
    url.searchParams.delete('view')

  if (isAbsolute)
    return url.toString()

  return `${url.pathname}${url.search}${url.hash}`
}

export function buildTestPageHref(
  baseUrl: string,
  markdown: string,
  viewMode: TestPageViewMode = 'lab',
) {
  return withMarkdownHash(withTestPageViewMode(baseUrl, viewMode), markdown)
}

export async function buildTestPageHrefAsync(
  baseUrl: string,
  markdown: string,
  viewMode: TestPageViewMode = 'lab',
) {
  return withMarkdownHashAsync(withTestPageViewMode(baseUrl, viewMode), markdown)
}

export function resolveFrameworkTestHref(
  framework: FrameworkTarget,
  currentFrameworkId: string,
  markdown: string,
  locationLike?: LocationLike,
  viewMode: TestPageViewMode = 'lab',
) {
  let baseUrl = framework.id === currentFrameworkId
    ? '/test'
    : `${framework.origin}/test`

  if (
    framework.id !== currentFrameworkId
    && locationLike
    && framework.localPort
    && isLocalHost(locationLike.hostname)
  ) {
    baseUrl = `${locationLike.protocol}//${locationLike.hostname}:${framework.localPort}/test`
  }

  return buildTestPageHref(baseUrl, markdown, viewMode)
}
