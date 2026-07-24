// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentRoster from '../../src/renderer/src/components/AgentRoster.vue'

describe('AgentRoster', () => {
  it('keeps the roster compact and reveals authoritative output and usage', async () => {
    const wrapper = mount(AgentRoster, {
      props: {
        agents: [
          {
            id: 'main', role: 'main', name: 'Kimi', description: 'Main', status: 'working',
            subagentType: null, parentAgentId: null, parentToolCallId: null, swarmIndex: null,
            runInBackground: false, createdAt: null, startedAt: null, completedAt: null,
            suspendedReason: null, outputPreview: null, usage: null
          },
          {
            id: 'agent-1', role: 'subagent', name: 'explore', description: 'Inspect auth', status: 'completed',
            subagentType: 'explore', parentAgentId: 'main', parentToolCallId: 'tool-1', swarmIndex: 0,
            runInBackground: false, createdAt: null, startedAt: null, completedAt: null,
            suspendedReason: null, outputPreview: 'No credential leak found',
            usage: { inputTokens: 100, outputTokens: 25, cacheReadTokens: 20, cacheCreationTokens: 5, contextTokens: 256 }
          }
        ]
      }
    })

    expect(wrapper.find('.agent-roster-list').exists()).toBe(false)
    expect(wrapper.get('.agent-roster-summary').text()).toContain('1 个')
    await wrapper.get('.agent-roster-summary').trigger('click')
    expect(wrapper.get('.agent-roster-list').text()).toContain('No credential leak found')
    expect(wrapper.get('.agent-roster-list').text()).toContain('150 tokens')
    await wrapper.get('.agent-row').trigger('click')
    expect(wrapper.emitted('open')?.[0]?.[0]).toEqual(expect.objectContaining({ id: 'agent-1' }))
  })
})
