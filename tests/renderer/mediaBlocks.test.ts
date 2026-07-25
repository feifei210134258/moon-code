// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiAgentDesktopApi } from '../../src/shared/contracts.js'
import MediaBlock from '../../src/renderer/src/components/MediaBlock.vue'
import AttachmentBlock from '../../src/renderer/src/components/AttachmentBlock.vue'

afterEach(() => {
  delete window.kimiAgent
  vi.restoreAllMocks()
})

describe('Kimi media blocks', () => {
  it('loads a file-backed image through typed Kimi IPC', async () => {
    const createObjectURL = vi.fn(() => 'blob:kimi-image')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const readAttachment = vi.fn(async () => ({
      fileId: 'image-1', mediaType: 'application/octet-stream', bytes: new Uint8Array([1, 2, 3])
    }))
    window.kimiAgent = { readAttachment } as unknown as KimiAgentDesktopApi
    const wrapper = mount(MediaBlock, {
      props: { mediaType: 'image', fileId: 'image-1', sourceMediaType: null, base64Data: null }
    })
    await flushPromises()

    expect(readAttachment).toHaveBeenCalledWith('image-1', 'application/octet-stream')
    expect(wrapper.get('img').attributes('src')).toBe('blob:kimi-image')
    wrapper.unmount()
  })

  it('downloads ordinary attachments only after an explicit click', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:kimi-file') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const readAttachment = vi.fn(async () => ({
      fileId: 'file-1', mediaType: 'application/octet-stream', bytes: new Uint8Array([1])
    }))
    window.kimiAgent = { readAttachment } as unknown as KimiAgentDesktopApi
    const wrapper = mount(AttachmentBlock, {
      props: { fileId: 'file-1', name: 'archive.zip', mediaType: 'application/zip', size: 1024 }
    })
    expect(readAttachment).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(readAttachment).toHaveBeenCalledWith('file-1', 'application/zip')
  })

  it('opens HTML attachments in an in-app sandboxed preview', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:kimi-html') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    window.kimiAgent = {
      readAttachment: vi.fn(async () => ({
        fileId: 'file-2', mediaType: 'text/html', bytes: new TextEncoder().encode('<h1>Preview</h1>')
      }))
    } as unknown as KimiAgentDesktopApi
    const wrapper = mount(AttachmentBlock, {
      props: { fileId: 'file-2', name: 'index.html', mediaType: 'text/html', size: 24 },
      global: { stubs: { Teleport: true } }
    })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.attachment-preview-dialog iframe').attributes('src')).toBe('blob:kimi-html')
    expect(wrapper.get('.attachment-preview-dialog iframe').attributes('sandbox')).toBe('')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.attachment-preview-dialog').exists()).toBe(false)
  })
})
