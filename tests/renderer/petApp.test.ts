// @vitest-environment happy-dom

import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import PetApp from '../../src/renderer/src/PetApp.vue'
import type {
  KimiPetWindowApi,
  PetPointerPosition,
  PetRosterState,
  PetSessionState
} from '../../src/shared/contracts.js'

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

const runningState: PetSessionState = {
  ...waitingState,
  sessionId: 'session-2',
  title: '并行重构窗口管理',
  status: 'running',
  pendingInteraction: 'none',
  backgroundActivity: false,
  unread: false,
  updatedAt: '2026-07-23T08:02:00.000Z'
}

function rosterOf(...items: PetSessionState[]): PetRosterState {
  return {
    connected: true,
    items,
    overflow: 0,
    updatedAt: new Date().toISOString()
  }
}

interface PetApiMock {
  getState: Mock<() => Promise<PetRosterState>>
  openSession: Mock<(sessionId?: string) => void>
  setHovered: Mock<(hovered: boolean) => void>
  beginDrag: Mock<(position: PetPointerPosition) => void>
  moveDrag: Mock<(position: PetPointerPosition) => void>
  endDrag: Mock<(position: PetPointerPosition) => void>
  onStateChanged: Mock<(listener: (roster: PetRosterState) => void) => () => void>
  emitState: (roster: PetRosterState) => void
}

function installPetApi(initial: PetRosterState): PetApiMock {
  let listener: ((roster: PetRosterState) => void) | null = null
  const mock: PetApiMock = {
    getState: vi.fn<() => Promise<PetRosterState>>(async () => initial),
    openSession: vi.fn<(sessionId?: string) => void>(),
    setHovered: vi.fn<(hovered: boolean) => void>(),
    beginDrag: vi.fn<(position: PetPointerPosition) => void>(),
    moveDrag: vi.fn<(position: PetPointerPosition) => void>(),
    endDrag: vi.fn<(position: PetPointerPosition) => void>(),
    onStateChanged: vi.fn<(listener: (roster: PetRosterState) => void) => () => void>((next) => {
      listener = next
      return vi.fn()
    }),
    emitState: (roster) => listener?.(roster)
  }
  window.kimiPet = {
    getState: mock.getState,
    openSession: mock.openSession,
    setHovered: mock.setHovered,
    beginDrag: mock.beginDrag,
    moveDrag: mock.moveDrag,
    endDrag: mock.endDrag,
    onStateChanged: mock.onStateChanged
  } satisfies KimiPetWindowApi
  return mock
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  delete window.kimiPet
})

async function mountPet(expectedText: string): Promise<VueWrapper> {
  wrapper = mount(PetApp)
  await vi.waitFor(() => expect(wrapper?.text()).toContain(expectedText))
  return wrapper
}

describe('PetApp', () => {
  it('renders the single Session entry and opens it on body click', async () => {
    const api = installPetApi(rosterOf(waitingState))
    const current = await mountPet('实现桌面宠物')

    expect(current.text()).toContain('等待授权')
    expect(current.get('.lumi-sprite').attributes('data-row')).toBe('1')
    expect(current.findAll('.pet-entry')).toHaveLength(1)

    await current.get('.pet-body').trigger('pointerdown', { button: 0, screenX: 100, screenY: 100 })
    await current.get('.pet-body').trigger('pointerup', { button: 0, screenX: 101, screenY: 101 })
    expect(api.openSession).toHaveBeenCalledOnce()
    expect(api.openSession).toHaveBeenCalledWith()
  })

  it('opens the bound Session when its overlay entry is clicked and closes the overlay', async () => {
    const api = installPetApi(rosterOf(waitingState))
    const current = await mountPet('实现桌面宠物')

    await current.trigger('mouseenter')
    expect(api.setHovered).toHaveBeenCalledWith(true)
    await vi.waitFor(() => expect(current.get('.pet-overlay').classes()).toContain('is-open'))

    await current.get('.pet-entry').trigger('click')
    expect(api.openSession).toHaveBeenCalledWith('session-1')
    expect(api.setHovered).toHaveBeenLastCalledWith(false)

    await current.trigger('mouseleave')
    expect(api.setHovered).toHaveBeenLastCalledWith(false)
  })

  it('shows one entry per running Session with aggregate body status', async () => {
    const api = installPetApi(rosterOf(runningState, waitingState))
    const current = await mountPet('并行重构窗口管理')

    // 两个条目都在浮层里，聚合状态取优先级更高的 waiting。
    expect(current.findAll('.pet-entry')).toHaveLength(2)
    expect(current.text()).toContain('正在工作')
    expect(current.text()).toContain('等待授权')
    expect(current.get('.lumi-sprite').attributes('data-row')).toBe('1')

    // 多会话时点击本体不直接打开。
    await current.get('.pet-body').trigger('pointerdown', { button: 0, screenX: 100, screenY: 100 })
    await current.get('.pet-body').trigger('pointerup', { button: 0, screenX: 101, screenY: 101 })
    expect(api.openSession).not.toHaveBeenCalled()

    // 点击浮层条目精确打开对应会话。
    await current.trigger('mouseenter')
    await vi.waitFor(() => expect(current.get('.pet-overlay').classes()).toContain('is-open'))
    await current.findAll('.pet-entry')[1]!.trigger('click')
    expect(api.openSession).toHaveBeenCalledWith('session-1')
  })

  it('derives the aggregate body status from the running Sessions', async () => {
    const api = installPetApi(rosterOf(runningState, { ...runningState, sessionId: 'session-3' }))
    const current = await mountPet('并行重构窗口管理')
    expect(current.get('.lumi-sprite').attributes('data-row')).toBe('0')

    api.emitState(rosterOf(runningState, waitingState))
    await current.vm.$nextTick()
    expect(current.get('.lumi-sprite').attributes('data-row')).toBe('1')
  })

  it('maps every Session status to its Chinese label', async () => {
    const session = (sessionId: string, status: PetSessionState['status']): PetSessionState => ({
      ...waitingState,
      sessionId,
      title: `任务 ${sessionId}`,
      status,
      pendingInteraction: status === 'waiting' ? 'question' : 'none',
      backgroundActivity: status === 'running',
      unread: status === 'review' || status === 'failed',
      startedAt: status === 'running' ? waitingState.startedAt : null
    })
    installPetApi(rosterOf(
      session('q', 'waiting'),
      session('b', 'running'),
      session('c', 'completed'),
      session('f', 'failed'),
      session('r', 'review'),
      session('d', 'disconnected'),
      session('i', 'idle')
    ))
    const current = await mountPet('任务 q')
    expect(current.text()).toContain('等待回答')
    expect(current.text()).toContain('后台执行')
    expect(current.text()).toContain('已完成')
    expect(current.text()).toContain('运行失败')
    expect(current.text()).toContain('等待查看')
    expect(current.text()).toContain('连接中断')
    expect(current.text()).toContain('空闲')
  })

  it('keeps drag gestures on the pet body and suppresses them on the overlay', async () => {
    const api = installPetApi(rosterOf(runningState, waitingState))
    const current = await mountPet('并行重构窗口管理')

    await current.trigger('mouseenter')
    await vi.waitFor(() => expect(current.get('.pet-overlay').classes()).toContain('is-open'))

    await current.get('.pet-entry').trigger('pointerdown', { button: 0, screenX: 90, screenY: 90 })
    await current.get('.pet-entry').trigger('pointerup', { button: 0, screenX: 90, screenY: 90 })
    expect(api.beginDrag).not.toHaveBeenCalled()

    // 拖拽本体时收起浮层并驱动窗口移动。
    await current.get('.pet-body').trigger('pointerdown', { button: 0, pointerId: 2, screenX: 100, screenY: 100 })
    expect(api.setHovered).toHaveBeenLastCalledWith(false)
    await current.get('.pet-body').trigger('pointermove', { pointerId: 2, screenX: 88, screenY: 100 })
    await current.vm.$nextTick()
    expect(api.beginDrag).toHaveBeenCalled()
    expect(api.moveDrag).toHaveBeenCalled()
    await current.get('.pet-body').trigger('pointerup', { pointerId: 2, screenX: 88, screenY: 100 })
    expect(api.endDrag).toHaveBeenCalled()
  })

  it('hides every entry when the roster is empty', async () => {
    const api = installPetApi(rosterOf())
    wrapper = mount(PetApp)
    await vi.waitFor(() => expect(api.getState).toHaveBeenCalled())
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.pet-entry')).toHaveLength(0)
  })
})
