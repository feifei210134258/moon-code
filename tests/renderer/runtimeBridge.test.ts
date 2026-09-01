// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRuntimeBridge } from '../../src/renderer/src/composables/useRuntimeBridge'
import { useWorkbenchStore } from '../../src/renderer/src/stores/workbench.js'
import type {
  KimiAgentDesktopApi,
  KimiPromptInput,
  SessionViewState
} from '../../src/shared/contracts.js'

function sessionState(sessionId: string): SessionViewState {
  return {
    sessionId,
    title: sessionId,
    workspaceRoot: '/tmp/project',
    busy: false,
    mainTurnActive: false,
    activePromptId: null,
    activePromptStatus: null,
    phase: 'ready',
    cursor: { seq: 1, epoch: 'epoch-1' },
    messages: [],
    markers: [],
    todos: [],
    sideChat: null,
    pendingApprovals: [],
    pendingQuestions: [],
    agents: [],
    usage: {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      totalCostUsd: null, contextTokens: 0, contextLimit: 0, turnCount: null
    },
    hasMoreMessages: false,
    resyncCount: 0,
    unknownEventCount: 0,
    error: null,
    lastTurnReason: null,
    lastTurnError: null,
    retry: null,
    skillActivations: []
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  delete window.kimiAgent
})

describe('useRuntimeBridge session races', () => {
  it('reconnects through the detected system Kimi Code CLI', async () => {
    const startRuntime = vi.fn(async () => ({
      status: 'running' as const,
      mode: 'system' as const,
      version: '0.29.0',
      serverId: 'server-1',
      origin: 'http://127.0.0.1:1234',
      error: null
    }))
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: { status: 'stopped' as const, mode: null, version: null, serverId: null, origin: null, error: null },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed' as const, version: '0.29.0', executable: '/managed-kimi', compatible: true, reason: null },
          system: { kind: 'system' as const, version: '0.29.0', executable: '/usr/local/bin/kimi', compatible: true, reason: null }
        }
      })),
      startRuntime,
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()

    await bridge.toggle()

    expect(startRuntime).toHaveBeenCalledWith('system')
    expect(bridge.runtime.value.mode).toBe('system')
    wrapper.unmount()
  })

  it('reattaches the active session when the runtime bounces within a single flush', async () => {
    vi.useFakeTimers()
    let runtimeListener!: (state: { status: string; mode: string | null; version: string | null; serverId: string | null; origin: string | null; error: string | null }) => void
    const openSession = vi.fn(async (sessionId: string) => sessionState(sessionId))
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.30.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.30.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn((listener: typeof runtimeListener) => {
        runtimeListener = listener
        return () => {}
      }),
      onSessionStateChanged: vi.fn(() => () => {}),
      openSession,
      listFiles: vi.fn(async (_sessionId: string, path = '.') => ({ path, items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: false, branch: null, ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-live')
    await flushPromises()
    expect(openSession).toHaveBeenCalledTimes(1)

    /* 重启时 stopped → running 落在同一 Vue flush：App.vue 的 watcher 被合并，
       会话永远不重连（重启后发消息无回复，切会话才恢复）；桥接层必须自己恢复 */
    const stopped = { status: 'stopped', mode: null, version: null, serverId: null, origin: null, error: null }
    const running = { status: 'running', mode: 'managed', version: '0.30.0', serverId: 'server-2', origin: 'http://127.0.0.1:1235', error: null }
    runtimeListener(stopped)
    runtimeListener(running)
    await flushPromises()

    expect(openSession).toHaveBeenCalledTimes(2)
    expect(openSession).toHaveBeenLastCalledWith('session-live')
    expect(bridge.sessionView.value?.sessionId).toBe('session-live')

    /* 服务器重启后游标/订阅可能未对齐，延迟二次打开矫正（真实故障：流式事件
       被当作重复帧静默丢弃，发消息无实时输出，手动刷新才恢复） */
    await vi.advanceTimersByTimeAsync(2_600)
    await flushPromises()
    expect(openSession).toHaveBeenCalledTimes(3)
    expect(openSession).toHaveBeenLastCalledWith('session-live')
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('does not reattach the detached session when connecting to an external runtime', async () => {
    let runtimeListener!: (state: { status: string; mode: string | null; version: string | null; serverId: string | null; origin: string | null; error: string | null }) => void
    const openSession = vi.fn(async (sessionId: string) => sessionState(sessionId))
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.30.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.30.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn((listener: typeof runtimeListener) => {
        runtimeListener = listener
        return () => {}
      }),
      onSessionStateChanged: vi.fn(() => () => {}),
      openSession,
      listFiles: vi.fn(async (_sessionId: string, path = '.') => ({ path, items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: false, branch: null, ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-live')
    await flushPromises()
    expect(openSession).toHaveBeenCalledTimes(1)

    runtimeListener({ status: 'stopped', mode: null, version: null, serverId: null, origin: null, error: null })
    runtimeListener({ status: 'running', mode: 'external', version: '0.30.0', serverId: 'server-9', origin: 'http://elsewhere:9000', error: null })
    await flushPromises()

    /* 外部 runtime 上旧会话可能不存在，不重连 */
    expect(openSession).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('coalesces cross-client navigation refreshes and exposes a Config revision without receiving config data', async () => {
    vi.useFakeTimers()
    let globalListener!: (event: { scope: 'navigation' | 'config'; eventType: string }) => void
    const getWorkspaceTreePage = vi.fn()
      .mockResolvedValueOnce({
        workspaces: [{ id: 'workspace-1', name: 'Before', root: '/tmp/project', sessions: [] }],
        hasMoreSessions: false, nextBeforeId: null
      })
      .mockResolvedValueOnce({
        workspaces: [{ id: 'workspace-1', name: 'Updated elsewhere', root: '/tmp/project', sessions: [] }],
        hasMoreSessions: false, nextBeforeId: null
      })
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: { status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1', origin: 'http://127.0.0.1:1234', error: null },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTreePage,
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      onKimiGlobalStateChanged: vi.fn((listener: (event: { scope: 'navigation' | 'config'; eventType: string }) => void) => {
        globalListener = listener
        return () => {}
      })
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    expect(bridge.workspaceTree.value?.[0]?.name).toBe('Before')

    globalListener({ scope: 'navigation', eventType: 'event.workspace.updated' })
    globalListener({ scope: 'navigation', eventType: 'event.session.work_changed' })
    await vi.advanceTimersByTimeAsync(240)
    await flushPromises()
    expect(getWorkspaceTreePage).toHaveBeenCalledTimes(2)
    expect(bridge.workspaceTree.value?.[0]?.name).toBe('Updated elsewhere')

    globalListener({ scope: 'config', eventType: 'event.config.changed' })
    expect(bridge.globalConfigRevision.value).toBe(1)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('optimistically removes a session archived elsewhere and keeps the open session view with a notice', async () => {
    vi.useFakeTimers()
    let globalListener!: (event: { scope: 'navigation' | 'config'; eventType: string; sessionId?: string }) => void
    const sessionTree = (sessions: unknown[]) => ({
      workspaces: [{ id: 'workspace-1', name: 'Project', root: '/tmp/project', sessions }],
      hasMoreSessions: false,
      nextBeforeId: null
    })
    const getWorkspaceTreePage = vi.fn()
      .mockResolvedValueOnce(sessionTree([
        { id: 'session-1', title: 'Open session', updatedAt: '2026-07-24T01:00:00.000Z', busy: false, pendingInteraction: 'none', lastTurnReason: null, lastPrompt: null },
        { id: 'session-2', title: 'Archived elsewhere', updatedAt: '2026-07-24T01:00:01.000Z', busy: false, pendingInteraction: 'none', lastTurnReason: null, lastPrompt: null }
      ]))
      .mockResolvedValueOnce(sessionTree([]))
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: { status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1', origin: 'http://127.0.0.1:1234', error: null },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTreePage,
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      onKimiGlobalStateChanged: vi.fn((listener: (event: { scope: 'navigation' | 'config'; eventType: string; sessionId?: string }) => void) => {
        globalListener = listener
        return () => {}
      }),
      openSession: vi.fn(async (sessionId: string) => sessionState(sessionId)),
      listSessionSkills: vi.fn(async () => []),
      getSessionRuntimeStatus: vi.fn(async () => ({
        busy: false, model: 'model-1', thinking: 'off', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false,
        contextTokens: 0, maxContextTokens: 0, contextUsage: 0
      })),
      getKimiSettings: vi.fn(async () => ({
        auth: { ready: true, providersCount: 0, defaultModel: 'model-1', managedProvider: null },
        models: [{ id: 'model-1', providerId: 'provider-1', displayName: 'Model', maxContextSize: 0, capabilities: [], supportEfforts: [], defaultEffort: null }],
        secondaryModelOptions: [], providers: [],
        preferences: { defaultProvider: null, defaultModel: 'model-1', defaultPermissionMode: 'manual', defaultPlanMode: false, mergeAllAvailableSkills: false, telemetry: false, thinkingEffort: null },
        secondaryModel: { model: null, defaultEffort: null, maxOutputSize: null },
        secondaryModelControl: { preference: { mode: 'inherit', model: null, defaultEffort: null }, appliedPreference: null, appliedSource: null, requiresRestart: false, configurationMode: 'read-only' },
        capabilities: { canAddProvider: false, canEditProvider: false, canDeleteProvider: false, providerManagementUnavailableReason: null, providerDeleteUnavailableReason: null, secondaryModel: { supported: false, enabled: null, writable: false, canDisable: false, maxOutputSizeWritable: false, unavailableReason: null } }
      })),
      getSessionOperationalState: vi.fn(async () => ({ goal: null, tasks: [], prompts: { active: null, queued: [] } })),
      getSessionWarnings: vi.fn(async () => []),
      listFiles: vi.fn(async () => ({ path: '.', items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: true, branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-1')
    await flushPromises()
    expect(bridge.workspaceTree.value?.[0]?.sessions).toHaveLength(2)
    const store = useWorkbenchStore()
    /* 生产路径由 App.vue 的 activeSessionId watcher 把 store 与 composable 联动起来 */
    store.activeSessionId = 'session-1'

    /* 归档的是其他会话：乐观移除导航条目，不打扰当前视图 */
    globalListener({ scope: 'navigation', eventType: 'event.session.archived', sessionId: 'session-2' })
    expect(bridge.workspaceTree.value?.[0]?.sessions.map((session) => session.id)).toEqual(['session-1'])
    expect(store.sessionArchivedNotice).toBeNull()

    /* 归档的正是当前打开的会话：乐观移除 + 非阻塞提示，视图保留 */
    globalListener({ scope: 'navigation', eventType: 'event.session.archived', sessionId: 'session-1' })
    expect(bridge.workspaceTree.value?.[0]?.sessions).toHaveLength(0)
    expect(store.sessionArchivedNotice).toEqual({ sessionId: 'session-1', title: 'Open session' })
    expect(bridge.sessionView.value?.sessionId).toBe('session-1')

    /* 两个事件合并为一次 240ms 受控重读收敛 */
    await vi.advanceTimersByTimeAsync(240)
    await flushPromises()
    expect(getWorkspaceTreePage).toHaveBeenCalledTimes(2)
    expect(bridge.workspaceTree.value?.[0]?.sessions).toHaveLength(0)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('inherits the default thinking effort from settings for new sessions', async () => {
    const model = {
      id: 'kimi-for-coding', providerId: 'managed:kimi-code', displayName: 'Kimi for Coding',
      maxContextSize: 262_144, capabilities: ['thinking'],
      supportEfforts: ['off', 'low', 'high'], defaultEffort: 'high'
    }
    let runtimeThinking = 'off'
    let settingsThinkingEffort: string | null = 'LOW'
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.2.2', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.2', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      openSession: vi.fn(async (sessionId: string) => sessionState(sessionId)),
      listFiles: vi.fn(async (_sessionId: string, path = '.') => ({ path, items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: true,
        branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })),
      getSessionRuntimeStatus: vi.fn(async () => ({
        busy: false, model: model.id, thinking: runtimeThinking, permissionMode: 'manual' as const,
        planMode: false, swarmMode: false, towerMode: false, contextTokens: 0, maxContextTokens: 262_144, contextUsage: 0
      })),
      getKimiSettings: vi.fn(async () => ({
        models: [model],
        preferences: { defaultModel: model.id, thinkingEffort: settingsThinkingEffort }
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    let bridge!: ReturnType<typeof useRuntimeBridge>

    // 设置值生效：大小写不敏感，并按 supportEfforts 校验
    const firstWrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-settings')
    await flushPromises()
    expect(bridge.promptControls.value?.thinking).toBe('low')

    // 用户切换思考强度只影响当前会话，不再写入 localStorage 继承给下个会话
    bridge.setPromptControls({
      ...bridge.promptControls.value!,
      thinking: 'high'
    })
    expect(window.localStorage.getItem('moon-code:last-thinking-effort:v1')).toBe(null)
    firstWrapper.unmount()

    // 设置为 'off'/空时视为未设置，回退到模型默认值
    settingsThinkingEffort = 'off'
    const secondWrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-model-default')
    await flushPromises()
    expect(bridge.promptControls.value?.thinking).toBe('high')
    secondWrapper.unmount()

    // 已有会话 runtime 上报的思考强度仍然优先
    runtimeThinking = 'high'
    settingsThinkingEffort = 'low'
    const thirdWrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-runtime')
    await flushPromises()
    expect(bridge.promptControls.value?.thinking).toBe('high')
    thirdWrapper.unmount()
  })

  it('applies plan mode toggles immediately as session config and rolls back on failure', async () => {
    const model = {
      id: 'kimi-for-coding', providerId: 'managed:kimi-code', displayName: 'Kimi for Coding',
      maxContextSize: 262_144, capabilities: ['thinking'],
      supportEfforts: ['off', 'low', 'high'], defaultEffort: 'high'
    }
    const setSessionPlanMode = vi.fn(async (_sessionId: string, _enabled: boolean) => {})
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.2.2', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.2', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      openSession: vi.fn(async (sessionId: string) => sessionState(sessionId)),
      listFiles: vi.fn(async (_sessionId: string, path = '.') => ({ path, items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: true,
        branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })),
      getSessionRuntimeStatus: vi.fn(async () => ({
        busy: false, model: model.id, thinking: 'off', permissionMode: 'manual' as const,
        planMode: false, swarmMode: false, towerMode: false, contextTokens: 0, maxContextTokens: 262_144, contextUsage: 0
      })),
      setSessionPlanMode,
      getKimiSettings: vi.fn(async () => ({
        models: [model],
        preferences: { defaultModel: model.id }
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-1')
    await flushPromises()
    expect(bridge.promptControls.value?.planMode).toBe(false)

    bridge.setPromptControls({ ...bridge.promptControls.value!, planMode: true })
    await flushPromises()
    expect(setSessionPlanMode).toHaveBeenCalledWith('session-1', true)
    expect(bridge.promptControls.value?.planMode).toBe(true)

    setSessionPlanMode.mockRejectedValueOnce(new Error('runtime offline'))
    bridge.setPromptControls({ ...bridge.promptControls.value!, planMode: false })
    await flushPromises()
    expect(bridge.promptControls.value?.planMode).toBe(true)
    expect(bridge.sessionControlsError.value).toBe('runtime offline')
    wrapper.unmount()
  })

  it('applies swarm mode toggles immediately as session config and rolls back on failure', async () => {
    const model = {
      id: 'kimi-for-coding', providerId: 'managed:kimi-code', displayName: 'Kimi for Coding',
      maxContextSize: 262_144, capabilities: ['thinking'],
      supportEfforts: ['off', 'low', 'high'], defaultEffort: 'high'
    }
    const setSessionSwarmMode = vi.fn(async (_sessionId: string, _enabled: boolean) => {})
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.2.2', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.2', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      openSession: vi.fn(async (sessionId: string) => sessionState(sessionId)),
      listFiles: vi.fn(async (_sessionId: string, path = '.') => ({ path, items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: true,
        branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })),
      getSessionRuntimeStatus: vi.fn(async () => ({
        busy: false, model: model.id, thinking: 'off', permissionMode: 'manual' as const,
        planMode: false, swarmMode: false, towerMode: false, contextTokens: 0, maxContextTokens: 262_144, contextUsage: 0
      })),
      setSessionSwarmMode,
      getKimiSettings: vi.fn(async () => ({
        models: [model],
        preferences: { defaultModel: model.id }
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-1')
    await flushPromises()
    expect(bridge.promptControls.value?.swarmMode).toBe(false)

    bridge.setPromptControls({ ...bridge.promptControls.value!, swarmMode: true, towerMode: false })
    await flushPromises()
    expect(setSessionSwarmMode).toHaveBeenCalledWith('session-1', true)
    expect(bridge.promptControls.value?.swarmMode).toBe(true)

    setSessionSwarmMode.mockRejectedValueOnce(new Error('runtime offline'))
    bridge.setPromptControls({ ...bridge.promptControls.value!, swarmMode: false, towerMode: false })
    await flushPromises()
    expect(bridge.promptControls.value?.swarmMode).toBe(true)
    expect(bridge.sessionControlsError.value).toBe('runtime offline')
    wrapper.unmount()
  })

  it('matches Kimi Web by keeping active-turn follow-ups local, reorderable, and flushing one at a time', async () => {
    let stateListener!: (state: SessionViewState) => void
    const active = { ...sessionState('session-queue'), busy: true, mainTurnActive: true, activePromptStatus: 'running' as const }
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn((listener: (state: SessionViewState) => void) => {
        stateListener = listener
        return () => {}
      }),
      openSession: vi.fn(async () => active),
      listFiles: vi.fn(async (_sessionId: string, path = '.') => ({ path, items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: true,
        branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })),
      submitPrompt: vi.fn(async (_sessionId: string, input: KimiPromptInput) => {
        structuredClone(input)
        return { promptId: 'p-next', userMessageId: 'm-next', status: 'running' as const }
      })
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-queue')
    await flushPromises()
    expect(api.listFiles).toHaveBeenCalledTimes(1)

    const controls = reactive({
      model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual' as const,
      planMode: false, swarmMode: false, towerMode: false
    })
    await bridge.submitPrompt('session-queue', reactive({
      text: '先不要收尾，补充检查边界情况', controls, deliveryMode: 'steer' as const
    }))
    expect(api.submitPrompt).toHaveBeenCalledWith('session-queue', expect.objectContaining({
      text: '先不要收尾，补充检查边界情况', deliveryMode: 'steer'
    }))
    ;(api.submitPrompt as ReturnType<typeof vi.fn>).mockClear()

    await bridge.submitPrompt('session-queue', reactive({ text: '先执行 A', controls }))
    await bridge.submitPrompt('session-queue', reactive({ text: '再执行 B', controls }))
    expect(api.submitPrompt).not.toHaveBeenCalled()
    expect(bridge.localPromptQueue.value.map((draft) => draft.input.text)).toEqual(['先执行 A', '再执行 B'])

    bridge.moveLocalPrompt('session-queue', bridge.localPromptQueue.value[1]!.id, -1)
    expect(bridge.localPromptQueue.value.map((draft) => draft.input.text)).toEqual(['再执行 B', '先执行 A'])
    bridge.setPromptControls({ ...controls, permissionMode: 'auto' })
    stateListener({ ...active, busy: false, mainTurnActive: false, activePromptStatus: null })
    await flushPromises()

    expect(api.listFiles).toHaveBeenCalledTimes(2)
    expect(api.submitPrompt).toHaveBeenCalledWith('session-queue', expect.objectContaining({
      text: '再执行 B', controls: expect.objectContaining({ permissionMode: 'auto' })
    }))
    expect(bridge.localPromptQueue.value.map((draft) => draft.input.text)).toEqual(['先执行 A'])
    wrapper.unmount()
  })

  it('stops a skill turn through session abort when Kimi has no prompt id', async () => {
    let stateListener!: (state: SessionViewState) => void
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn((listener: (state: SessionViewState) => void) => {
        stateListener = listener
        return () => {}
      }),
      abortSession: vi.fn(async () => ({ aborted: true })),
      abortPrompt: vi.fn()
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    stateListener({
      ...sessionState('session-skill'),
      busy: true,
      mainTurnActive: true,
      activePromptStatus: 'running'
    })

    await bridge.abortActivePrompt()

    expect(api.abortSession).toHaveBeenCalledWith('session-skill')
    expect(api.abortPrompt).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the latest selected session when an older open or event arrives late', async () => {
    let resolveA!: (state: SessionViewState) => void
    let resolveB!: (state: SessionViewState) => void
    let stateListener!: (state: SessionViewState) => void
    const openA = new Promise<SessionViewState>((resolve) => { resolveA = resolve })
    const openB = new Promise<SessionViewState>((resolve) => { resolveB = resolve })
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0',
        platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn((listener: (state: SessionViewState) => void) => {
        stateListener = listener
        return () => {}
      }),
      openSession: vi.fn((sessionId: string) => sessionId === 'session-a' ? openA : openB),
      listFiles: vi.fn(async (_sessionId: string, path = '.') => ({ path, items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: true,
        branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })),
      readFile: vi.fn(),
      getFileDiff: vi.fn()
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()

    const pendingA = bridge.openSession('session-a')
    const pendingB = bridge.openSession('session-b')
    resolveB(sessionState('session-b'))
    await pendingB
    resolveA(sessionState('session-a'))
    await pendingA

    expect(bridge.sessionView.value?.sessionId).toBe('session-b')
    stateListener(sessionState('session-a'))
    expect(bridge.sessionView.value?.sessionId).toBe('session-b')
    wrapper.unmount()
  })

  it('keeps the latest selected Agent transcript when an older request resolves late', async () => {
    let resolveAgentA!: (value: Awaited<ReturnType<KimiAgentDesktopApi['getAgentTranscript']>>) => void
    let resolveAgentB!: (value: Awaited<ReturnType<KimiAgentDesktopApi['getAgentTranscript']>>) => void
    const agentA = new Promise<Awaited<ReturnType<KimiAgentDesktopApi['getAgentTranscript']>>>((resolve) => {
      resolveAgentA = resolve
    })
    const agentB = new Promise<Awaited<ReturnType<KimiAgentDesktopApi['getAgentTranscript']>>>((resolve) => {
      resolveAgentB = resolve
    })
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      openSession: vi.fn(async () => sessionState('session-agent')),
      listFiles: vi.fn(async (_sessionId: string, path = '.') => ({ path, items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: true,
        branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })),
      getAgentTranscript: vi.fn((_sessionId: string, agentId: string) => agentId === 'agent-a' ? agentA : agentB)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-agent')

    const pendingA = bridge.loadAgentTranscript('session-agent', 'agent-a')
    const pendingB = bridge.loadAgentTranscript('session-agent', 'agent-b')
    resolveAgentB({ agentId: 'agent-b', messages: [], hasMore: false, usage: null })
    await pendingB
    resolveAgentA({ agentId: 'agent-a', messages: [], hasMore: false, usage: null })
    await pendingA

    expect(bridge.agentTranscript.value?.agentId).toBe('agent-b')
    expect(bridge.agentTranscriptPending.value).toBe(false)
    wrapper.unmount()
  })

  it('keeps Files and Git context scoped to the latest selected session', async () => {
    let resolveListA!: (value: Awaited<ReturnType<KimiAgentDesktopApi['listFiles']>>) => void
    let resolveListB!: (value: Awaited<ReturnType<KimiAgentDesktopApi['listFiles']>>) => void
    const listA = new Promise<Awaited<ReturnType<KimiAgentDesktopApi['listFiles']>>>((resolve) => { resolveListA = resolve })
    const listB = new Promise<Awaited<ReturnType<KimiAgentDesktopApi['listFiles']>>>((resolve) => { resolveListB = resolve })
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0',
        platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      openSession: vi.fn(async (sessionId: string) => sessionState(sessionId)),
      listFiles: vi.fn((sessionId: string) => sessionId === 'session-a' ? listA : listB),
      getGitStatus: vi.fn(async (sessionId: string) => ({
        available: true,
        branch: sessionId, ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })),
      readFile: vi.fn(),
      getFileDiff: vi.fn()
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-a')
    await bridge.openSession('session-b')
    resolveListB({
      path: '.',
      items: [{
        path: 'b.ts', name: 'b.ts', kind: 'file', size: 1, modifiedAt: null,
        mime: 'text/plain', languageId: 'typescript', isBinary: false, gitStatus: null, childCount: null
      }],
      truncated: false
    })
    await flushPromises()
    resolveListA({
      path: '.',
      items: [{
        path: 'a.ts', name: 'a.ts', kind: 'file', size: 1, modifiedAt: null,
        mime: 'text/plain', languageId: 'typescript', isBinary: false, gitStatus: null, childCount: null
      }],
      truncated: false
    })
    await flushPromises()

    expect(bridge.fileTree.children['.']?.[0]?.path).toBe('b.ts')
    expect(bridge.gitStatus.value?.branch).toBe('session-b')
    bridge.clearActiveSession()
    expect(bridge.sessionView.value).toBeNull()
    expect(bridge.fileTree.children).toEqual({})
    expect(bridge.gitStatus.value).toBeNull()
    await bridge.openFile('b.ts')
    expect(api.readFile).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('uses the device default app and refreshes the current directory after moving an entry to Trash', async () => {
    const listFiles = vi.fn(async (_sessionId: string, path = '.') => ({
      path,
      items: path === 'dist' ? [{
        path: 'dist/dashboard.html', name: 'dashboard.html', kind: 'file' as const, size: 1,
        modifiedAt: null, mime: 'text/html', languageId: 'html', isBinary: false,
        gitStatus: null, childCount: null
      }] : [],
      truncated: false
    }))
    const openWorkspaceFileSystem = vi.fn(async () => ({ opened: true as const }))
    const trashWorkspaceEntry = vi.fn(async () => ({ trashed: true as const }))
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      openSession: vi.fn(async () => sessionState('session-files')),
      listFiles,
      getGitStatus: vi.fn(async () => ({
        available: true,
        branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })),
      openWorkspaceFileSystem,
      trashWorkspaceEntry
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-files')
    await flushPromises()
    await bridge.toggleDirectory('dist')
    expect(bridge.fileTree.children['dist']?.[0]?.path).toBe('dist/dashboard.html')

    await bridge.openWorkspaceFileSystem('dist/dashboard.html')
    await bridge.trashWorkspaceEntry('dist/dashboard.html')

    expect(openWorkspaceFileSystem).toHaveBeenCalledWith('session-files', 'dist/dashboard.html')
    expect(trashWorkspaceEntry).toHaveBeenCalledWith('session-files', 'dist/dashboard.html')
    expect(listFiles).toHaveBeenCalledWith('session-files', '.')
    expect(listFiles).toHaveBeenLastCalledWith('session-files', 'dist')
    expect(bridge.fileActionNotice.value).toBe('已移到废纸篓。')
    wrapper.unmount()
  })

  it('keeps file queries scoped to the active Session and treats a cancelled save as a no-op', async () => {
    let resolveSearch!: (value: Awaited<ReturnType<KimiAgentDesktopApi['searchFiles']>>) => void
    const pendingSearch = new Promise<Awaited<ReturnType<KimiAgentDesktopApi['searchFiles']>>>((resolve) => {
      resolveSearch = resolve
    })
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: { status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1', origin: 'http://127.0.0.1:1234', error: null },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      openSession: vi.fn(async (sessionId: string) => sessionState(sessionId)),
      listFiles: vi.fn(async (_sessionId: string, path = '.') => ({ path, items: [], truncated: false })),
      getGitStatus: vi.fn(async () => ({
        available: true,
        branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })),
      searchFiles: vi.fn(() => pendingSearch),
      downloadWorkspaceFile: vi.fn(async () => ({ saved: false }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.openSession('session-one')

    const mentionSearch = bridge.searchMentionFiles('App')
    const search = bridge.searchFiles('App')
    expect(bridge.fileSearchPending.value).toBe(true)
    bridge.clearActiveSession()
    resolveSearch({
      items: [{ path: 'src/App.vue', name: 'App.vue', kind: 'file', score: 0.9, matchPositions: [0] }],
      truncated: false
    })
    await search
    await expect(mentionSearch).resolves.toEqual([])
    expect(bridge.fileSearch.value).toBeNull()
    expect(bridge.fileSearchError.value).toBeNull()
    expect(bridge.fileSearchPending.value).toBe(false)

    await bridge.openSession('session-two')
    await bridge.downloadWorkspaceFile('README.md')
    expect(api.downloadWorkspaceFile).toHaveBeenCalledWith('session-two', 'README.md')
    expect(bridge.fileActionError.value).toBeNull()
    expect(bridge.fileActionNotice.value).toBeNull()
    wrapper.unmount()
  })

  it('merges authoritative paged Session navigation without duplicating workspaces', async () => {
    const session = (id: string) => ({
      id, title: id, updatedAt: null, busy: false, pendingInteraction: 'none' as const,
      lastTurnReason: null, lastPrompt: null, parentSessionId: null
    })
    const getWorkspaceTreePage = vi.fn()
      .mockResolvedValueOnce({
        workspaces: [{ id: 'workspace-1', name: 'Project', root: '/tmp/project', sessions: [session('session-new')] }],
        hasMoreSessions: true,
        nextBeforeId: 'session-new'
      })
      .mockResolvedValueOnce({
        workspaces: [{ id: 'workspace-1', name: 'Project', root: '/tmp/project', sessions: [session('session-old')] }],
        hasMoreSessions: false,
        nextBeforeId: 'session-old'
      })
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: { status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1', origin: 'http://127.0.0.1:1234', error: null },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTreePage,
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    expect(bridge.sessionPageHasMore.value).toBe(true)

    await bridge.loadMoreSessions()
    expect(getWorkspaceTreePage).toHaveBeenLastCalledWith('session-new')
    expect(bridge.workspaceTree.value?.[0]?.sessions.map((item) => item.id)).toEqual([
      'session-new', 'session-old'
    ])
    expect(bridge.sessionPageHasMore.value).toBe(false)
    wrapper.unmount()
  })

  it('reloads every previously loaded navigation page after a cross-client invalidation', async () => {
    const session = (id: string) => ({
      id, title: id, updatedAt: null, busy: false, pendingInteraction: 'none' as const,
      lastTurnReason: null, lastPrompt: null, parentSessionId: null
    })
    const getWorkspaceTreePage = vi.fn()
      .mockResolvedValueOnce({
        workspaces: [{ id: 'workspace-1', name: 'Project', root: '/tmp/project', sessions: [session('session-new')] }],
        hasMoreSessions: true, nextBeforeId: 'session-new'
      })
      .mockResolvedValueOnce({
        workspaces: [{ id: 'workspace-1', name: 'Project', root: '/tmp/project', sessions: [session('session-old')] }],
        hasMoreSessions: false, nextBeforeId: 'session-old'
      })
      .mockResolvedValueOnce({
        workspaces: [{ id: 'workspace-1', name: 'Project renamed elsewhere', root: '/tmp/project', sessions: [session('session-new')] }],
        hasMoreSessions: true, nextBeforeId: 'session-new'
      })
      .mockResolvedValueOnce({
        workspaces: [{ id: 'workspace-1', name: 'Project renamed elsewhere', root: '/tmp/project', sessions: [session('session-old')] }],
        hasMoreSessions: false, nextBeforeId: 'session-old'
      })
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: { status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1', origin: 'http://127.0.0.1:1234', error: null },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTreePage,
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.loadMoreSessions()

    await bridge.refreshWorkspaceTree()

    expect(getWorkspaceTreePage).toHaveBeenLastCalledWith('session-new')
    expect(bridge.workspaceTree.value?.[0]).toMatchObject({ name: 'Project renamed elsewhere' })
    expect(bridge.workspaceTree.value?.[0]?.sessions.map((item) => item.id)).toEqual([
      'session-new', 'session-old'
    ])
    wrapper.unmount()
  })
})

describe('useRuntimeBridge draft controls', () => {
  it('loads draft prompt controls from the Kimi new-session defaults', async () => {
    const getKimiSettings = vi.fn(async () => ({
      preferences: {
        defaultProvider: 'managed:kimi-code',
        defaultModel: 'kimi-for-coding',
        defaultPermissionMode: 'auto' as const,
        defaultPlanMode: true,
        mergeAllAvailableSkills: null,
        telemetry: null,
        thinkingEffort: 'low'
      },
      models: [{
        id: 'kimi-for-coding',
        providerId: 'managed:kimi-code',
        displayName: 'Kimi for Coding',
        maxContextSize: 262_144,
        capabilities: ['thinking'],
        supportEfforts: ['off', 'low', 'high', 'max'],
        defaultEffort: 'high'
      }]
    }))
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.30.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.30.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      getKimiSettings
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()
    expect(bridge.promptControls.value).toBeNull()

    await bridge.loadDraftControls()

    expect(getKimiSettings).toHaveBeenCalledTimes(1)
    expect(bridge.promptControls.value).toEqual({
      model: 'kimi-for-coding',
      thinking: 'low',
      permissionMode: 'auto',
      planMode: true,
      swarmMode: false, towerMode: false
    })
    expect(bridge.sessionModels.value).toHaveLength(1)
    expect(bridge.sessionControlsError.value).toBeNull()
    wrapper.unmount()
  })

  it('reports an error instead of enabling the composer when no model is available', async () => {
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.30.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.30.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      getKimiSettings: vi.fn(async () => ({
        preferences: {
          defaultProvider: null,
          defaultModel: null,
          defaultPermissionMode: null,
          defaultPlanMode: null,
          mergeAllAvailableSkills: null,
          telemetry: null,
          thinkingEffort: null
        },
        models: []
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()

    await bridge.loadDraftControls()

    expect(bridge.promptControls.value).toBeNull()
    expect(bridge.sessionControlsError.value).toContain('没有可用模型')
    wrapper.unmount()
  })
})

describe('useRuntimeBridge draft workspace tree', () => {
  it('lists the draft workspace locally before the first message creates a session', async () => {
    const listWorkspaceFiles = vi.fn(async (_workspaceId: string, path = '.') => ({
      path,
      items: path === '.'
        ? [{
            path: 'src', name: 'src', kind: 'directory' as const, size: null,
            modifiedAt: null, mime: null, languageId: null, isBinary: false,
            gitStatus: null, childCount: null
          }]
        : [{
            path: 'src/main.ts', name: 'main.ts', kind: 'file' as const, size: null,
            modifiedAt: null, mime: null, languageId: null, isBinary: false,
            gitStatus: null, childCount: null
          }],
      truncated: false
    }))
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      listWorkspaceFiles
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()

    bridge.openDraftWorkspaceTree('workspace-1')
    await flushPromises()

    expect(listWorkspaceFiles).toHaveBeenCalledWith('workspace-1', '.')
    expect(bridge.fileTree.children['.']?.map((entry) => entry.path)).toEqual(['src'])

    await bridge.toggleDirectory('src')
    expect(listWorkspaceFiles).toHaveBeenCalledWith('workspace-1', 'src')
    expect(bridge.fileTree.children['src']?.[0]?.path).toBe('src/main.ts')

    /* 退出草稿态后文件树不再按工作区列举 */
    bridge.clearActiveSession()
    await bridge.toggleDirectory('src')
    expect(listWorkspaceFiles).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('refreshes the draft workspace tree, previews files, and runs context-menu actions in draft mode', async () => {
    const listWorkspaceFiles = vi.fn(async (_workspaceId: string, path = '.') => ({
      path,
      items: path === '.'
        ? [{
            path: 'src', name: 'src', kind: 'directory' as const, size: null,
            modifiedAt: null, mime: null, languageId: null, isBinary: false,
            gitStatus: null, childCount: null
          }]
        : [{
            path: 'src/main.ts', name: 'main.ts', kind: 'file' as const, size: null,
            modifiedAt: null, mime: null, languageId: null, isBinary: false,
            gitStatus: null, childCount: null
          }],
      truncated: false
    }))
    const readWorkspaceFileFromWorkspace = vi.fn(async () => ({
      path: 'src/main.ts', content: 'const x = 1', encoding: 'utf-8' as const, size: 12,
      truncated: false, mime: null, languageId: null, lineCount: 1, isBinary: false
    }))
    const openWorkspaceFileSystemFromWorkspace = vi.fn(async () => ({ opened: true as const }))
    const trashWorkspaceEntryFromWorkspace = vi.fn(async () => ({ trashed: true as const }))
    const attachWorkspaceFileFromWorkspace = vi.fn(async () => ({
      fileId: 'file-1', name: 'main.ts', mediaType: 'text/plain', size: 12
    }))
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      listWorkspaceFiles,
      readWorkspaceFileFromWorkspace,
      openWorkspaceFileSystemFromWorkspace,
      trashWorkspaceEntryFromWorkspace,
      attachWorkspaceFileFromWorkspace
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()

    bridge.openDraftWorkspaceTree('workspace-1')
    await flushPromises()
    await bridge.toggleDirectory('src')
    expect(bridge.fileTree.children['src']?.[0]?.path).toBe('src/main.ts')
    expect(listWorkspaceFiles).toHaveBeenCalledTimes(2)

    /* 再次进入同一草稿工作区（如点刷新按钮）：根目录与已展开目录一起重载。 */
    bridge.openDraftWorkspaceTree('workspace-1')
    await flushPromises()
    expect(listWorkspaceFiles).toHaveBeenCalledTimes(4)
    expect(listWorkspaceFiles).toHaveBeenNthCalledWith(3, 'workspace-1', '.')
    expect(listWorkspaceFiles).toHaveBeenNthCalledWith(4, 'workspace-1', 'src')

    /* 草稿态文件预览走工作区口径。 */
    await bridge.openFile('src/main.ts')
    expect(readWorkspaceFileFromWorkspace).toHaveBeenCalledWith('workspace-1', 'src/main.ts')
    expect(bridge.filePreview.value?.content).toBe('const x = 1')

    /* 右键菜单操作：系统打开 / 删除 / 添加附件全部走工作区口径。 */
    await bridge.openWorkspaceFileSystem('src/main.ts')
    expect(openWorkspaceFileSystemFromWorkspace).toHaveBeenCalledWith('workspace-1', 'src/main.ts')
    expect(bridge.fileActionNotice.value).toBe('已使用系统默认应用打开。')

    const attached = await bridge.attachWorkspaceFile('src/main.ts')
    expect(attachWorkspaceFileFromWorkspace).toHaveBeenCalledWith('workspace-1', 'src/main.ts')
    expect(attached?.fileId).toBe('file-1')

    await bridge.trashWorkspaceEntry('src/main.ts')
    expect(trashWorkspaceEntryFromWorkspace).toHaveBeenCalledWith('workspace-1', 'src/main.ts')
    /* 预览正开着被删的文件时会先关闭预览（清空操作提示），这是既有行为。 */
    expect(bridge.filePreview.value).toBeNull()
    /* 删除后目录按草稿工作区重载。 */
    expect(listWorkspaceFiles).toHaveBeenCalledTimes(6)

    wrapper.unmount()
  })

  it('detects the draft workspace git status locally so the TopBar can show the branch', async () => {
    const listWorkspaceFiles = vi.fn(async (_workspaceId: string, path = '.') => ({ path, items: [], truncated: false }))
    const getWorkspaceGitStatus = vi.fn(async () => ({
      available: true, branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
    }))
    const api = {
      getBootstrapState: vi.fn(async () => ({
        appVersion: '0.1.0', platform: 'darwin',
        runtime: {
          status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
          origin: 'http://127.0.0.1:1234', error: null
        },
        discovery: {
          supportedRange: '^0.29.0',
          managed: { kind: 'managed', version: '0.29.0', executable: '/kimi', compatible: true, reason: null },
          system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'missing' }
        }
      })),
      getWorkspaceTree: vi.fn(async () => []),
      onRuntimeStateChanged: vi.fn(() => () => {}),
      onSessionStateChanged: vi.fn(() => () => {}),
      listWorkspaceFiles,
      getWorkspaceGitStatus
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useRuntimeBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useRuntimeBridge()
        return () => null
      }
    }))
    await flushPromises()

    /* 进入草稿态即检测：gitStatus 不再是 null，TopBar 得以显示分支。 */
    bridge.openDraftWorkspaceTree('workspace-1')
    await flushPromises()
    expect(getWorkspaceGitStatus).toHaveBeenCalledWith('workspace-1')
    expect(bridge.gitStatus.value?.available).toBe(true)
    expect(bridge.gitStatus.value?.branch).toBe('main')

    /* 同一工作区刷新（reentry）同样重测。 */
    bridge.openDraftWorkspaceTree('workspace-1')
    await flushPromises()
    expect(getWorkspaceGitStatus).toHaveBeenCalledTimes(2)

    /* 退出草稿态后 gitStatus 清空，TopBar 回到「未知」不渲染。 */
    bridge.clearActiveSession()
    expect(bridge.gitStatus.value).toBeNull()
    wrapper.unmount()
  })
})
