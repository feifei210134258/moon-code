import { describe, expect, it } from 'vitest'
import { sessionSnapshotSchema } from '../../packages/kimi-adapter/src/wire/schemas.js'

describe('Kimi interaction snapshot schemas', () => {
  it('parses pending interactions and applies official defaults for optional question flags', () => {
    const parsed = sessionSnapshotSchema.parse({
      as_of_seq: 8,
      epoch: 'epoch-1',
      session: {
        id: 'session-1',
        workspace_id: 'workspace-1',
        title: 'Interaction fixture',
        created_at: null,
        updated_at: null,
        busy: true,
        metadata: { cwd: '/workspace' },
        agent_config: { model: 'kimi-code' },
        usage: { input_tokens: 0, output_tokens: 0, context_tokens: 0, context_limit: 0 },
        permission_rules: [],
        message_count: 0,
        last_seq: 8
      },
      messages: { items: [], has_more: false },
      in_flight_turn: null,
      pending_approvals: [{
        approval_id: 'approval-1',
        session_id: 'session-1',
        tool_call_id: 'tool-1',
        tool_name: 'Shell',
        action: 'Run command',
        tool_input_display: 'pnpm test',
        created_at: null,
        expires_at: null
      }],
      pending_questions: [{
        question_id: 'question-1',
        session_id: 'session-1',
        questions: [{
          id: 'choice',
          question: 'Pick one',
          options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
        }],
        created_at: null
      }]
    })

    expect(parsed.pending_approvals[0]?.approval_id).toBe('approval-1')
    expect(parsed.pending_questions[0]?.questions[0]).toEqual(expect.objectContaining({
      multi_select: false,
      allow_other: false
    }))
  })
})
