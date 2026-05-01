import { compressToEncodedURIComponent } from 'lz-string'
import { describe, expect, it } from 'vitest'
import { createMarkdownHash, createMarkdownHashAsync, decodeMarkdownHash, decodeMarkdownHashAsync } from '../playground-shared/testPageState'

describe('playground share payload', () => {
  it('prefers Brotli for large markdown payloads', async () => {
    const input = [
      '# Shareable markdown',
      '',
      '```ts',
      ...Array.from({ length: 400 }, (_, index) => `console.log('line-${index}', ${index ** 2})`),
      '```',
      '',
      ...Array.from({ length: 400 }, (_, index) => `- 第 ${index + 1} 行：你好，世界 ${index.toString(36)}`),
    ].join('\n')
    const legacyHash = `data=${compressToEncodedURIComponent(input)}`
    const deflateHash = createMarkdownHash(input)
    const hash = await createMarkdownHashAsync(input)

    expect(hash.startsWith('data=br:')).toBe(true)
    expect(hash.length).toBeLessThan(legacyHash.length)
    expect(hash.length).toBeLessThan(deflateHash.length)
    expect(await decodeMarkdownHashAsync(hash)).toBe(input)
  })

  it('continues to decode legacy raw and lz-string payloads', () => {
    const input = `<a href=" ">示例链接1</a >\n<a href="https://github.com">GitHub</a >\n<a href="https://www.wikipedia.org">维基百科</a >`
    const legacyRawHash = `data=raw:${encodeURIComponent(input)}`
    const legacyLzHash = `data=${compressToEncodedURIComponent(input)}`

    expect(decodeMarkdownHash(legacyRawHash)).toBe(input)
    expect(decodeMarkdownHash(legacyLzHash)).toBe(input)
  })
})
