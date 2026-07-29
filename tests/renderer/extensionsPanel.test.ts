// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ExtensionsPanel from '../../src/renderer/src/components/ExtensionsPanel.vue'

const baseProps = {
  width: 382,
  activeTab: 'changes' as const,
      workspaceName: 'moon-code',
  fileList: {
    path: '.',
    items: [
      {
        path: 'src', name: 'src', kind: 'directory' as const, size: null, modifiedAt: null,
        mime: null, languageId: null, isBinary: false, gitStatus: 'modified' as const, childCount: 2
      },
      {
        path: 'README.md', name: 'README.md', kind: 'file' as const, size: 42, modifiedAt: null,
        mime: 'text/markdown', languageId: 'markdown', isBinary: false, gitStatus: null, childCount: null
      }
    ],
    truncated: false
  },
  fileListPending: false,
  fileListError: null,
  filePreview: {
    path: 'README.md', content: '# Kimi Agent', encoding: 'utf-8' as const, size: 12,
    truncated: false, mime: 'text/markdown', languageId: 'markdown', lineCount: 1, isBinary: false
  },
  gitStatus: {
    available: true,
    branch: 'main', ahead: 0, behind: 0, entries: { 'src/app.ts': 'modified' as const },
    additions: 2, deletions: 1, pullRequest: null
  },
  gitStatusPending: false,
  gitStatusError: null,
  browserState: {
    url: '', title: '', loading: false, canGoBack: false, canGoForward: false, visible: false,
    viewport: { mode: 'auto' as const, width: null, height: null, deviceScaleFactor: 1 },
    consoleEntries: [], networkEntries: [], error: null
  },
  browserPending: false,
  browserError: null,
  browserCapture: null
}

describe('ExtensionsPanel', () => {
  it('keeps only refresh in the panel header because the top bar owns expand and collapse', async () => {
    const wrapper = mount(ExtensionsPanel, { props: baseProps })
    const actions = wrapper.findAll('.extensions-header-actions button')

    expect(actions).toHaveLength(1)
    expect(actions[0]!.attributes('aria-label')).toBe('刷新文件和更改')
    expect(wrapper.find('[aria-label="收起扩展栏"]').exists()).toBe(false)
    await actions[0]!.trigger('click')
    expect(wrapper.emitted('refresh')).toEqual([[]])
  })

  it('renders authoritative Git status as a non-interactive scrollable file list', () => {
    const wrapper = mount(ExtensionsPanel, { props: baseProps })

    expect(wrapper.get('.git-summary').text()).toContain('main')
    expect(wrapper.find('.changed-files-list').exists()).toBe(true)
    expect(wrapper.get('.changed-file-row').element.tagName).toBe('DIV')
    expect(wrapper.find('.diff-panel').exists()).toBe(false)
    expect(wrapper.emitted('selectDiff')).toBeUndefined()
  })

  it('uses neutral guidance for a clean Workspace and a missing Git repository', async () => {
    const wrapper = mount(ExtensionsPanel, {
      props: {
        ...baseProps,
        gitStatus: { ...baseProps.gitStatus, entries: {}, additions: 0, deletions: 0 }
      }
    })

    expect(wrapper.get('.changed-files-panel').text()).toContain('工作区没有未提交更改。')
    expect(wrapper.find('.changed-files-panel .is-error').exists()).toBe(false)

    await wrapper.setProps({
      gitStatus: {
        available: false, branch: '', ahead: 0, behind: 0, entries: {},
        additions: 0, deletions: 0, pullRequest: null
      }
    })
    expect(wrapper.get('.changed-files-panel').text()).toContain('当前工作区未检测到可用的 Git 仓库。')
    expect(wrapper.find('.changed-files-panel .is-error').exists()).toBe(false)
    expect(wrapper.find('.git-summary').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps unexpected Git failures in the real error state', () => {
    const wrapper = mount(ExtensionsPanel, {
      props: { ...baseProps, gitStatus: null, gitStatusError: '无法读取 Git 状态' }
    })
    expect(wrapper.get('.changed-files-panel .extension-state.is-error').text()).toContain('无法读取 Git 状态')
    wrapper.unmount()
  })

  it('keeps the plan expanded without exposing the unfinished Diff viewer', () => {
    const wrapper = mount(ExtensionsPanel, {
      props: baseProps
    })

    expect(wrapper.find('.diff-panel').exists()).toBe(false)
    expect(wrapper.get('.todo-panel').text()).toContain('计划')
    expect(wrapper.findAll('.changes-view > section')).toHaveLength(3)
    expect(wrapper.find('.changed-files-panel').exists()).toBe(true)
    expect(wrapper.find('.plan-panel').exists()).toBe(true)
  })

  it('replaces the Plan placeholder with authoritative cancellable Kimi Tasks', async () => {
    const wrapper = mount(ExtensionsPanel, {
      props: {
        ...baseProps,
        tasks: [{
          id: 'task-1', sessionId: 'session-1', kind: 'bash', description: '运行测试',
          status: 'running', command: 'pnpm test', createdAt: null, startedAt: null,
          completedAt: null, outputPreview: '42 tests passed', outputBytes: 128
        }]
      }
    })
    expect(wrapper.get('.background-task-row').text()).toContain('运行测试')
    expect(wrapper.text()).not.toContain('适配切片接入')
    await wrapper.get('.background-task-row > button').trigger('click')
    expect(wrapper.emitted('cancelTask')).toEqual([['task-1']])
  })

  it('renders the latest authoritative Kimi Todo list under Changes', () => {
    const wrapper = mount(ExtensionsPanel, {
      props: {
        ...baseProps,
        todos: [{
          todoId: 'todo-1',
          items: [{ title: '读取 Kimi 状态', status: 'done' as const }, { title: '呈现计划', status: 'in_progress' as const }],
          updatedAt: '2026-07-24T00:00:00.000Z'
        }]
      }
    })

    expect(wrapper.get('.todo-panel header').text()).toContain('1/2')
    expect(wrapper.get('.todo-panel').text()).toContain('读取 Kimi 状态')
    expect(wrapper.get('.todo-panel').text()).toContain('进行中')
    expect(wrapper.find('.todo-panel li.is-done').exists()).toBe(true)
    expect(wrapper.find('.todo-panel li.is-in_progress').exists()).toBe(true)
  })

  it('routes directories and files through typed entry events without burying a preview below the list', async () => {
    const wrapper = mount(ExtensionsPanel, { props: { ...baseProps, activeTab: 'files' } })
    const rows = wrapper.findAll('.file-row')
    expect(rows).toHaveLength(2)
    await rows[0]!.trigger('click')
    await rows[1]!.trigger('click')

    expect(wrapper.emitted('openEntry')?.[0]?.[0]).toEqual(expect.objectContaining({ path: 'src', kind: 'directory' }))
    expect(wrapper.emitted('openEntry')?.[1]?.[0]).toEqual(expect.objectContaining({ path: 'README.md', kind: 'file' }))
    expect(wrapper.find('.file-preview-panel').exists()).toBe(false)
    expect(wrapper.findAll('.file-row')[1]!.classes()).toContain('is-active')
  })

  it('keeps the parent directory label visible and colors HTML file icons blue', () => {
    const wrapper = mount(ExtensionsPanel, {
      props: {
        ...baseProps,
        activeTab: 'files',
        fileList: {
          ...baseProps.fileList,
          path: 'src/pages',
          items: [{
            path: 'src/pages/index.html', name: 'index.html', kind: 'file' as const, size: 42,
            modifiedAt: null, mime: 'text/html', languageId: 'html', isBinary: false, gitStatus: null, childCount: null
          }]
        }
      }
    })

    expect(wrapper.get('.file-parent-row').text()).toContain('返回上一级')
    expect(wrapper.get('.file-row .is-html-file').classes()).toContain('is-html-file')
  })

  it('offers system open and confirmed deletion from a file row context menu', async () => {
    const confirm = vi.fn(() => true)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm })
    const wrapper = mount(ExtensionsPanel, {
      props: { ...baseProps, activeTab: 'files' },
      global: { stubs: { Teleport: true } }
    })
    const fileRow = wrapper.findAll('.file-row')[1]!

    await fileRow.trigger('contextmenu', { clientX: 120, clientY: 160 })
    expect(wrapper.get('.file-context-menu').text()).toContain('系统打开')
    await wrapper.findAll('.file-context-menu button')[0]!.trigger('click')
    expect(wrapper.emitted('openSystem')).toEqual([['README.md']])

    await fileRow.trigger('contextmenu', { clientX: 120, clientY: 160 })
    await wrapper.findAll('.file-context-menu button')[1]!.trigger('click')
    expect(confirm).toHaveBeenCalledWith('将文件“README.md”移到废纸篓？')
    expect(wrapper.emitted('trashEntry')).toEqual([['README.md']])
    Object.defineProperty(window, 'confirm', { configurable: true, value: undefined })
  })

  it('submits native file queries and routes search directories without trying to read them as files', async () => {
    const wrapper = mount(ExtensionsPanel, {
      props: {
        ...baseProps,
        activeTab: 'files',
        fileSearch: {
          items: [
            { path: 'src', name: 'src', kind: 'directory' as const, score: 0.91, matchPositions: [0] },
            { path: 'src/index.html', name: 'index.html', kind: 'file' as const, score: 0.88, matchPositions: [4] }
          ],
          truncated: false
        },
        fileGrep: {
          files: [{
            path: 'src/index.html',
            matches: [{ line: 12, column: 3, text: '<main>Ready</main>', before: [], after: [] }]
          }],
          filesScanned: 2,
          truncated: false,
          elapsedMs: 4
        }
      }
    })

    const forms = wrapper.findAll('.files-search-tools form')
    await forms[0]!.get('input').setValue(' src ')
    await forms[0]!.trigger('submit')
    await forms[1]!.get('input').setValue(' Ready ')
    await forms[1]!.trigger('submit')
    expect(wrapper.emitted('searchFiles')).toEqual([['src']])
    expect(wrapper.emitted('grepFiles')).toEqual([['Ready']])

    const resultButtons = wrapper.findAll('.file-search-results > button')
    await resultButtons[0]!.trigger('click')
    await resultButtons[1]!.trigger('click')
    expect(wrapper.emitted('openDirectory')).toEqual([['src']])
    expect(wrapper.emitted('openFile')).toEqual([['src/index.html']])
    expect(wrapper.get('[aria-label="提交文件名搜索"]').text()).toBe('')
    expect(wrapper.get('[aria-label="提交文件内容搜索"]').text()).toBe('')
  })

  it('keeps the browser focused on screenshot and annotation controls', async () => {
    const wrapper = mount(ExtensionsPanel, {
      props: {
        ...baseProps,
        activeTab: 'browser',
        browserState: {
          ...baseProps.browserState,
          url: 'http://localhost:5173/'
        }
      }
    })

    expect(wrapper.find('.browser-diagnostics').exists()).toBe(false)
    await wrapper.get('[aria-label="窗口截图"]').trigger('click')
    await wrapper.get('[aria-label="框选区域"]').trigger('click')
    expect(wrapper.emitted('browserCapturePage')).toEqual([[false]])
    expect(wrapper.emitted('browserPickAnnotation')).toEqual([['region']])
  })
})
