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

async function mountPet(expectedLabel: string): Promise<VueWrapper> {
  wrapper = mount(PetApp)
  await vi.waitFor(() => expect(wrapper?.get('.pet-root').attributes('aria-label')).toContain(expectedLabel))
  return wrapper
}

describe('PetApp', () => {
  it('shows the session count badge and opens the single Session on body click', async () => {
    const api = installPetApi(rosterOf(waitingState))
    const current = await mountPet('实现桌面宠物')

    expect(current.get('.pet-root').attributes('aria-label')).toContain('等待授权')
    expect(current.get('.lumi-sprite').attributes('data-row')).toBe('1')
    expect(current.get('.pet-badge').text()).toBe('1')
    // 会话任务内容不再展示，没有浮层条目。
    expect(current.findAll('.pet-entry')).toHaveLength(0)

    await current.get('.pet-body').trigger('pointerdown', { button: 0, screenX: 100, screenY: 100 })
    await current.get('.pet-body').trigger('pointerup', { button: 0, screenX: 101, screenY: 101 })
    expect(api.openSession).toHaveBeenCalledOnce()
    expect(api.openSession).toHaveBeenCalledWith('session-1')
  })

  it('counts concurrent Sessions in the badge and opens the top-priority one on click', async () => {
    const api = installPetApi(rosterOf(runningState, waitingState))
    const current = await mountPet('2 个任务')

    expect(current.get('.pet-badge').text()).toBe('2')
    // 聚合状态取优先级更高的 waiting。
    expect(current.get('.lumi-sprite').attributes('data-row')).toBe('1')

    await current.get('.pet-body').trigger('pointerdown', { button: 0, screenX: 100, screenY: 100 })
    await current.get('.pet-body').trigger('pointerup', { button: 0, screenX: 101, screenY: 101 })
    // 多会话时点击本体打开最需要关注的会话。
    expect(api.openSession).toHaveBeenCalledWith('session-1')
  })

  it('derives the aggregate body status from the running Sessions', async () => {
    const api = installPetApi(rosterOf(runningState, { ...runningState, sessionId: 'session-3' }))
    const current = await mountPet('2 个任务')
    expect(current.get('.lumi-sprite').attributes('data-row')).toBe('0')

    api.emitState(rosterOf(runningState, waitingState))
    await current.vm.$nextTick()
    expect(current.get('.lumi-sprite').attributes('data-row')).toBe('1')
  })

  it('maps the aggregate status to its Chinese label', async () => {
    const api = installPetApi(rosterOf({ ...waitingState, pendingInteraction: 'question' }))
    const current = await mountPet('等待回答')

    const cases: Array<[Partial<PetSessionState>, string]> = [
      [{ status: 'waiting', pendingInteraction: 'approval' }, '等待授权'],
      [{ status: 'running', pendingInteraction: 'none', backgroundActivity: true }, '后台执行'],
      [{ status: 'running', pendingInteraction: 'none', backgroundActivity: false }, '正在工作'],
      [{ status: 'completed', unread: true }, '已完成'],
      [{ status: 'failed' }, '运行失败'],
      [{ status: 'review' }, '等待查看'],
      [{ status: 'disconnected' }, '连接中断'],
      [{ status: 'idle' }, '空闲']
    ]
    for (const [patch, label] of cases) {
      api.emitState(rosterOf({ ...waitingState, ...patch }))
      await vi.waitFor(() => expect(current.get('.pet-root').attributes('aria-label')).toContain(label))
    }
  })

  it('keeps drag gestures on the pet body', async () => {
    const api = installPetApi(rosterOf(runningState, waitingState))
    const current = await mountPet('2 个任务')

    await current.get('.pet-body').trigger('pointerdown', { button: 0, pointerId: 2, screenX: 100, screenY: 100 })
    await current.get('.pet-body').trigger('pointermove', { pointerId: 2, screenX: 88, screenY: 100 })
    await current.vm.$nextTick()
    expect(api.beginDrag).toHaveBeenCalled()
    expect(api.moveDrag).toHaveBeenCalled()
    await current.get('.pet-body').trigger('pointerup', { pointerId: 2, screenX: 88, screenY: 100 })
    expect(api.endDrag).toHaveBeenCalled()
  })

  it('shows the connecting state when the roster is empty', async () => {
    const api = installPetApi(rosterOf())
    wrapper = mount(PetApp)
    await vi.waitFor(() => expect(api.getState).toHaveBeenCalled())
    await vi.waitFor(() => expect(wrapper?.get('.pet-root').attributes('aria-label')).toContain('正在连接'))
    expect(wrapper.find('.pet-badge').exists()).toBe(false)
  })
})
