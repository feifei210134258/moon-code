// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PetApp from '../../src/renderer/src/PetApp.vue'
import type { KimiPetWindowApi, PetSessionState } from '../../src/shared/contracts.js'

const waitingState: PetSessionState = {
  serverId: 'server-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Kimi Agent',
  sessionId: 'session-1',
  title: '实现桌面宠物',
  status: 'waiting',
  pendingInteraction: 'approval',
  backgroundActivity: false,
  unread: true,
  startedAt: '2026-07-23T08:00:00.000Z',
  updatedAt: '2026-07-23T08:01:00.000Z',
  latestTool: null,
  overflowCount: 0
}

afterEach(() => {
  delete window.kimiPet
})

describe('PetApp', () => {
  it('renders only bounded Session status and opens its bound Session on click', async () => {
    const openSession = vi.fn()
    const stateListener = vi.fn<(state: PetSessionState) => void>()
    window.kimiPet = {
      getState: vi.fn(async () => waitingState),
      openSession,
      beginDrag: vi.fn(),
      moveDrag: vi.fn(),
      endDrag: vi.fn(),
      onStateChanged: (listener) => {
        stateListener.mockImplementation(listener)
        return vi.fn()
      }
    } satisfies KimiPetWindowApi

    const wrapper = mount(PetApp)
    await vi.waitFor(() => expect(wrapper.text()).toContain('实现桌面宠物'))
    expect(wrapper.text()).toContain('等待授权')
    expect(wrapper.find('.pet-status-label').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('批准')
    expect(wrapper.get('.mimo-sprite').attributes('data-row')).toBe('6')

    await wrapper.get('.pet-root').trigger('pointerdown', { button: 0, screenX: 100, screenY: 100 })
    await wrapper.get('.pet-root').trigger('pointerup', { button: 0, screenX: 101, screenY: 101 })
    expect(openSession).toHaveBeenCalledOnce()

    stateListener({ ...waitingState, status: 'running', pendingInteraction: 'none' })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('正在工作')
    expect(wrapper.get('.mimo-sprite').attributes('data-row')).toBe('7')

    await wrapper.get('.pet-root').trigger('pointerdown', { button: 0, pointerId: 2, screenX: 100, screenY: 100 })
    await wrapper.get('.pet-root').trigger('pointermove', { pointerId: 2, screenX: 88, screenY: 100 })
    await wrapper.vm.$nextTick()
    expect(window.kimiPet.beginDrag).toHaveBeenCalled()
    expect(wrapper.get('.mimo-sprite').attributes('data-row')).toBe('2')
    await wrapper.get('.pet-root').trigger('pointerup', { pointerId: 2, screenX: 88, screenY: 100 })
  })
})
