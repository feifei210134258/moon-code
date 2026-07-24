// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SessionWarnings from '../../src/renderer/src/components/SessionWarnings.vue'

describe('SessionWarnings', () => {
  it('renders Kimi warning severity without inventing local status', () => {
    const wrapper = mount(SessionWarnings, {
      props: {
        warnings: [
          { code: 'agents_too_large', message: 'AGENTS.md 超出推荐长度', severity: 'warning' },
          { code: 'config_error', message: '配置无法读取', severity: 'error' }
        ],
        error: null
      }
    })
    expect(wrapper.text()).toContain('AGENTS.md 超出推荐长度')
    expect(wrapper.find('.is-warning').exists()).toBe(true)
    expect(wrapper.find('.is-error').exists()).toBe(true)
  })
})
