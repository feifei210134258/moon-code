// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentDetailPanel from '../../src/renderer/src/components/AgentDetailPanel.vue'

describe('AgentDetailPanel', () => {
  it('renders an agent-scoped transcript and can be closed without altering the main conversation', async () => {
    const wrapper = mount(AgentDetailPanel, {
      props: {
        agent: {
          id: 'agent-1', role: 'subagent', name: 'Reviewer', description: 'Review tests', status: 'completed',
          subagentType: 'review', parentAgentId: 'main', parentToolCallId: 'tool-parent', swarmIndex: 0,
          towerMode: null,
          runInBackground: false, model: 'kimi-for-coding', thinkingEffort: 'high',
          createdAt: null, startedAt: null, completedAt: null, suspendedReason: null,
          outputPreview: 'Covered', usage: null
        },
        transcript: {
          agentId: 'agent-1', hasMore: false,
          usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, contextTokens: null },
          messages: [{
            id: 'agent-message-1', sessionId: 'session-1', role: 'assistant',
            content: [{ type: 'text', text: '核心路径已有覆盖。' }], createdAt: '', promptId: 'turn-1', status: 'completed'
          }]
        },
        pending: false,
        error: null
      }
    })

    expect(wrapper.text()).toContain('Reviewer')
    expect(wrapper.text()).toContain('核心路径已有覆盖。')
    expect(wrapper.text()).toContain('15 tokens')
    await wrapper.get('[aria-label="关闭 Agent 详情"]').trigger('click')
    expect(wrapper.emitted('close')).toEqual([[]])
  })
})
