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
      props: { mediaType: 'image', fileId: 'image-1', sourceMediaType: null, base64Data: null },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    expect(readAttachment).toHaveBeenCalledWith('image-1', 'application/octet-stream')
    expect(wrapper.get('.media-image-trigger img').attributes('src')).toBe('blob:kimi-image')
    await wrapper.get('.media-image-trigger').trigger('click')
    const viewport = wrapper.get('.media-preview-viewport')
    Object.defineProperty(viewport.element, 'clientWidth', { configurable: true, value: 800 })
    Object.defineProperty(viewport.element, 'clientHeight', { configurable: true, value: 600 })
    const previewImage = wrapper.get('.media-preview-dialog img')
    Object.defineProperty(previewImage.element, 'naturalWidth', { configurable: true, value: 1600 })
    Object.defineProperty(previewImage.element, 'naturalHeight', { configurable: true, value: 900 })
    await previewImage.trigger('load')
    expect(previewImage.attributes('src')).toBe('blob:kimi-image')

    await wrapper.get('[aria-label="放大图片"]').trigger('click')
    expect(wrapper.get('.media-preview-viewport').attributes('aria-label')).toContain('125%')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.media-preview-viewport').attributes('aria-label')).toContain('150%')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.media-preview-viewport').attributes('aria-label')).toContain('100%')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.media-preview-dialog').exists()).toBe(false)
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
