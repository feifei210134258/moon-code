// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiAgentDesktopApi } from '../../src/shared/contracts.js'
import ComposerBar from '../../src/renderer/src/components/ComposerBar.vue'

const controls = {
  model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual' as const,
  planMode: false, swarmMode: false, towerMode: false
}
const models = [{
  id: 'kimi-for-coding', providerId: 'kimi', displayName: 'Kimi for Coding',
  maxContextSize: 262_144, capabilities: ['thinking'], supportEfforts: ['off', 'high'], defaultEffort: 'high'
}]

afterEach(() => {
  delete window.kimiAgent
})

function dispatchDrop(element: Element, dataTransfer: { files: File[]; types: string[] }): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.assign(event, { dataTransfer })
  element.dispatchEvent(event)
  return event
}

describe('ComposerBar file drop', () => {
  it('uploads dropped image files into the attachment chips and submits them', async () => {
    const dropAttachment = vi.fn(async (input: { name: string; mediaType: string; bytes: Uint8Array }) => ({
      fileId: 'file-1', name: input.name, mediaType: input.mediaType, size: input.bytes.byteLength
    }))
    window.kimiAgent = { dropAttachment } as unknown as KimiAgentDesktopApi
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'photo.png', { type: 'image/png' })
    const event = dispatchDrop(wrapper.get('.composer-wrap').element, { files: [file], types: ['Files'] })

    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(dropAttachment).toHaveBeenCalledOnce())
    const input = dropAttachment.mock.calls[0]![0]
    expect(input.mediaType).toBe('image/png')
    expect(input.name).toBe('photo.png')
    expect(input.bytes).toBeInstanceOf(Uint8Array)
    await vi.waitFor(() => expect(wrapper.text()).toContain('photo.png'))
    expect(wrapper.find('.composer-attachment-chip').exists()).toBe(true)

    await wrapper.get('textarea').setValue('看下这张图')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')?.[0]?.[1]).toEqual([
      { fileId: 'file-1', name: 'photo.png', mediaType: 'image/png', size: 4 }
    ])
    wrapper.unmount()
  })

  it('uploads dropped non-image files with a generic octet-stream fallback', async () => {
    const dropAttachment = vi.fn(async (input: { name: string; mediaType: string; bytes: Uint8Array }) => ({
      fileId: `file-${input.name}`, name: input.name, mediaType: input.mediaType, size: input.bytes.byteLength
    }))
    window.kimiAgent = { dropAttachment } as unknown as KimiAgentDesktopApi
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })

    const pdf = new File([new Uint8Array([5, 6])], 'spec.pdf', { type: 'application/pdf' })
    const noType = new File([new Uint8Array([7])], 'dump.bin', { type: '' })
    dispatchDrop(wrapper.get('.composer-wrap').element, { files: [pdf, noType], types: ['Files'] })

    await vi.waitFor(() => expect(dropAttachment).toHaveBeenCalledTimes(2))
    expect(dropAttachment.mock.calls[0]![0].mediaType).toBe('application/pdf')
    expect(dropAttachment.mock.calls[1]![0].mediaType).toBe('application/octet-stream')
    await vi.waitFor(() => expect(wrapper.text()).toContain('dump.bin'))
    wrapper.unmount()
  })

  it('ignores drops while the composer is disabled', async () => {
    const dropAttachment = vi.fn()
    window.kimiAgent = { dropAttachment } as unknown as KimiAgentDesktopApi
    const wrapper = mount(ComposerBar, {
      props: { skills: [], models, controls, disabled: true, disabledReason: '先连接 Runtime' }
    })

    const file = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' })
    const event = dispatchDrop(wrapper.get('.composer-wrap').element, { files: [file], types: ['Files'] })

    expect(event.defaultPrevented).toBe(true)
    expect(dropAttachment).not.toHaveBeenCalled()
    expect(wrapper.find('.composer-attachment-chip').exists()).toBe(false)
    wrapper.unmount()
  })

  it('leaves non-file drops (e.g. dragged text) to the default behavior', async () => {
    const dropAttachment = vi.fn()
    window.kimiAgent = { dropAttachment } as unknown as KimiAgentDesktopApi
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })

    const event = dispatchDrop(wrapper.get('.composer-wrap').element, { files: [], types: ['text/plain'] })

    expect(event.defaultPrevented).toBe(false)
    expect(dropAttachment).not.toHaveBeenCalled()
    expect(wrapper.find('.composer-attachment-chip').exists()).toBe(false)
    wrapper.unmount()
  })
})
