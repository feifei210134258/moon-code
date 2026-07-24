import { describe, expect, it } from 'vitest'
import { validateQuestionAnswers } from '../../src/main/security/interactionInputs.js'

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
