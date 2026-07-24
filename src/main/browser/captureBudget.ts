const MAX_SCREENSHOT_PIXELS = 20_000_000

export function captureSizeWithinBudget(
  width: number | null,
  height: number | null,
  deviceScaleFactor: number,
  fullPage: boolean
): { width: number; height: number } {
  const pixels = width === null || height === null
    ? Number.POSITIVE_INFINITY
    : width * height * deviceScaleFactor * deviceScaleFactor
  if (
    width === null || height === null || width <= 0 || height <= 0 ||
    !Number.isFinite(pixels) || pixels > MAX_SCREENSHOT_PIXELS
  ) {
    throw new Error(fullPage
      ? 'Page is too large for a full-page screenshot'
      : 'Viewport is too large for a screenshot')
  }
  return { width, height }
}
