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
  browserNetworkDetails: null,
  browserNetworkDetailsPending: false,
  browserCapture: null,
  browserLocalServers: [],
  browserLocalServersPending: false
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

  it('renders Browser navigation and diagnostics from projected Main state', async () => {
    const wrapper = mount(ExtensionsPanel, {
      props: {
        ...baseProps,
        activeTab: 'browser',
        browserState: {
          ...baseProps.browserState,
          url: 'http://localhost:5173/',
          canGoBack: true,
          consoleEntries: [{
            id: 'console-1', level: 'info' as const, text: 'ready', source: 'app.js', line: 2, timestamp: 1
          }],
          networkEntries: [{
            id: 'network-1', requestId: '1', url: 'http://localhost:5173/app.js', method: 'GET',
            status: 200, type: 'Script', mimeType: 'text/javascript', durationMs: 12, size: 20,
            failed: false, errorText: null
          }]
        }
      }
    })

    expect(wrapper.get('.browser-address input').element.getAttribute('value') ?? (wrapper.get('.browser-address input').element as HTMLInputElement).value)
      .toContain('localhost:5173')
    expect(wrapper.get('.browser-console').text()).toContain('ready')
    await wrapper.get('[aria-label="后退"]').trigger('click')
    expect(wrapper.emitted('browserBack')).toEqual([[]])
    await wrapper.findAll('.browser-diagnostics > header button')[1]!.trigger('click')
    await wrapper.get('.browser-network > button').trigger('click')
    expect(wrapper.emitted('browserNetworkDetails')).toEqual([['1']])
  })
})
