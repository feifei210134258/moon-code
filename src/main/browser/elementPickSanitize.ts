import type { BrowserPickedElement, BrowserPickedElementStyle } from '../../shared/contracts.js'

export const MAX_PICKED_ELEMENTS = 20
const MAX_SELECTOR = 500
const MAX_XPATH = 500
const MAX_TAG = 50
const MAX_ARIA_LABEL = 200
const MAX_TEXT_SNIPPET = 300
const MAX_PAGE_URL = 4_000
const MAX_PAGE_TITLE = 512
const MAX_STYLE_VALUE = 120
const STYLE_FIELDS = [
  'display', 'position', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
  'color', 'background', 'padding', 'margin', 'border', 'borderRadius'
] as const

/** 校验并裁剪主进程中网页元素选择的结果；URL/标题经 redact 变换后再做长度上限。 */
export function sanitizePickedElements(
  value: unknown,
  redactUrl: (value: string) => string,
  redactText: (value: string) => string
): BrowserPickedElement[] {
  if (!Array.isArray(value)) throw new TypeError('Invalid picked elements')
  const entries = value.slice(0, MAX_PICKED_ELEMENTS)
  return entries.map((item) => {
    const root = asRecord(item)
    const rect = asRecord(root.rect)
    const ariaLabel = optionalBoundedString(root.ariaLabel, 'ariaLabel', MAX_ARIA_LABEL)
    const styles = pickedElementStyles(root.styles)
    return {
      selector: boundedString(root.selector, 'selector', MAX_SELECTOR),
      xpath: boundedString(root.xpath, 'xpath', MAX_XPATH),
      tag: boundedString(root.tag, 'tag', MAX_TAG),
      ariaLabel,
      textSnippet: boundedString(root.textSnippet, 'textSnippet', MAX_TEXT_SNIPPET),
      rect: {
        x: finiteBounded(rect.x, -100_000, 100_000_000, 'picked element rect x'),
        y: finiteBounded(rect.y, -100_000, 100_000_000, 'picked element rect y'),
        width: finiteBounded(rect.width, 0, 100_000_000, 'picked element rect width'),
        height: finiteBounded(rect.height, 0, 100_000_000, 'picked element rect height')
      },
      pageUrl: boundedText(redactUrl(boundedString(root.pageUrl, 'pageUrl', MAX_PAGE_URL)), MAX_PAGE_URL),
      pageTitle: boundedText(redactText(boundedString(root.pageTitle, 'pageTitle', MAX_PAGE_TITLE)), MAX_PAGE_TITLE),
      ...(styles === undefined ? {} : { styles })
    }
  })
}

/** 样式摘要是可选字段：缺失或结构非法（非对象、字段非字符串）时整体丢弃。 */
function pickedElementStyles(value: unknown): BrowserPickedElementStyle | undefined {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  for (const field of STYLE_FIELDS) {
    if (typeof record[field] !== 'string') return undefined
  }
  const read = (field: (typeof STYLE_FIELDS)[number]): string => boundedText(record[field] as string, MAX_STYLE_VALUE)
  return {
    display: read('display'),
    position: read('position'),
    fontFamily: read('fontFamily'),
    fontSize: read('fontSize'),
    fontWeight: read('fontWeight'),
    lineHeight: read('lineHeight'),
    color: read('color'),
    background: read('background'),
    padding: read('padding'),
    margin: read('margin'),
    border: read('border'),
    borderRadius: read('borderRadius')
  }
}

function optionalBoundedString(value: unknown, key: 'ariaLabel', limit: number): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new TypeError(`Invalid picked element ${key}`)
  return boundedText(value, limit)
}

function boundedString(value: unknown, key: string, limit: number): string {
  if (typeof value !== 'string' || value.length < 1) throw new TypeError(`Invalid picked element ${key}`)
  return boundedText(value, limit)
}

function finiteBounded(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`Invalid ${label}`)
  }
  return value
}

function boundedText(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}