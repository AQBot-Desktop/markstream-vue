export const INFOGRAPHIC_PREVIEW_MIN_HEIGHT = 360
export const INFOGRAPHIC_PREVIEW_MAX_HEIGHT = 500

export function parsePositiveNumber(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

export function estimateInfographicPreviewHeight(code: string) {
  const itemCount = code
    .split(/\r?\n/)
    .filter(line => /^\s*-\s+/.test(line))
    .length

  if (itemCount >= 3)
    return INFOGRAPHIC_PREVIEW_MAX_HEIGHT
  if (itemCount > 0)
    return 280 + itemCount * 60

  return INFOGRAPHIC_PREVIEW_MIN_HEIGHT
}

export function clampInfographicPreviewHeight(
  height: number,
  minHeight = INFOGRAPHIC_PREVIEW_MIN_HEIGHT,
  maxHeight: number | null = INFOGRAPHIC_PREVIEW_MAX_HEIGHT,
) {
  return maxHeight == null
    ? Math.max(minHeight, height)
    : Math.min(Math.max(minHeight, height), maxHeight)
}
