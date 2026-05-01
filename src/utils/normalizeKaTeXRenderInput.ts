export function normalizeKaTeXRenderInput(content: string) {
  if (!content)
    return ''

  return content
    // KaTeX maps U+00B7 to \cdotp, which breaks inside \text{...}.
    .replace(/·/g, '⋅')
    // U+2103 has no built-in metrics; split it into supported symbols.
    .replace(/℃/g, '°C')
}
