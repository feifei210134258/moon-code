import { describe, expect, it } from 'vitest'
import {
  appendLocalPromptDraft,
  moveLocalPromptDraft,
  prependLocalPromptDraft,
  removeLocalPromptDraft,
  type LocalPromptDraft
} from '../../src/renderer/src/utils/localPromptQueue.js'

function draft(id: string): LocalPromptDraft {
  return {
    id,
    sessionId: 'session-1',
    createdAt: '2026-07-24T00:00:00.000Z',
    input: {
      text: `Prompt ${id}`,
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual',
        planMode: false, swarmMode: false
      }
    }
  }
}

describe('local Prompt queue', () => {
  it('keeps editable drafts ordered without mutating the previous queue', () => {
    const first = appendLocalPromptDraft([], draft('a'))
    const second = appendLocalPromptDraft(first, draft('b'))
    const moved = moveLocalPromptDraft(second, 'b', -1)
    expect(first.map((item) => item.id)).toEqual(['a'])
    expect(second.map((item) => item.id)).toEqual(['a', 'b'])
    expect(moved.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('supports take-for-edit, removal and failure restoration', () => {
    const queue = [draft('a'), draft('b')]
    const result = removeLocalPromptDraft(queue, 'a')
    expect(result.removed?.input.text).toBe('Prompt a')
    expect(result.queue.map((item) => item.id)).toEqual(['b'])
    expect(prependLocalPromptDraft(result.queue, result.removed!).map((item) => item.id)).toEqual(['a', 'b'])
    expect(removeLocalPromptDraft(queue, 'missing')).toEqual({ queue, removed: null })
  })
})
