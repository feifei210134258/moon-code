// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ApprovalCard from '../../src/renderer/src/components/ApprovalCard.vue'
import QuestionCard from '../../src/renderer/src/components/QuestionCard.vue'
import type { ApprovalRequestView, QuestionRequestView } from '../../src/shared/contracts.js'

const approval: ApprovalRequestView = {
  approvalId: 'approval-1',
  toolCallId: 'tool-1',
  toolName: 'Shell',
  action: '运行测试',
  display: 'pnpm test',
  createdAt: '2026-07-23T00:00:00.000Z',
  expiresAt: '2026-07-23T00:05:00.000Z'
}

const question: QuestionRequestView = {
  questionId: 'question-1',
  toolCallId: 'tool-1',
  createdAt: '2026-07-23T00:00:00.000Z',
  questions: [
    {
      id: 'framework',
      question: '选择框架',
      options: [
        { id: 'vue', label: 'Vue', recommended: true },
        { id: 'react', label: 'React', recommended: false }
      ],
      multiSelect: false,
      allowOther: false
    },
    {
      id: 'features',
      question: '选择能力',
      options: [
        { id: 'browser', label: 'Browser', recommended: false },
        { id: 'css', label: 'CSS', recommended: false }
      ],
      multiSelect: true,
      allowOther: true,
      otherLabel: '补充能力'
    }
  ]
}

describe('ApprovalCard', () => {
  it('emits the three official approval decision shapes', async () => {
    const wrapper = mount(ApprovalCard, { props: { approval, pending: false } })

    await wrapper.get('button:nth-of-type(1)').trigger('click')
    await wrapper.get('button:nth-of-type(2)').trigger('click')
    await wrapper.get('button:nth-of-type(3)').trigger('click')

    expect(wrapper.emitted('respond')).toEqual([
      [{ decision: 'rejected' }],
      [{ decision: 'approved', scope: 'session' }],
      [{ decision: 'approved' }]
    ])
  })

  it('blocks duplicate decisions while a request is pending', () => {
    const wrapper = mount(ApprovalCard, { props: { approval, pending: true } })
    expect(wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })
})

describe('QuestionCard', () => {
  it('builds single and multi-with-other answers before submitting', async () => {
    const wrapper = mount(QuestionCard, { props: { request: question, pending: false } })

    const next = wrapper.findAll('button').find((button) => button.text().includes('下一项'))
    expect(next).toBeDefined()
    await next!.trigger('click')

    const css = wrapper.findAll('button').find((button) => button.text().includes('CSS'))
    expect(css).toBeDefined()
    await css!.trigger('click')
    await wrapper.get('input').setValue('HTML 批注')

    const submit = wrapper.findAll('button').find((button) => button.text().includes('提交回答'))
    expect(submit).toBeDefined()
    await submit!.trigger('click')

    expect(wrapper.emitted('answer')).toEqual([[
      {
        framework: { kind: 'single', option_id: 'vue' },
        features: {
          kind: 'multi_with_other',
          option_ids: ['css'],
          other_text: 'HTML 批注'
        }
      }
    ]])
  })

  it('uses the official dismiss path for giving up a question card', async () => {
    const wrapper = mount(QuestionCard, { props: { request: question, pending: false } })
    const dismiss = wrapper.findAll('button').find((button) => button.text() === '放弃')
    expect(dismiss).toBeDefined()
    await dismiss!.trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
