import type {
  BrowserAnnotationMode,
  BrowserAnnotationSubmitInput
} from '../../shared/contracts.js'

const MAX_ID = 128
const MAX_COMMENT = 8_000
const MAX_URL = 4_000

export function validateAnnotationMode(value: unknown): BrowserAnnotationMode {
  if (value !== 'element' && value !== 'region') throw new TypeError('Invalid annotation mode')
  return value
}

export function validateAnnotationDraftId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_ID || !/^[A-Za-z0-9-]+$/.test(value)) {
    throw new TypeError('Invalid annotation draft id')
  }
  return value
}

export function validateAnnotationSubmitInput(value: unknown): BrowserAnnotationSubmitInput {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid annotation submission')
  }
  const input = value as Record<string, unknown>
  const comment = typeof input.comment === 'string' ? input.comment.trim() : ''
  const pageUrl = typeof input.pageUrl === 'string' ? input.pageUrl.trim() : ''
  if (comment.length < 1 || comment.length > MAX_COMMENT) throw new TypeError('Invalid annotation comment')
  if (pageUrl.length < 1 || pageUrl.length > MAX_URL) throw new TypeError('Invalid annotation page URL')
  if (
    typeof input.includeSelector !== 'boolean' ||
    typeof input.includeText !== 'boolean' ||
    typeof input.includeScreenshot !== 'boolean'
  ) throw new TypeError('Invalid annotation inclusion options')
  return {
    draftId: validateAnnotationDraftId(input.draftId),
    comment,
    pageUrl,
    includeSelector: input.includeSelector,
    includeText: input.includeText,
    includeScreenshot: input.includeScreenshot
  }
}

