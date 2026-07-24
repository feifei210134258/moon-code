// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiAgentDesktopApi, KimiSettingsSnapshot, KimiUsageState } from '../../src/shared/contracts.js'
import SettingsPanel from '../../src/renderer/src/components/SettingsPanel.vue'

const snapshot: KimiSettingsSnapshot = {
  auth: {
    ready: true,
    providersCount: 1,
    defaultModel: 'kimi-for-coding',
    managedProvider: { name: 'managed:kimi-code', status: 'unauthenticated' }
  },
  models: [
    {
      id: 'kimi-for-coding', providerId: 'managed:kimi-code', displayName: 'Kimi for Coding',
      maxContextSize: 262_144, capabilities: [], supportEfforts: ['off', 'high'], defaultEffort: 'high'
    },
    {
      id: 'kimi-fast', providerId: 'managed:kimi-code', displayName: 'Kimi Fast',
      maxContextSize: 131_072, capabilities: [], supportEfforts: [], defaultEffort: null
    }
  ],
  providers: [{
    id: 'managed:kimi-code', type: 'kimi', baseUrl: null, defaultModel: null,
    hasCredential: false, status: 'unconfigured', models: ['kimi-for-coding', 'kimi-fast']
  }],
  preferences: {
    defaultProvider: 'managed:kimi-code',
    defaultModel: 'kimi-for-coding',
    defaultPermissionMode: 'manual',
    defaultPlanMode: true,
    mergeAllAvailableSkills: true,
    telemetry: false
  },
  capabilities: {
    canAddProvider: true,
    canDeleteProvider: false,
    providerDeleteUnavailableReason: 'Kimi v2 has no delete route.'
  }
}

const usage: KimiUsageState = {
  phase: 'ready', summary: null, limits: [], extraUsage: null,
  updatedAt: null, nextRefreshAt: null, refreshing: false, source: 'kimi-oauth-usage', error: null,
  preferences: { infoThreshold: 0.5, warningThreshold: 0.8, criticalThreshold: 0.95, systemNotifications: true }
}

afterEach(() => {
  delete window.kimiAgent
})

describe('SettingsPanel', () => {
  it('reloads the visible settings from Kimi after a cross-client Config invalidation', async () => {
    const updated = {
      ...snapshot,
      preferences: { ...snapshot.preferences, defaultModel: 'kimi-fast' }
    }
    const api = {
      getKimiSettings: vi.fn()
        .mockResolvedValueOnce(snapshot)
        .mockResolvedValueOnce(updated)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1',
        usage, configRevision: 0
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.setProps({ configRevision: 1 })
    await flushPromises()

    expect(api.getKimiSettings).toHaveBeenCalledTimes(2)
    await wrapper.findAll('.settings-nav button')[1]!.trigger('click')
    expect(wrapper.findAll('.model-row')[1]!.classes()).toContain('is-selected')
    wrapper.unmount()
  })

  it('loads Kimi-owned settings and updates the default model', async () => {
    const updated = {
      ...snapshot,
      preferences: { ...snapshot.preferences, defaultModel: 'kimi-fast' }
    }
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      setDefaultModel: vi.fn(async () => updated)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    expect(api.getKimiSettings).toHaveBeenCalledOnce()
    await wrapper.findAll('.settings-nav button')[1]!.trigger('click')
    const modelRows = wrapper.findAll('.model-row')
    expect(modelRows).toHaveLength(2)
    await modelRows[1]!.trigger('click')
    await flushPromises()

    expect(api.setDefaultModel).toHaveBeenCalledWith('kimi-fast')
    expect(wrapper.findAll('.model-row')[1]!.classes()).toContain('is-selected')
    wrapper.unmount()
  })

  it('submits provider credentials only through typed Kimi IPC and clears the field', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      addKimiProvider: vi.fn(async () => snapshot)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.findAll('.settings-nav button')[2]!.trigger('click')
    await wrapper.get('.settings-title .icon-text-button').trigger('click')
    const inputs = wrapper.findAll('.provider-form input')
    await inputs[0]!.setValue('local:openai')
    await inputs[1]!.setValue('http://127.0.0.1:11434/v1')
    await inputs[2]!.setValue('secret-key')
    await wrapper.get('.provider-form').trigger('submit')
    await flushPromises()

    expect(api.addKimiProvider).toHaveBeenCalledWith({
      id: 'local:openai',
      type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'secret-key'
    })
    expect(wrapper.find('.provider-form').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('secret-key')
    wrapper.unmount()
  })

  it('starts the official device-code flow and renders its authorization link', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      startOAuthLogin: vi.fn(async () => ({
        flowId: 'flow-1', provider: 'managed:kimi-code', status: 'pending' as const,
        verificationUri: 'https://auth.kimi.com/device',
        verificationUriComplete: 'https://auth.kimi.com/device?code=ABCD',
        userCode: 'ABCD', expiresIn: 600, interval: 60, expiresAt: '2026-07-23T01:00:00.000Z',
        resolvedAt: null, errorMessage: null
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.get('.account-row .primary-button').trigger('click')
    await flushPromises()

    expect(api.startOAuthLogin).toHaveBeenCalledWith('managed:kimi-code')
    expect(wrapper.get('.oauth-device-panel').text()).toContain('ABCD')
    expect(wrapper.get('.oauth-device-panel a').attributes('href')).toBe('https://auth.kimi.com/device?code=ABCD')
    wrapper.unmount()
  })

  it('shows Kimi-owned Skills, effective Tools and restarts MCP through Kimi', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      listSessionSkills: vi.fn(async () => [{
        name: 'review', description: 'Review current changes', source: 'project' as const,
        type: null, userInvocableOnly: false
      }]),
      listMcpServers: vi.fn(async () => [{
        id: 'github', name: 'github', transport: 'stdio' as const, status: 'connected' as const,
        lastError: null, toolCount: 3
      }]),
      listKimiTools: vi.fn(async () => [{
        name: 'mcp__github__search', description: 'Search GitHub', source: 'mcp' as const,
        mcpServerId: 'github', active: true
      }]),
      restartMcpServer: vi.fn(async () => ({ restarting: true as const }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.findAll('.settings-nav button')[3]!.trigger('click')
    await flushPromises()
    expect(api.listSessionSkills).toHaveBeenCalledWith('session-1')
    expect(wrapper.get('.skill-list').text()).toContain('/review')

    await wrapper.findAll('.settings-nav button')[4]!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.mcp-list').text()).toContain('github')
    expect(wrapper.get('.tool-list').text()).toContain('mcp__github__search')
    await wrapper.get('.mcp-row button').trigger('click')
    await flushPromises()
    expect(api.restartMcpServer).toHaveBeenCalledWith('github')
    expect(api.listMcpServers).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('已请求 Kimi 重启 MCP Server github；当前状态：connected。')
    wrapper.unmount()
  })

  it('loads Workspace Skills when the selected Workspace has no Session', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      listWorkspaceSkills: vi.fn(async () => [{
        name: 'workspace-review', description: 'Review workspace', source: 'project' as const,
        type: null, userInvocableOnly: false
      }])
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: '', activeWorkspaceId: 'workspace-empty', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.findAll('.settings-nav button')[3]!.trigger('click')
    await flushPromises()

    expect(api.listWorkspaceSkills).toHaveBeenCalledWith('workspace-empty')
    expect(wrapper.get('.skill-list').text()).toContain('/workspace-review')
    wrapper.unmount()
  })

  it('updates ordered local Usage thresholds without changing Kimi config', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      updateKimiUsagePreferences: vi.fn(async (preferences) => ({ ...usage, preferences }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.findAll('.settings-nav button')[5]!.trigger('click')
    const thresholds = wrapper.findAll('.preference-row input[type="number"]')
    expect(thresholds).toHaveLength(3)
    await thresholds[1]!.setValue('75')
    await flushPromises()
    expect(api.updateKimiUsagePreferences).toHaveBeenCalledWith({
      infoThreshold: 0.5,
      warningThreshold: 0.75,
      criticalThreshold: 0.95,
      systemNotifications: true
    })
    expect(wrapper.text()).toContain('用量阈值已保存在本机')
    wrapper.unmount()
  })

  it('keeps Language, turn notifications, and notification sound as local product preferences', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      updateKimiUsagePreferences: vi.fn(async (preferences) => ({ ...usage, preferences }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.findAll('.settings-nav button')[5]!.trigger('click')
    const notificationToggles = wrapper.findAll('.preference-row input[type="checkbox"]')
    await notificationToggles[1]!.setValue(false)
    await notificationToggles[2]!.setValue(false)
    await wrapper.findAll('.settings-nav button')[7]!.trigger('click')
    await wrapper.get('.preference-row select').setValue('en-US')
    await flushPromises()

    expect(api.updateKimiUsagePreferences).toHaveBeenCalledWith(expect.objectContaining({ turnNotifications: false }))
    expect(api.updateKimiUsagePreferences).toHaveBeenCalledWith(expect.objectContaining({ notificationSound: false }))
    expect(api.updateKimiUsagePreferences).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en-US' }))
    wrapper.unmount()
  })

  it('lists and restores Kimi archived sessions', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      listArchivedSessions: vi.fn(async () => [{
        id: 'session-archived', title: '已归档任务', updatedAt: '2026-07-24T01:00:00.000Z',
        busy: false, pendingInteraction: 'none' as const, lastTurnReason: 'completed' as const,
        lastPrompt: '完成归档测试'
      }]),
      restoreSession: vi.fn(async () => ({ sessionId: 'session-archived', workspaceId: 'workspace-1' }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.findAll('.settings-nav button')[6]!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.archive-session-list').text()).toContain('已归档任务')
    await wrapper.get('.archive-session-row button').trigger('click')
    await flushPromises()

    expect(api.restoreSession).toHaveBeenCalledWith('session-archived')
    expect(wrapper.emitted('sessionRestored')).toEqual([['session-archived']])
    expect(wrapper.text()).toContain('当前没有已归档任务')
    wrapper.unmount()
  })
})
