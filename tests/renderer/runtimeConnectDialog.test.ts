// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RuntimeConnectDialog from '../../src/renderer/src/components/RuntimeConnectDialog.vue'

describe('RuntimeConnectDialog', () => {
  it('clears the token field immediately after submitting a typed external connection', async () => {
    const wrapper = mount(RuntimeConnectDialog, { props: { open: true, pending: false, error: null }, global: { stubs: { Teleport: true } } })
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('https://kimi.example.com')
    await inputs[1]!.setValue('secret-token')
    await wrapper.get('form').trigger('submit')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('connectExternal')).toEqual([['https://kimi.example.com', 'secret-token']])
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('')
  })
})
