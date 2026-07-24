// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUsageBridge } from '../../src/renderer/src/composables/useUsageBridge.js'
import type { KimiAgentDesktopApi, KimiUsageState } from '../../src/shared/contracts.js'

const state: KimiUsageState = {
  phase: 'ready', summary: null, limits: [], extraUsage: null,
  updatedAt: '2026-07-23T00:00:00.000Z', nextRefreshAt: null, refreshing: false,
  source: 'kimi-oauth-usage', error: null,
  preferences: { infoThreshold: 0.5, warningThreshold: 0.8, criticalThreshold: 0.95, systemNotifications: true }
}

afterEach(() => {
  delete window.kimiAgent
})

describe('useUsageBridge', () => {
  it('loads typed state, accepts push updates and refreshes after network recovery', async () => {
    let listener!: (state: KimiUsageState) => void
    const api = {
      getKimiUsage: vi.fn(async () => state),
      refreshKimiUsage: vi.fn(async () => ({ ...state, refreshing: false })),
      onKimiUsageStateChanged: vi.fn((next: (state: KimiUsageState) => void) => {
        listener = next
        return () => undefined
      })
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useUsageBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useUsageBridge()
        return () => null
      }
    }))
    await flushPromises()
    expect(bridge.state.value.phase).toBe('ready')

    listener({ ...state, phase: 'stale', error: 'offline' })
    expect(bridge.state.value.phase).toBe('stale')
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    expect(api.refreshKimiUsage).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
