// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ExtensionsPanel from '../../src/renderer/src/components/ExtensionsPanel.vue'

const baseProps = {
  width: 382,
  activeTab: 'changes' as const,
  workspaceName: 'Kimi-agent',
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
  filePreviewPending: false,
  filePreviewError: null,
  gitStatus: {
    branch: 'main', ahead: 0, behind: 0, entries: { 'src/app.ts': 'modified' as const },
    additions: 2, deletions: 1, pullRequest: null
  },
  gitStatusPending: false,
  gitStatusError: null,
  fileDiff: { path: 'src/app.ts', diff: '@@ -1 +1 @@\n-old\n+new', truncated: false },
  fileDiffPending: false,
  fileDiffError: null,
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
  it('renders authoritative Git status and emits on-demand Diff selection', async () => {
    const wrapper = mount(ExtensionsPanel, { props: baseProps })

    expect(wrapper.get('.git-summary').text()).toContain('main')
    expect(wrapper.findAll('.diff-code .removed')).toHaveLength(1)
    expect(wrapper.findAll('.diff-code .added')).toHaveLength(1)
    await wrapper.get('.changed-file-row').trigger('click')
    expect(wrapper.emitted('selectDiff')).toEqual([['src/app.ts']])
  })

  it('keeps Diff collapsed until a changed file is selected, giving the plan room to expand', () => {
    const wrapper = mount(ExtensionsPanel, {
      props: { ...baseProps, fileDiff: null }
    })

    expect(wrapper.find('.diff-panel').exists()).toBe(false)
    expect(wrapper.get('.changes-view').classes()).toContain('is-diff-collapsed')
    expect(wrapper.get('.todo-panel').text()).toContain('计划')
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

  it('routes directories and files through typed entry events and renders bounded preview text', async () => {
    const wrapper = mount(ExtensionsPanel, { props: { ...baseProps, activeTab: 'files' } })
    const rows = wrapper.findAll('.file-row')
    expect(rows).toHaveLength(2)
    await rows[0]!.trigger('click')
    await rows[1]!.trigger('click')

    expect(wrapper.emitted('openEntry')?.[0]?.[0]).toEqual(expect.objectContaining({ path: 'src', kind: 'directory' }))
    expect(wrapper.emitted('openEntry')?.[1]?.[0]).toEqual(expect.objectContaining({ path: 'README.md', kind: 'file' }))
    expect(wrapper.get('.file-preview-code').text()).toContain('# Kimi Agent')
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

  it('shows binary previews as a safe degradation instead of injecting base64', () => {
    const wrapper = mount(ExtensionsPanel, {
      props: {
        ...baseProps,
        activeTab: 'files',
        filePreview: {
          ...baseProps.filePreview,
          path: 'image.png',
          content: '',
          mime: 'image/png',
          isBinary: true
        }
      }
    })

    expect(wrapper.find('.file-preview-code').exists()).toBe(false)
    expect(wrapper.text()).toContain('二进制文件不会作为文本载入 Renderer')
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
  })

  it('exposes download, external open, IDE open and reveal from a file preview menu', async () => {
    const wrapper = mount(ExtensionsPanel, { props: { ...baseProps, activeTab: 'files' } })
    await wrapper.get('.file-preview-actions summary').trigger('click')
    const actions = wrapper.findAll('.file-preview-actions button')
    await actions[0]!.trigger('click')
    await actions[1]!.trigger('click')
    await actions[2]!.trigger('click')
    await actions[3]!.trigger('click')
    await actions[4]!.trigger('click')

    expect(wrapper.emitted('downloadFile')).toEqual([['README.md']])
    expect(wrapper.emitted('openExternalFile')).toEqual([['README.md']])
    expect(wrapper.emitted('openFileIn')).toEqual([['cursor', 'README.md'], ['vscode', 'README.md']])
    expect(wrapper.emitted('revealFile')).toEqual([['README.md']])
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
