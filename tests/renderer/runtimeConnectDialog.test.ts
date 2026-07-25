// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RuntimeConnectDialog from '../../src/renderer/src/components/RuntimeConnectDialog.vue'

describe('RuntimeConnectDialog', () => {
  it('guides the user to install Kimi Code instead of offering runtime choices', async () => {
    const wrapper = mount(RuntimeConnectDialog, {
      props: { open: true, pending: false, error: '未发现系统 Kimi Code', missing: true },
      global: { stubs: { Teleport: true } }
    })

    expect(wrapper.text()).toContain('需要安装 Kimi Code CLI')
    expect(wrapper.get('.runtime-install-command').text()).toContain('npm install -g @moonshot-ai/kimi-code')
    expect(wrapper.find('input').exists()).toBe(false)

    await wrapper.get('.primary-button').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[]])
  })

  it('can be dismissed with Escape until the runtime state changes', async () => {
    const wrapper = mount(RuntimeConnectDialog, {
      props: { open: true, pending: false, error: '未发现系统 Kimi Code', missing: true },
      global: { stubs: { Teleport: true } }
    })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.runtime-connect-dialog').exists()).toBe(false)
  })
})
