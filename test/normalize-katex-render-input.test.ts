import { describe, expect, it } from 'vitest'
import { normalizeKaTeXRenderInput } from '../src/utils/normalizeKaTeXRenderInput'

describe('normalizeKaTeXRenderInput', () => {
  it('normalizes unsupported KaTeX unit glyphs', () => {
    expect(normalizeKaTeXRenderInput('\\text{J/(kg·℃)}')).toBe('\\text{J/(kg⋅°C)}')
    expect(normalizeKaTeXRenderInput('\\Delta t=40℃')).toBe('\\Delta t=40°C')
  })

  it('leaves already safe math content unchanged', () => {
    expect(normalizeKaTeXRenderInput('E=mc^2')).toBe('E=mc^2')
    expect(normalizeKaTeXRenderInput('\\text{kg}')).toBe('\\text{kg}')
  })
})
