// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TurnChangesCard from '../../src/renderer/src/components/TurnChangesCard.vue'

describe('TurnChangesCard', () => {
  it('收起态显示摘要行，展开后渲染文件行并按 basename 发出 openFile', async () => {
    const wrapper = mount(TurnChangesCard, {
      props: { files: ['src/renderer/src/App.vue', 'README.md'] }
    })
    expect(wrapper.text()).toContain('更改 2 个文件')
    expect(wrapper.find('.turn-changes-list').exists()).toBe(false)

    await wrapper.get('.turn-changes-summary').trigger('click')
    const rows = wrapper.findAll('.turn-changes-file')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.get('strong').text()).toBe('App.vue')
    expect(rows[0]!.get('.turn-changes-dir').text()).toBe('src/renderer/src/')
    expect(rows[0]!.attributes('title')).toBe('src/renderer/src/App.vue')
    expect(rows[1]!.get('strong').text()).toBe('README.md')

    await rows[0]!.trigger('click')
    expect(wrapper.emitted('openFile')?.[0]).toEqual(['App.vue'])
  })

  it('空清单不渲染任何内容', () => {
    const wrapper = mount(TurnChangesCard, { props: { files: [] } })
    expect(wrapper.find('.turn-changes').exists()).toBe(false)
  })
})
