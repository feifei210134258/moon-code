// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiAgentDesktopApi } from '../../src/shared/contracts.js'
import RemoteControlPopover from '../../src/renderer/src/components/RemoteControlPopover.vue'

const anchor = { top: 720, left: 24, bottom: 748 }

function mountPopover(anchorOverride: Partial<typeof anchor> = {}) {
  return mount(RemoteControlPopover, {
    attachTo: document.body,
    props: { anchor: { ...anchor, ...anchorOverride } }
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RemoteControlPopover', () => {
  it('shows the device link and QR code when the relay is active, and anchors above the trigger', async () => {
    window.kimiAgent = {
      getRemoteControlState: vi.fn(async () => ({
        preference: { enabled: true },
        runtimeMode: 'system' as const,
        appliedEnabled: true,
        requiresRestart: false,
        active: true,
        url: 'https://code-rc.kimi.com/devices/dev-1234567890/',
        deviceId: 'dev-1234567890',
        startedAt: 1_756_300_000_000,
        qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgo='
      })),
      onRemoteControlStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    const wrapper = mountPopover()
    await flushPromises()

    const popover = document.querySelector<HTMLElement>('.remote-popover')!
    expect(popover).not.toBeNull()
    expect(popover.textContent).toContain('远程控制')
    expect(popover.textContent).toContain('已上线')
    expect(popover.textContent).toContain('https://code-rc.kimi.com/devices/dev-1234567890/')
    expect(popover.querySelector('.remote-popover-state')?.classList.contains('is-live')).toBe(true)
    expect(popover.querySelector('.remote-popover-qr')?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=')
    /* 贴着触发按钮向上展开：bottom = 视口高度 - 按钮顶缘 + 8px 间距。 */
    expect(popover.style.bottom).toBe(`${Math.round(window.innerHeight - anchor.top + 8)}px`)
    expect(popover.style.left).toBe(`${anchor.left}px`)
    wrapper.unmount()
  })

  it('toggles remote control off and keeps the change local until the runtime restarts', async () => {
    const enabledState = {
      preference: { enabled: true },
      runtimeMode: 'managed' as const,
      appliedEnabled: true,
      requiresRestart: false,
      active: false,
      url: null,
      deviceId: null,
      startedAt: null,
      qrCodeDataUrl: null
    }
    const disabledState = {
      ...enabledState,
      preference: { enabled: false },
      requiresRestart: true
    }
    window.confirm = vi.fn(() => true)
    window.kimiAgent = {
      getRemoteControlState: vi.fn(async () => enabledState),
      setRemoteControlEnabled: vi.fn(async () => disabledState),
      onRemoteControlStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    const wrapper = mountPopover()
    await flushPromises()

    const checkbox = document.querySelector<HTMLInputElement>('.remote-popover-toggle input[type="checkbox"]')!
    checkbox.checked = false
    checkbox.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(window.kimiAgent.setRemoteControlEnabled).toHaveBeenCalledWith(false)
    const popover = document.querySelector<HTMLElement>('.remote-popover')!
    expect(popover.querySelector('.secondary-restart-notice')).not.toBeNull()
    expect(popover.textContent).toContain('重启')
    expect(document.querySelector('.remote-popover-state')?.textContent).toContain('待重启关闭')
    wrapper.unmount()
  })

  it('asks for confirmation before enabling remote control and reverts when declined', async () => {
    const confirm = vi.fn(() => false)
    window.confirm = confirm
    window.kimiAgent = {
      getRemoteControlState: vi.fn(async () => ({
        preference: { enabled: false },
        runtimeMode: 'managed' as const,
        appliedEnabled: false,
        requiresRestart: false,
        active: false,
        url: null,
        deviceId: null,
        startedAt: null,
        qrCodeDataUrl: null
      })),
      setRemoteControlEnabled: vi.fn(),
      onRemoteControlStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    const wrapper = mountPopover()
    await flushPromises()

    const checkbox = document.querySelector<HTMLInputElement>('.remote-popover-toggle input[type="checkbox"]')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(confirm).toHaveBeenCalledOnce()
    expect(window.kimiAgent.setRemoteControlEnabled).not.toHaveBeenCalled()
    expect(checkbox.checked).toBe(false)
    wrapper.unmount()
  })

  it('closes on Escape and on clicks outside the popover', async () => {
    window.kimiAgent = {
      getRemoteControlState: vi.fn(async () => null),
      onRemoteControlStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    const wrapper = mountPopover()
    await flushPromises()
    expect(document.querySelector('.remote-popover')).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('close')).toEqual([[]])

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('close')).toEqual([[], []])
    wrapper.unmount()
  })
})
