// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ProjectSidebar from '../../src/renderer/src/components/ProjectSidebar.vue'

const projects = [
  {
    id: 'workspace-a',
    name: 'Kimi Agent',
    expanded: true,
    sessions: [
      { id: 'session-a', title: '实现 Session 生命周期', relativeTime: '2m' },
      { id: 'session-b', title: '完善浏览器批注', relativeTime: '9m' }
    ]
  },
  {
    id: 'workspace-b',
    name: 'Website',
    expanded: true,
    sessions: [{ id: 'session-c', title: 'Landing Page', relativeTime: '1h' }]
  }
]

function mountSidebar() {
  return mount(ProjectSidebar, {
    attachTo: document.body,
    props: {
      projects,
      activeWorkspaceId: 'workspace-a',
      activeSessionId: 'session-a',
      lifecyclePending: null,
      lifecycleError: null
    }
  })
}

async function clickSessionMenuAction(label: string): Promise<void> {
  const menu = [...document.querySelectorAll('.tree-menu-overlay.session-menu')].at(-1)
  expect(menu).not.toBeNull()
  const button = [...menu!.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
  expect(button).toBeDefined()
  ;(button as HTMLButtonElement).click()
  await nextTick()
}

describe('ProjectSidebar', () => {
  it('searches sessions across projects and creates in the selected workspace', async () => {
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-icon-button').exists()).toBe(false)
    expect(wrapper.find('[aria-label="添加项目"]').exists()).toBe(false)
    await wrapper.get('[aria-label="搜索任务"]').setValue('浏览器')
    expect(wrapper.text()).toContain('完善浏览器批注')
    expect(wrapper.text()).not.toContain('Landing Page')

    await wrapper.get('.new-task-button').trigger('click')
    expect(wrapper.emitted('createSession')).toEqual([['workspace-a']])
    expect(wrapper.find('.project-row-wrap.is-active .project-action-area').exists()).toBe(true)
    wrapper.unmount()
  })

  it('exposes rename, fork, export and guarded archive actions', async () => {
    const confirm = vi.fn(() => true)
    window.confirm = confirm
    const wrapper = mountSidebar()
    await wrapper.get('[aria-label="实现 Session 生命周期 任务操作"]').trigger('click')
    expect([...document.querySelectorAll('.tree-menu-overlay.session-menu')].at(-1)).not.toBeUndefined()
    await clickSessionMenuAction('创建分叉')
    expect(wrapper.emitted('forkSession')).toEqual([['session-a']])

    await wrapper.get('[aria-label="实现 Session 生命周期 任务操作"]').trigger('click')
    await clickSessionMenuAction('导出 ZIP')
    expect(wrapper.emitted('exportSession')).toEqual([['session-a']])

    await wrapper.get('[aria-label="实现 Session 生命周期 任务操作"]').trigger('click')
    await clickSessionMenuAction('归档')
    expect(confirm).toHaveBeenCalledOnce()
    expect(wrapper.emitted('archiveSession')).toEqual([['session-a']])
    wrapper.unmount()
  })

  it('loads older sessions and exposes child-session discovery', async () => {
    const wrapper = mount(ProjectSidebar, {
      props: {
        projects,
        activeWorkspaceId: 'workspace-a',
        activeSessionId: 'session-a',
        lifecyclePending: null,
        lifecycleError: null,
        sessionPageHasMore: true,
        sessionPagePending: false
      }
    })
    await wrapper.get('.session-load-more').trigger('click')
    expect(wrapper.emitted('loadMoreSessions')).toEqual([[]])
    await wrapper.get('[aria-label="实现 Session 生命周期 任务操作"]').trigger('click')
    await clickSessionMenuAction('查看子任务')
    expect(wrapper.emitted('loadSessionChildren')).toEqual([['session-a']])
    wrapper.unmount()
  })
})
