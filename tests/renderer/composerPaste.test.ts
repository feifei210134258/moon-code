// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiAgentDesktopApi } from '../../src/shared/contracts.js'
import ComposerBar from '../../src/renderer/src/components/ComposerBar.vue'

const controls = {
  model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual' as const,
  planMode: false, swarmMode: false
}
const models = [{
  id: 'kimi-for-coding', providerId: 'kimi', displayName: 'Kimi for Coding',
  maxContextSize: 262_144, capabilities: ['thinking'], supportEfforts: ['off', 'high'], defaultEffort: 'high'
}]

afterEach(() => {
  delete window.kimiAgent
})

describe('ComposerBar image paste', () => {
  it('uploads pasted clipboard images into the attachment chips', async () => {
    const pasteAttachment = vi.fn(async (_input: { name: string; mediaType: string; bytes: Uint8Array }) => ({
      fileId: 'file-1', name: '粘贴截图-20260725-143005.png', mediaType: 'image/png', size: 4
    }))
    window.kimiAgent = { pasteAttachment } as unknown as KimiAgentDesktopApi
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'image.png', { type: 'image/png' })
    await wrapper.get('textarea').trigger('paste', {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] }
    })

    await vi.waitFor(() => expect(pasteAttachment).toHaveBeenCalledOnce())
    const input = pasteAttachment.mock.calls[0]![0]
    expect(input.mediaType).toBe('image/png')
    expect(input.name).toContain('粘贴截图-')
    expect(input.bytes).toBeInstanceOf(Uint8Array)
    await vi.waitFor(() => expect(wrapper.text()).toContain('粘贴截图-20260725-143005.png'))
    expect(wrapper.find('.composer-attachment-chip').exists()).toBe(true)
  })

  it('leaves text-only paste untouched and does not upload', async () => {
    const pasteAttachment = vi.fn()
    window.kimiAgent = { pasteAttachment } as unknown as KimiAgentDesktopApi
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })

    await wrapper.get('textarea').trigger('paste', {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] }
    })

    expect(pasteAttachment).not.toHaveBeenCalled()
    expect(wrapper.find('.composer-attachment-chip').exists()).toBe(false)
  })
})
