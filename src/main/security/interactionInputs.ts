import type { QuestionAnswerInput } from '../../shared/contracts.js'

export interface ApprovalResponse {
  decision: 'approved' | 'rejected' | 'cancelled'
  scope?: 'session'
  feedback?: string
  selectedLabel?: string
}

/** 审批回应的 IPC 入参校验：合法 decision/scope，可选 feedback/selectedLabel 限长。 */
export function validateApprovalResponse(response: unknown): ApprovalResponse {
  if (!isRecord(response)) throw new TypeError('Invalid Kimi approval response')
  const decision = response.decision
  const scope = response.scope
  const feedback = response.feedback
  const selectedLabel = response.selectedLabel
  if (
    (decision !== 'approved' && decision !== 'rejected' && decision !== 'cancelled') ||
    (scope !== undefined && scope !== 'session') ||
    (feedback !== undefined && (typeof feedback !== 'string' || feedback.length > 20_000)) ||
    (selectedLabel !== undefined &&
      (typeof selectedLabel !== 'string' || selectedLabel.length < 1 || selectedLabel.length > 256))
  ) throw new TypeError('Invalid Kimi approval response')
  return {
    decision,
    ...(scope === undefined ? {} : { scope }),
    ...(feedback === undefined ? {} : { feedback }),
    ...(selectedLabel === undefined ? {} : { selectedLabel })
  }
}

export function validateQuestionAnswers(answers: unknown): Record<string, QuestionAnswerInput> {
  if (!isRecord(answers) || Object.keys(answers).length < 1 || Object.keys(answers).length > 50) {
    throw new TypeError('Invalid Kimi question answers')
  }
  for (const [itemId, answer] of Object.entries(answers)) {
    assertShortId(itemId)
    if (!isQuestionAnswer(answer)) throw new TypeError('Invalid Kimi question answer')
  }
  return answers as Record<string, QuestionAnswerInput>
}

function assertShortId(value: string): void {
  if (value.length < 1 || value.length > 256 || value.includes('\0')) {
    throw new TypeError('Invalid Kimi question item id')
  }
}

function isQuestionAnswer(value: unknown): value is QuestionAnswerInput {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'skipped') return hasOnlyKeys(value, ['kind'])
  if (value.kind === 'single') {
    return hasOnlyKeys(value, ['kind', 'option_id']) && isShortString(value.option_id)
  }
  if (value.kind === 'other') {
    return hasOnlyKeys(value, ['kind', 'text']) &&
      typeof value.text === 'string' &&
      value.text.length <= 20_000
  }
  if (value.kind === 'multi') {
    return hasOnlyKeys(value, ['kind', 'option_ids']) && isShortStringArray(value.option_ids, false)
  }
  if (value.kind === 'multi_with_other') {
    return hasOnlyKeys(value, ['kind', 'option_ids', 'other_text']) &&
      isShortStringArray(value.option_ids, true) &&
      typeof value.other_text === 'string' &&
      value.other_text.length <= 20_000
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function isShortString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
}

function isShortStringArray(value: unknown, allowEmpty: boolean): value is string[] {
  return Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.length <= 100 &&
    value.every(isShortString)
}
