// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { PhSparkle, PhTerminalWindow } from '@phosphor-icons/vue'
import { describe, expect, it } from 'vitest'
import ActivityBlock from '../../src/renderer/src/components/ActivityBlock.vue'

describe('ActivityBlock', () => {
  it('expands full thinking text without exposing it by default', async () => {
    const wrapper = mount(ActivityBlock, {
      props: {
        activity: {
          id: 'thinking-1',
          kind: 'thinking',
          label: 'Thinking',
          description: 'Inspect repository structure',
          detail: 'Inspect repository structure\nThen read package.json',
          status: 'done'
        }
      }
    })

    expect(wrapper.find('.thinking-detail').exists()).toBe(false)
    await wrapper.get('.activity-row').trigger('click')
    expect(wrapper.get('.thinking-detail').text()).toContain('Then read package.json')
    expect(wrapper.get('.activity-row').attributes('aria-expanded')).toBe('true')
  })

  it('renders running tool progress and expandable input/output streams', async () => {
    const wrapper = mount(ActivityBlock, {
      props: {
        activity: {
          id: 'tool-1',
          kind: 'tool',
          label: 'Shell',
          description: 'pnpm test',
          status: 'running',
          inputPreview: '{"command":"pnpm test"}',
          outputPreview: 'running tests',
          outputStream: 'stderr',
          progress: 35
        }
      }
    })

    const progress = wrapper.get('.activity-progress')
    expect(progress.attributes()).toEqual(expect.objectContaining({
      role: 'progressbar',
      'aria-label': '工具执行进度',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '35'
    }))
    expect(wrapper.get('.activity-progress span').attributes('style')).toContain('35%')
    await wrapper.get('.activity-row').trigger('click')
    expect(wrapper.findAll('.activity-detail-section')).toHaveLength(2)
    expect(wrapper.get('pre.is-stderr').text()).toBe('running tests')
  })

  it('uses a distinct sparkle icon for Skill activities', () => {
    const wrapper = mount(ActivityBlock, {
      props: {
        activity: {
          id: 'skill-1',
          kind: 'tool',
          label: 'Skill',
          description: '读取并使用技能',
          status: 'done'
        }
      }
    })

    expect(wrapper.findComponent(PhSparkle).exists()).toBe(true)
    expect(wrapper.findComponent(PhTerminalWindow).exists()).toBe(false)
  })

  it('opens failed activity details immediately', () => {
    const wrapper = mount(ActivityBlock, {
      props: {
        activity: {
          id: 'tool-error',
          kind: 'tool',
          label: 'WriteFile',
          description: '写入失败',
          status: 'error',
          outputPreview: 'permission denied'
        }
      }
    })

    expect(wrapper.get('.activity-details').text()).toContain('permission denied')
  })

  it('renders a bounded Tool Diff separately from the current Workspace Diff', async () => {
    const wrapper = mount(ActivityBlock, {
      props: {
        activity: {
          id: 'tool-diff-1', kind: 'tool', label: 'Edit', description: 'src/App.vue', status: 'done',
          toolDiff: {
            path: 'src/App.vue', before: '<h1>Old</h1>', after: '<h1>New</h1>', hunks: 1
          }
        }
      }
    })

    await wrapper.get('.activity-row').trigger('click')
    expect(wrapper.get('.tool-diff-panel').text()).toContain('工具 Diff')
    expect(wrapper.get('.tool-diff-panel').text()).toContain('src/App.vue')
    expect(wrapper.get('.tool-diff-columns').text()).toContain('<h1>Old</h1>')
    expect(wrapper.get('.tool-diff-columns').text()).toContain('<h1>New</h1>')
  })
})
