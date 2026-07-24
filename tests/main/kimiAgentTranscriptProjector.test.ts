import { describe, expect, it } from 'vitest'
import { projectAgentTranscript } from '../../src/main/kimi/KimiAgentTranscriptProjector.js'
import type { SessionTranscript } from '../../packages/kimi-adapter/src/wire/schemas.js'

describe('KimiAgentTranscriptProjector', () => {
  it('maps official agent-scoped turn frames into bounded independent output', () => {
    const transcript = {
      agent_id: 'agent-1',
      items: [{
        kind: 'turn', turnId: 'turn-agent-1', state: 'completed', prompt: '审查测试覆盖', startedAt: '2026-07-24T00:00:00.000Z',
        usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 3 },
        steps: [{
          kind: 'step', stepId: 'step-1', turnId: 'turn-agent-1', ordinal: 1, state: 'completed',
          frames: [
            { kind: 'thinking', frameId: 'frame-think', text: '先读取测试。' },
            { kind: 'text', frameId: 'frame-user', role: 'user', text: '不要重复显示我' },
            { kind: 'tool', frameId: 'frame-tool', toolCallId: 'tool-1', name: 'Read', state: 'error', error: '读取失败' },
            { kind: 'notice', frameId: 'frame-notice', level: 'warning', message: '结果可能不完整' },
            { kind: 'text', frameId: 'frame-text', role: 'assistant', text: '核心路径已有覆盖。' }
          ]
        }]
      }],
      has_more: false,
      tasks: [], interactions: [], attachments: [], todos: [], meta: {}, agents: [], pending_interactions: []
    } as unknown as SessionTranscript

    const result = projectAgentTranscript('session-1', 'agent-1', transcript)
    expect(result).toEqual(expect.objectContaining({ agentId: 'agent-1', hasMore: false }))
    expect(result.usage).toEqual({
      inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheCreationTokens: 0, contextTokens: null
    })
    expect(result.messages).toEqual([
      expect.objectContaining({
        role: 'user', createdAt: '2026-07-24T00:00:00.000Z',
        content: [{ type: 'text', text: '审查测试覆盖' }]
      }),
      expect.objectContaining({
        role: 'assistant',
        content: [
          { type: 'thinking', text: '先读取测试。' },
          expect.objectContaining({
            type: 'tool', toolCallId: 'tool-1', toolName: 'Read', state: 'error', outputPreview: '读取失败'
          }),
          { type: 'text', text: '[warning] 结果可能不完整' },
          { type: 'text', text: '核心路径已有覆盖。' }
        ]
      })
    ])
  })
})
