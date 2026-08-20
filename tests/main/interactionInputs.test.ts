import { describe, expect, it } from 'vitest'
import {
  validateApprovalResponse,
  validateQuestionAnswers
} from '../../src/main/security/interactionInputs.js'

describe('question interaction IPC validation', () => {
  it('accepts every Kimi question answer variant', () => {
    const answers = {
      single: { kind: 'single', option_id: 'a' },
      multi: { kind: 'multi', option_ids: ['a', 'b'] },
      other: { kind: 'other', text: 'custom answer' },
      mixed: { kind: 'multi_with_other', option_ids: ['a'], other_text: 'custom' },
      skipped: { kind: 'skipped' }
    }

    expect(validateQuestionAnswers(answers)).toEqual(answers)
  })

  it('rejects malformed or over-permissive renderer input', () => {
    expect(() => validateQuestionAnswers({})).toThrow('Invalid Kimi question answers')
    expect(() => validateQuestionAnswers({ item: { kind: 'single', option_id: '' } })).toThrow()
    expect(() => validateQuestionAnswers({ item: { kind: 'skipped', injected: true } })).toThrow()
    expect(() => validateQuestionAnswers({ ['x'.repeat(257)]: { kind: 'skipped' } })).toThrow()
  })
})

describe('approval interaction IPC validation', () => {
  it('accepts a plain decision plus optional scope, feedback and selected label', () => {
    expect(validateApprovalResponse({ decision: 'approved' })).toEqual({ decision: 'approved' })
    expect(validateApprovalResponse({
      decision: 'rejected',
      scope: 'session',
      feedback: '第三点补充测试命令',
      selectedLabel: '批准计划'
    })).toEqual({
      decision: 'rejected',
      scope: 'session',
      feedback: '第三点补充测试命令',
      selectedLabel: '批准计划'
    })
    expect(validateApprovalResponse({ decision: 'cancelled', feedback: '' })).toEqual({
      decision: 'cancelled', feedback: ''
    })
  })

  it('rejects malformed or over-permissive approval input', () => {
    expect(() => validateApprovalResponse({})).toThrow('Invalid Kimi approval response')
    expect(() => validateApprovalResponse(null)).toThrow()
    expect(() => validateApprovalResponse({ decision: 'maybe' })).toThrow()
    expect(() => validateApprovalResponse({ decision: 'approved', scope: 'global' })).toThrow()
    expect(() => validateApprovalResponse({ decision: 'approved', feedback: 42 })).toThrow()
    expect(() => validateApprovalResponse({ decision: 'approved', feedback: 'x'.repeat(20_001) })).toThrow()
    expect(() => validateApprovalResponse({ decision: 'approved', selectedLabel: '' })).toThrow()
    expect(() => validateApprovalResponse({ decision: 'approved', selectedLabel: 'x'.repeat(257) })).toThrow()
  })
})
