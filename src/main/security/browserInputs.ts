import type { BrowserBounds, BrowserViewport } from '../../shared/contracts.js'

const MAX_BROWSER_URL_LENGTH = 8_192

export function validateBrowserUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_BROWSER_URL_LENGTH) {
    throw new TypeError('Invalid browser URL')
  }
  let url: URL
  try {
    url = new URL(value.includes('://') ? value : `http://${value}`)
  } catch {
    throw new TypeError('Invalid browser URL')
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '') {
    throw new TypeError('Invalid browser URL')
  }
  return url.toString()
}

export function isAllowedBrowserNavigation(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.username === ''
      && url.password === ''
  } catch {
    return false
  }
}

export function validateBrowserBounds(value: unknown): BrowserBounds {
  if (!isRecord(value)) throw new TypeError('Invalid browser bounds')
  const x = boundedInteger(value.x, 0, 10_000)
  const y = boundedInteger(value.y, 0, 10_000)
  const width = boundedInteger(value.width, 1, 4_000)
  const height = boundedInteger(value.height, 1, 4_000)
  if (x === null || y === null || width === null || height === null) {
    throw new TypeError('Invalid browser bounds')
  }
  return { x, y, width, height }
}

export function validateBrowserViewport(value: unknown): BrowserViewport {
  if (!isRecord(value)) throw new TypeError('Invalid browser viewport')
  const mode = value.mode
  if (mode === 'auto') return { mode, width: null, height: null, deviceScaleFactor: 1 }
  if (mode !== 'desktop' && mode !== 'tablet' && mode !== 'mobile' && mode !== 'custom') {
    throw new TypeError('Invalid browser viewport')
  }
  const width = boundedInteger(value.width, 240, 2_560)
  const height = boundedInteger(value.height, 240, 2_560)
  const deviceScaleFactor = boundedNumber(value.deviceScaleFactor, 0.5, 4)
  if (width === null || height === null || deviceScaleFactor === null) {
    throw new TypeError('Invalid browser viewport')
  }
  return { mode, width, height, deviceScaleFactor }
}

export function validateBrowserRequestId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || /[\r\n\0]/.test(value)) {
    throw new TypeError('Invalid browser request id')
  }
  return value
}

export function validateBrowserWorkspaceScope(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || /[\r\n\0]/.test(value)) {
    throw new TypeError('Invalid browser workspace scope')
  }
  return value
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
