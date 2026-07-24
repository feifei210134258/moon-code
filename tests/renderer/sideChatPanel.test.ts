// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SideChatPanel from '../../src/renderer/src/components/SideChatPanel.vue'

describe('SideChatPanel', () => {
  it('keeps BTW messages separate and emits typed sends and close actions', async () => {
    const wrapper = mount(SideChatPanel, {
      props: {
        sideChat: {
          agentId: 'agent-btw-1',
          active: true,
          error: null,
          messages: [
            {
              id: 'side-user', sessionId: 'session-1', role: 'user',
              content: [{ type: 'text', text: '只检查测试' }], createdAt: '2026-07-24T00:00:00Z',
              promptId: 'prompt-1', status: 'completed'
            },
            {
              id: 'side-agent', sessionId: 'session-1', role: 'assistant',
              content: [{ type: 'text', text: '我会仅检查测试覆盖。' }], createdAt: '2026-07-24T00:00:01Z',
              promptId: 'prompt-1', status: 'pending'
            }
          ]
        },
        pending: false,
        error: null
      }
    })

    expect(wrapper.text()).toContain('BTW Side Chat')
    expect(wrapper.text()).toContain('Agent 正在回复')
    expect(wrapper.text()).toContain('我会仅检查测试覆盖。')
    await wrapper.get('textarea').setValue('继续检查 Side Chat')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[aria-label="关闭 Side Chat"]').trigger('click')

    expect(wrapper.emitted('send')).toEqual([['agent-btw-1', '继续检查 Side Chat']])
    expect(wrapper.emitted('close')).toEqual([['agent-btw-1']])
  })
})
