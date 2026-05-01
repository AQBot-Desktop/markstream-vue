import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('sanitizeHtmlContent', () => {
  it('removes dangerous attrs, unsafe urls, and blocked tags', () => {
    const html = sanitizeHtmlContent('<div onclick="evil()">Hello <img src="x" onerror="evil()"><a href="javascript:alert(1)" title="ok">Link</a><script>alert(1)</script></div>')

    expect(html).toContain('<div>Hello <img src="x"><a title="ok">Link</a></div>')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('preserves whitespace around safe inline html', () => {
    const html = sanitizeHtmlContent('Hello <span data-safe="1">world</span> !')

    expect(html).toBe('Hello <span data-safe="1">world</span> !')
  })
})
