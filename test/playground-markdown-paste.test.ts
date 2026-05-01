import { describe, expect, it } from 'vitest'
import { normalizePastedMarkdownNewlines, resolveMarkdownTextareaPaste } from '../playground-shared/markdownPaste'

describe('playground markdown paste helpers', () => {
  it('converts literal \\n sequences into real line breaks', () => {
    expect(normalizePastedMarkdownNewlines('a\\nbxxx\\n\\nc')).toBe('a\nbxxx\n\nc')
  })

  it('keeps escaped \\\\n sequences unchanged', () => {
    expect(normalizePastedMarkdownNewlines('a\\\\nb')).toBe('a\\\\nb')
  })

  it('ignores pasted content that already contains real line breaks', () => {
    expect(resolveMarkdownTextareaPaste({
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
    }, 'a\\nb\nc')).toBeNull()
  })

  it('applies the normalized paste over the current textarea selection', () => {
    expect(resolveMarkdownTextareaPaste({
      value: 'beforeafter',
      selectionStart: 6,
      selectionEnd: 6,
    }, 'a\\nb')).toEqual({
      nextValue: 'beforea\nbafter',
      selectionStart: 9,
      selectionEnd: 9,
    })
  })
})
