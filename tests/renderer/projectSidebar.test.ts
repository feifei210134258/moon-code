// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { PhFolderSimple } from '@phosphor-icons/vue'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import FolderSimpleOpenIcon from '../../src/renderer/src/components/icons/FolderSimpleOpenIcon.vue'
import ProjectSidebar from '../../src/renderer/src/components/ProjectSidebar.vue'

const projects = [
  {
    id: 'workspace-a',
    name: 'Kimi Agent',
    expanded: true,
    sessions: [
      { id: 'session-a', title: '实现 Session 生命周期', relativeTime: '2m', tone: 'running' as const },
      { id: 'session-b', title: '完善浏览器批注', relativeTime: '9m', tone: 'completed' as const }
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
  it('shows a loading indicator for running sessions and a completed dot for finished sessions', () => {
    const wrapper = mountSidebar()
    expect(wrapper.get('.session-status.is-running').find('.spin').exists()).toBe(true)
    expect(wrapper.get('.session-status.is-running').attributes('title')).toBe('进行中')
    expect(wrapper.get('.session-status.is-completed').find('i').exists()).toBe(true)
    expect(wrapper.get('.session-status.is-completed').attributes('title')).toBe('已结束')
    expect(wrapper.findAll('.session-status')).toHaveLength(2)
    expect(wrapper.findAll('.session-row')[2]?.find('.session-status').exists()).toBe(false)
    wrapper.unmount()
  })

  it('searches sessions across projects and creates in the selected workspace', async () => {
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-icon-button').exists()).toBe(false)
    expect(wrapper.find('[aria-label="添加项目"]').exists()).toBe(false)
    await wrapper.get('[aria-label="搜索任务"]').setValue('浏览器')
    expect(wrapper.text()).toContain('完善浏览器批注')
    expect(wrapper.text()).not.toContain('Landing Page')

    await wrapper.get('.new-task-button').trigger('click')
    expect(wrapper.emitted('createSession')).toEqual([['workspace-a']])
    expect(wrapper.find('.project-row-wrap.is-active').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the project visually inactive when one of its sessions is selected and closes tree menus with Escape', async () => {
    const wrapper = mountSidebar()
    expect(wrapper.find('.project-row-wrap.is-active').exists()).toBe(false)
    await wrapper.get('[aria-label="实现 Session 生命周期 任务操作"]').trigger('click')
    expect(document.querySelector('.tree-menu-overlay.session-menu')).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.querySelector('.tree-menu-overlay.session-menu')).toBeNull()
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

  it('offers BTW side chat only on the active session menu', async () => {
    const wrapper = mountSidebar()
    await wrapper.get('[aria-label="完善浏览器批注 任务操作"]').trigger('click')
    let menu = [...document.querySelectorAll('.tree-menu-overlay.session-menu')].at(-1)!
    expect(menu.textContent).not.toContain('BTW 侧边会话')

    await wrapper.get('[aria-label="实现 Session 生命周期 任务操作"]').trigger('click')
    menu = [...document.querySelectorAll('.tree-menu-overlay.session-menu')].at(-1)!
    const btw = [...menu.querySelectorAll('button')].find((item) => item.textContent?.includes('BTW 侧边会话'))
    expect(btw).toBeDefined()
    ;(btw as HTMLButtonElement).click()
    await nextTick()
    expect(wrapper.emitted('startSideChat')).toEqual([[]])
    wrapper.unmount()
  })

  it('shows an open-folder icon for expanded projects and a closed one for collapsed projects', () => {
    const wrapper = mount(ProjectSidebar, {
      props: {
        projects: [
          projects[0]!,
          { ...projects[1]!, expanded: false }
        ],
        activeWorkspaceId: 'workspace-a',
        activeSessionId: 'session-a',
        lifecyclePending: null,
        lifecycleError: null
      }
    })
    const rows = wrapper.findAll('.project-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.findComponent(FolderSimpleOpenIcon).exists()).toBe(true)
    expect(rows[0]?.findComponent(PhFolderSimple).exists()).toBe(false)
    expect(rows[1]?.findComponent(FolderSimpleOpenIcon).exists()).toBe(false)
    expect(rows[1]?.findComponent(PhFolderSimple).exists()).toBe(true)
    wrapper.unmount()
  })

  it('exposes a per-project new-task button next to the project menu', async () => {
    const wrapper = mountSidebar()
    await wrapper.get('[aria-label="Website 新建任务"]').trigger('click')
    expect(wrapper.emitted('createSession')).toEqual([['workspace-b']])
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

  it('opens the session menu on row right-click, positioned at the pointer, with the same items as the more button', async () => {
    const wrapper = mountSidebar()
    wrapper.findAll('.session-row')[0]!.element.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 })
    )
    await nextTick()
    const contextMenu = [...document.querySelectorAll('.tree-menu-overlay.session-menu')].at(-1)!
    expect(contextMenu).toBeDefined()
    const expectedTop = Math.max(8, Math.min(200 + 6, window.innerHeight - 224))
    const expectedLeft = Math.max(8, Math.min(300 - 146, window.innerWidth - 146 - 8))
    expect((contextMenu as HTMLElement).style.top).toBe(`${Math.round(expectedTop)}px`)
    expect((contextMenu as HTMLElement).style.left).toBe(`${Math.round(expectedLeft)}px`)
    const contextItems = [...contextMenu.querySelectorAll('button')].map((item) => item.textContent)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    await wrapper.get('[aria-label="实现 Session 生命周期 任务操作"]').trigger('click')
    const dotsMenu = [...document.querySelectorAll('.tree-menu-overlay.session-menu')].at(-1)!
    expect((dotsMenu as HTMLElement).style.top).toBe('8px')
    const dotsItems = [...dotsMenu.querySelectorAll('button')].map((item) => item.textContent)
    expect(contextItems).toEqual(dotsItems)
    wrapper.unmount()
  })

  it('opens the project menu on row right-click', async () => {
    const wrapper = mountSidebar()
    wrapper.findAll('.project-row')[0]!.element.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 80 })
    )
    await nextTick()
    const projectMenu = [...document.querySelectorAll('.tree-menu-overlay')].find((menu) => menu.textContent?.includes('移除项目'))
    expect(projectMenu).toBeDefined()
    expect(projectMenu!.textContent).toContain('新建任务')
    expect(projectMenu!.textContent).toContain('重命名')
    const expectedTop = Math.max(8, Math.min(80 + 6, window.innerHeight - 224))
    expect((projectMenu as HTMLElement).style.top).toBe(`${Math.round(expectedTop)}px`)
    wrapper.unmount()
  })

  it('allows creating a task without projects, emitting an empty workspace id, and stays disabled while lifecycle is pending', async () => {
    const wrapper = mount(ProjectSidebar, {
      props: {
        projects: [],
        activeWorkspaceId: '',
        activeSessionId: '',
        lifecyclePending: null,
        lifecycleError: null
      }
    })
    const button = wrapper.get('.new-task-button')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(wrapper.emitted('createSession')).toEqual([['']])

    await wrapper.setProps({ lifecyclePending: 'creating' })
    expect(wrapper.get('.new-task-button').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('slides the session row open and archives directly on the red confirm, without a dialog', async () => {
    const confirm = vi.fn()
    window.confirm = confirm
    const wrapper = mountSidebar()
    const wrap = wrapper.findAll('.session-row-wrap')[0]!
    // The hover tray exposes a dedicated archive trigger beside the three-dot menu.
    expect(wrap.find('.session-archive-trigger').exists()).toBe(true)
    await wrap.get('.session-archive-trigger').trigger('click')
    expect(wrap.classes()).toContain('is-swipe-open')
    // The confirm layer is revealed on the right inside the same row.
    await wrap.get('.session-swipe-confirm').trigger('click')
    expect(confirm).not.toHaveBeenCalled()
    expect(wrapper.emitted('archiveSession')).toEqual([['session-a']])
    wrapper.unmount()
  })

  it('slides the row back instead of archiving when the pointer leaves the row', async () => {
    const wrapper = mountSidebar()
    const wrap = wrapper.findAll('.session-row-wrap')[0]!
    await wrap.get('.session-archive-trigger').trigger('click')
    expect(wrap.classes()).toContain('is-swipe-open')
    await wrap.trigger('mouseleave')
    expect(wrap.classes()).not.toContain('is-swipe-open')
    expect(wrapper.emitted('archiveSession')).toBeUndefined()
    wrapper.unmount()
  })

  it('reaches the session manager panel from the sidebar actions', async () => {
    setActivePinia(createPinia())
    const wrapper = mountSidebar()
    expect(wrapper.get('.session-manager-button').text()).toContain('会话管理')
    await wrapper.get('.session-manager-button').trigger('click')
    await nextTick()
    expect(document.querySelector('.session-manager-overlay')).not.toBeNull()
    expect(document.querySelector('.session-manager-card')).not.toBeNull()
    wrapper.unmount()
  })
})
