// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FilePreviewDialog from '../../src/renderer/src/components/FilePreviewDialog.vue'

const preview = {
  path: 'docs/design-qa.md',
  content: '# Main workspace Design QA\n\nReady.',
  encoding: 'utf-8' as const,
  size: 64,
  truncated: false,
  mime: 'text/markdown',
  languageId: 'markdown',
  lineCount: 3,
  isBinary: false
}

function mountPreview(overrides = {}) {
  return mount(FilePreviewDialog, {
    props: {
      preview,
      pending: false,
      error: null,
      actionPending: null,
      actionError: null,
      actionNotice: null,
      ...overrides
    },
    global: { stubs: { Teleport: true } }
  })
}

describe('FilePreviewDialog', () => {
  it('renders file content in a dedicated large quick-look surface', () => {
    const wrapper = mountPreview()

    expect(wrapper.get('.file-preview-dialog').attributes('role')).toBe('dialog')
    expect(wrapper.get('.file-preview-identity').text()).toContain('docs/design-qa.md')
    expect(wrapper.get('.workspace-file-preview-code').text()).toContain('# Main workspace Design QA')
    expect(wrapper.text()).toContain('3 行')
  })

  it('routes all file actions from the preview header', async () => {
    const wrapper = mountPreview()
    const actions = wrapper.findAll('.file-preview-toolbar button')
    await actions[0]!.trigger('click')
    await actions[1]!.trigger('click')
    await actions[2]!.trigger('click')
    await actions[3]!.trigger('click')
    await actions[4]!.trigger('click')

    expect(wrapper.emitted('download')).toEqual([['docs/design-qa.md']])
    expect(wrapper.emitted('openExternal')).toEqual([['docs/design-qa.md']])
    expect(wrapper.emitted('openFileIn')).toEqual([
      ['cursor', 'docs/design-qa.md'],
      ['vscode', 'docs/design-qa.md']
    ])
    expect(wrapper.emitted('reveal')).toEqual([['docs/design-qa.md']])
  })

  it('closes from the explicit control and Escape', async () => {
    const wrapper = mountPreview()
    await wrapper.get('.file-preview-close').trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('shows loading, errors and binary files without injecting binary data', async () => {
    const wrapper = mountPreview({ preview: null, pending: true })
    expect(wrapper.get('.file-preview-state').text()).toContain('正在读取文件')

    await wrapper.setProps({ pending: false, error: '读取失败' })
    expect(wrapper.get('.file-preview-state.is-error').text()).toContain('读取失败')

    await wrapper.setProps({
      error: null,
      preview: { ...preview, path: 'image.png', content: '', mime: 'image/png', isBinary: true }
    })
    expect(wrapper.find('.workspace-file-preview-code').exists()).toBe(false)
    expect(wrapper.get('.file-preview-state').text()).toContain('二进制文件不会作为文本载入 Moon Code')
  })
})
