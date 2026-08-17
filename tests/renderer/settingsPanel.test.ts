// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiAgentDesktopApi, KimiSettingsSnapshot, KimiUsageState } from '../../src/shared/contracts.js'
import SettingsPanel from '../../src/renderer/src/components/SettingsPanel.vue'

const snapshot: KimiSettingsSnapshot = {
  auth: {
    ready: true,
    providersCount: 2,
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
  secondaryModelOptions: [
    {
      id: 'kimi-for-coding', providerId: 'managed:kimi-code', displayName: 'Kimi for Coding',
      maxContextSize: 262_144, capabilities: [], supportEfforts: ['off', 'high'], defaultEffort: 'high'
    },
    {
      id: 'kimi-fast', providerId: 'managed:kimi-code', displayName: 'Kimi Fast',
      maxContextSize: 131_072, capabilities: [], supportEfforts: [], defaultEffort: null
    },
    {
      id: 'gpt-5-mini', providerId: 'openai-main', displayName: 'GPT-5 mini',
      maxContextSize: 400_000, capabilities: ['thinking'], supportEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium'
    }
  ],
  providers: [
    {
      id: 'managed:kimi-code', type: 'kimi', baseUrl: null, defaultModel: null,
      hasCredential: false, status: 'unconfigured', models: ['kimi-for-coding', 'kimi-fast']
    },
    {
      id: 'openai-main', type: 'openai_responses', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-5-mini',
      hasCredential: true, status: 'connected', models: ['gpt-5-mini']
    }
  ],
  preferences: {
    defaultProvider: 'managed:kimi-code',
    defaultModel: 'kimi-for-coding',
    defaultPermissionMode: 'manual',
    defaultPlanMode: true,
    mergeAllAvailableSkills: true,
    telemetry: false,
    thinkingEffort: null
  },
  secondaryModel: { model: 'kimi-fast', defaultEffort: 'low', maxOutputSize: 8192 },
  secondaryModelControl: {
    preference: { mode: 'inherit', model: null, defaultEffort: null },
    appliedPreference: { mode: 'inherit', model: null, defaultEffort: null },
    appliedSource: null,
    requiresRestart: false,
    configurationMode: 'read-only'
  },
  capabilities: {
    canAddProvider: true,
    canEditProvider: false,
    canDeleteProvider: false,
    providerManagementUnavailableReason: 'Kimi v2 has no provider management routes.',
    providerDeleteUnavailableReason: 'Kimi v2 has no delete route.',
    secondaryModel: {
      supported: true,
      enabled: true,
      writable: false,
      canDisable: false,
      maxOutputSizeWritable: false,
      unavailableReason: 'Kimi 0.29.2 Config API does not accept secondary_model yet.'
    }
  }
}

const usage: KimiUsageState = {
  phase: 'ready', summary: null, limits: [], extraUsage: null,
  updatedAt: null, nextRefreshAt: null, refreshing: false, source: 'kimi-oauth-usage', error: null,
  preferences: { infoThreshold: 0.5, warningThreshold: 0.8, criticalThreshold: 0.95, systemNotifications: true }
}

afterEach(() => {
  delete window.kimiAgent
  Reflect.deleteProperty(window, 'confirm')
  vi.restoreAllMocks()
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
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.findAll('.model-view-switch button')[0]!.trigger('click')
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
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.findAll('.model-view-switch button')[0]!.trigger('click')
    const modelRows = wrapper.findAll('.model-row')
    expect(modelRows).toHaveLength(2)
    await modelRows[1]!.trigger('click')
    await flushPromises()

    expect(api.setDefaultModel).toHaveBeenCalledWith('kimi-fast')
    expect(wrapper.findAll('.model-row')[1]!.classes()).toContain('is-selected')
    wrapper.unmount()
  })

  it('saves a default thinking effort for the primary model', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      updateKimiPreferences: vi.fn(async () => ({ ...snapshot.preferences, thinkingEffort: 'high' }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.findAll('.model-view-switch button')[0]!.trigger('click')

    const thinkingRow = wrapper.get('.primary-thinking-row')
    const select = thinkingRow.get('select')
    const optionValues = select.findAll('option').map((option) => option.attributes('value'))
    expect(optionValues).toEqual(['', 'high'])
    expect((select.element as HTMLSelectElement).value).toBe('')
    await select.setValue('high')
    await flushPromises()

    expect(api.updateKimiPreferences).toHaveBeenCalledWith({ thinkingEffort: 'high' })
    expect((thinkingRow.get('select').element as HTMLSelectElement).value).toBe('high')
    wrapper.unmount()
  })

  it('keeps the sub Agent model unselected while following the primary model', async () => {
    const followingSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      secondaryModel: { model: null, defaultEffort: null, maxOutputSize: null },
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const configured: KimiSettingsSnapshot = {
      ...followingSnapshot,
      secondaryModel: { model: 'gpt-5-mini', defaultEffort: null, maxOutputSize: null }
    }
    const api = {
      getKimiSettings: vi.fn(async () => followingSnapshot),
      setSecondaryModel: vi.fn(async () => configured)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')

    expect(wrapper.text()).toContain('跟随主模型')
    expect(wrapper.get('.secondary-settings-selection strong').text()).toBe('跟随主模型')
    expect(wrapper.find('.provider-model-item.is-selected').exists()).toBe(false)
    expect(wrapper.get('.secondary-model-actions .primary-button').attributes('disabled')).toBeDefined()

    const openaiCard = wrapper.findAll('.provider-card').find((card) => card.text().includes('openai-main'))!
    await openaiCard.get('.provider-model-select').trigger('click')
    await openaiCard.get('.provider-model-item').trigger('click')
    expect(wrapper.find('.provider-model-item').exists()).toBe(false)
    expect(openaiCard.get('.provider-model-select').classes()).toContain('has-selection')
    expect(openaiCard.get('.provider-model-select').text()).toContain('GPT-5 mini')
    expect(wrapper.get('.secondary-model-actions .primary-button').attributes('disabled')).toBeUndefined()
    await wrapper.get('.secondary-model-actions .primary-button').trigger('click')
    await flushPromises()

    expect(api.setSecondaryModel).toHaveBeenCalledWith({ model: 'gpt-5-mini', defaultEffort: 'medium' })
    wrapper.unmount()
  })

  it('shows the effective secondary model without offering a fake write path', async () => {
    window.kimiAgent = {
      getKimiSettings: vi.fn(async () => snapshot)
    } as unknown as KimiAgentDesktopApi
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true,
        runtimeRunning: true,
        activeSessionId: 'session-1',
        activeWorkspaceId: 'workspace-1',
        usage
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')

    expect(wrapper.text()).toContain('子 Agent 模型')
    expect(wrapper.text()).toContain('Kimi Fast')
    expect(wrapper.text()).toContain('独立模型已启用')
    expect(wrapper.text()).toContain('Config API does not accept secondary_model yet')
    expect(wrapper.findAll('.provider-model-select')).toHaveLength(2)
    expect((wrapper.get('.provider-model-select').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.findAll('.provider-model-item')).toHaveLength(0)
    wrapper.unmount()
  })

  it('shows when the effective secondary value comes from an inherited environment override', async () => {
    const environmentSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      secondaryModelControl: {
        preference: { mode: 'inherit', model: null, defaultEffort: null },
        appliedPreference: { mode: 'inherit', model: null, defaultEffort: null },
        appliedSource: 'inherited-environment',
        requiresRestart: false,
        configurationMode: 'runtime-env'
      },
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          supported: true,
          enabled: true,
          writable: true,
          canDisable: true,
          maxOutputSizeWritable: false,
          unavailableReason: null
        }
      }
    }
    window.kimiAgent = {
      getKimiSettings: vi.fn(async () => environmentSnapshot)
    } as unknown as KimiAgentDesktopApi
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')

    expect(wrapper.text()).toContain('外部环境变量覆盖')
    wrapper.unmount()
  })

  it('uses the typed secondary write API when the Runtime contract declares support', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          supported: true,
          enabled: true,
          writable: true,
          canDisable: false,
          maxOutputSizeWritable: true,
          unavailableReason: null
        }
      }
    }
    const updated = {
      ...writableSnapshot,
      secondaryModel: { model: 'kimi-fast', defaultEffort: 'low', maxOutputSize: 4096 }
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot),
      setSecondaryModel: vi.fn(async () => updated)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true,
        runtimeRunning: true,
        activeSessionId: 'session-1',
        activeWorkspaceId: 'workspace-1',
        usage
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.find('.secondary-model-form input[type="number"]').setValue('4096')
    const saveButton = wrapper.find('.secondary-model-actions .primary-button')
    expect(saveButton.attributes('disabled')).toBeUndefined()
    await saveButton.trigger('click')
    await flushPromises()
    expect(api.setSecondaryModel).toHaveBeenCalledWith({
      model: 'kimi-fast', defaultEffort: 'low', maxOutputSize: 4096
    })
    expect((wrapper.get('.secondary-model-form input[type="number"]').element as HTMLInputElement).value).toBe('4096')
    expect(wrapper.text()).toContain('子 Agent 模型已更新')
    wrapper.unmount()
  })

  it('saves, disables, and restarts a Moon Code-owned 0.29.2 Runtime through local controls', async () => {
    const localSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      secondaryModelControl: {
        preference: { mode: 'inherit', model: null, defaultEffort: null },
        appliedPreference: { mode: 'inherit', model: null, defaultEffort: null },
        appliedSource: 'kimi-config',
        requiresRestart: false,
        configurationMode: 'runtime-env'
      },
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          supported: true,
          enabled: true,
          writable: true,
          canDisable: true,
          maxOutputSizeWritable: false,
          unavailableReason: null
        }
      }
    }
    const configured: KimiSettingsSnapshot = {
      ...localSnapshot,
      secondaryModelControl: {
        ...localSnapshot.secondaryModelControl,
        preference: { mode: 'configured', model: 'kimi-fast', defaultEffort: 'low' },
        requiresRestart: true
      }
    }
    const disabled: KimiSettingsSnapshot = {
      ...configured,
      secondaryModelControl: {
        ...configured.secondaryModelControl,
        preference: { mode: 'disabled', model: null, defaultEffort: null }
      }
    }
    const appliedDisabled: KimiSettingsSnapshot = {
      ...disabled,
      secondaryModelControl: {
        ...disabled.secondaryModelControl,
        appliedPreference: { mode: 'disabled', model: null, defaultEffort: null },
        appliedSource: 'disabled',
        requiresRestart: false
      },
      capabilities: {
        ...disabled.capabilities,
        secondaryModel: { ...disabled.capabilities.secondaryModel, enabled: false }
      }
    }
    const api = {
      getKimiSettings: vi.fn()
        .mockResolvedValueOnce(localSnapshot)
        .mockResolvedValueOnce(appliedDisabled),
      setSecondaryModel: vi.fn(async () => configured),
      disableSecondaryModel: vi.fn(async () => disabled),
      inheritSecondaryModel: vi.fn(async () => localSnapshot),
      restartRuntime: vi.fn(async () => ({
        status: 'running' as const, mode: 'system' as const, version: '0.29.2', serverId: 'server-2',
        origin: 'http://127.0.0.1:58627', error: null
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const confirm = vi.fn(() => true)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm })
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')

    expect(wrapper.find('.secondary-model-form input[type="number"]').exists()).toBe(false)
    await wrapper.find('.secondary-model-actions .primary-button').trigger('click')
    await flushPromises()
    expect(api.setSecondaryModel).toHaveBeenCalledWith({ model: 'kimi-fast', defaultEffort: 'low' })
    expect(wrapper.text()).toContain('等待重启生效')

    const disableButton = wrapper.findAll('.secondary-settings-selection .secondary-button')
      .find((button) => button.text().includes('跟随主模型'))
    expect(disableButton).toBeDefined()
    await disableButton!.trigger('click')
    await flushPromises()
    expect(api.disableSecondaryModel).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('子 Agent 将跟随主模型')

    const restartButton = wrapper.findAll('button').find((button) => button.text().includes('立即重启'))
    expect(restartButton).toBeDefined()
    await restartButton!.trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(api.restartRuntime).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('已禁用')
    expect(wrapper.text()).not.toContain('等待重启生效')
    wrapper.unmount()
  })

  it('switches back to following the primary model from the model list row', async () => {
    const configuredSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      secondaryModelControl: {
        preference: { mode: 'configured', model: 'kimi-fast', defaultEffort: 'low' },
        appliedPreference: { mode: 'configured', model: 'kimi-fast', defaultEffort: 'low' },
        appliedSource: 'moon-code-environment',
        requiresRestart: false,
        configurationMode: 'runtime-env'
      },
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          supported: true,
          enabled: true,
          writable: true,
          canDisable: true,
          maxOutputSizeWritable: false,
          unavailableReason: null
        }
      }
    }
    const disabled: KimiSettingsSnapshot = {
      ...configuredSnapshot,
      secondaryModel: { model: null, defaultEffort: null, maxOutputSize: null },
      secondaryModelControl: {
        ...configuredSnapshot.secondaryModelControl,
        preference: { mode: 'disabled', model: null, defaultEffort: null }
      }
    }
    const api = {
      getKimiSettings: vi.fn(async () => configuredSnapshot),
      disableSecondaryModel: vi.fn(async () => disabled)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')

    /* 已配置独立模型时，“跟随主模型”按钮未选中，当前模型行选中；点击跟随按钮后直接切回 */
    const kimiCard = wrapper.findAll('.provider-card').find((card) => card.text().includes('Kimi'))!
    await kimiCard.get('.provider-model-select').trigger('click')
    expect(wrapper.get('.provider-model-item.is-selected').text()).toContain('Kimi Fast')
    await wrapper.get('.secondary-settings-selection .secondary-button').trigger('click')
    await flushPromises()

    expect(api.disableSecondaryModel).toHaveBeenCalledOnce()
    expect(wrapper.get('.secondary-settings-selection strong').text()).toBe('跟随主模型')
    expect(wrapper.find('.provider-model-item.is-selected').exists()).toBe(false)
    wrapper.unmount()
  })

  it('lets the user remove a Moon Code override and return to Kimi configuration', async () => {
    const configured: KimiSettingsSnapshot = {
      ...snapshot,
      secondaryModelControl: {
        preference: { mode: 'configured', model: 'kimi-fast', defaultEffort: 'low' },
        appliedPreference: { mode: 'configured', model: 'kimi-fast', defaultEffort: 'low' },
        appliedSource: 'moon-code-environment',
        requiresRestart: false,
        configurationMode: 'runtime-env'
      },
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          supported: true,
          enabled: true,
          writable: true,
          canDisable: true,
          maxOutputSizeWritable: false,
          unavailableReason: null
        }
      }
    }
    const inherited: KimiSettingsSnapshot = {
      ...configured,
      secondaryModelControl: {
        ...configured.secondaryModelControl,
        preference: { mode: 'inherit', model: null, defaultEffort: null },
        requiresRestart: true
      }
    }
    const api = {
      getKimiSettings: vi.fn(async () => configured),
      inheritSecondaryModel: vi.fn(async () => inherited)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')

    await wrapper.get('.secondary-runtime-details summary').trigger('click')
    const inheritButton = wrapper.findAll('.secondary-runtime-details .provider-disclosure-button')
      .find((button) => button.text().includes('恢复 Kimi 原有设置'))
    expect(inheritButton).toBeDefined()
    await inheritButton!.trigger('click')
    await flushPromises()

    expect(api.inheritSecondaryModel).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('已恢复 Kimi 原有设置；重启 Kimi Runtime 后生效。')
    wrapper.unmount()
  })

  it('offers every configured provider’s models as primary model choices', async () => {
    const multiProviderSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      models: [
        ...snapshot.models,
        {
          id: 'company/glm-5.3', providerId: 'company', displayName: 'GLM 5.3',
          maxContextSize: 131_072, capabilities: [], supportEfforts: [], defaultEffort: null
        }
      ],
      providers: [
        ...snapshot.providers,
        {
          id: 'company', type: 'openai', baseUrl: 'https://llm.example.com/v1', defaultModel: 'company/glm-5.3',
          hasCredential: true, status: 'connected', models: ['company/glm-5.3']
        }
      ]
    }
    const api = {
      getKimiSettings: vi.fn(async () => multiProviderSnapshot),
      setDefaultModel: vi.fn(async () => multiProviderSnapshot)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.get('.model-view-switch button:first-child').trigger('click')

    // 官方 set_default 不接受供应商限制：自定义供应商的模型也列在主模型候选中。
    const customRow = wrapper.findAll('.primary-model-grid .model-row')
      .find((row) => row.text().includes('company/glm-5.3'))
    expect(customRow).toBeDefined()
    await customRow!.trigger('click')
    await flushPromises()
    expect(api.setDefaultModel).toHaveBeenCalledWith('company/glm-5.3')
    wrapper.unmount()
  })

  it('hides write controls for a read-only Runtime', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    expect(wrapper.findAll('.settings-tab').map((button) => button.text())).not.toContain('Provider')
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    expect(wrapper.findAll('.provider-card')).toHaveLength(2)
    expect(wrapper.find('.secondary-model-form').exists()).toBe(false)
    expect(wrapper.text()).toContain('新子 Agent 将使用')
    expect(wrapper.text()).toContain('子 Agent 模型')
    wrapper.unmount()
  })

  it('connects a third-party Provider through typed IPC and selects its refreshed model', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const connected: KimiSettingsSnapshot = {
      ...writableSnapshot,
      auth: { ...writableSnapshot.auth, providersCount: 3 },
      secondaryModelOptions: [
        ...writableSnapshot.secondaryModelOptions,
        {
          id: 'claude-sonnet-4-5', providerId: 'anthropic-main', displayName: 'Claude Sonnet 4.5',
          maxContextSize: 200_000, capabilities: ['thinking'], supportEfforts: ['low', 'high'], defaultEffort: 'high'
        }
      ],
      providers: [
        ...writableSnapshot.providers,
        {
          id: 'anthropic-main', type: 'anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: null,
          hasCredential: true, status: 'connected', models: ['claude-sonnet-4-5']
        }
      ]
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot),
      addKimiProvider: vi.fn(async () => connected)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    const addButton = wrapper.findAll('.provider-add-card')
      .find((button) => button.text().includes('添加模型服务'))
    expect(addButton).toBeDefined()
    await addButton!.trigger('click')
    await flushPromises()

    // The catalog is not mocked, so the picker degrades to manual mode.
    expect(wrapper.get('.provider-picker-trigger').text()).toContain('手动配置')
    const form = wrapper.get('.secondary-provider-form')
    await form.get('input[placeholder="例如 openai-main"]').setValue('anthropic-main')
    await form.get('select').setValue('anthropic')
    await form.get('input[type="url"]').setValue('https://api.anthropic.com')
    await form.get('input[type="password"]').setValue('sk-ant-secret')
    // 目录外的自定义服务必须至少填写一个模型（别名与上下文 Token），提交按钮在此之前保持禁用。
    // 注意：重渲染可能替换表单元素，断言前重新查询。
    const submitDisabled = () =>
      (wrapper.get('.secondary-provider-form').get('.provider-form-actions .primary-button')
        .element as HTMLButtonElement).disabled
    expect(submitDisabled()).toBe(true)
    await form.get('input[placeholder="例如 glm-5.3"]').setValue('claude-sonnet-4-5')
    await form.get('input[placeholder="例如 131072"]').setValue('200000')
    expect(submitDisabled()).toBe(false)
    await wrapper.get('.secondary-provider-form').trigger('submit')
    await flushPromises()

    expect(api.addKimiProvider).toHaveBeenCalledWith({
      id: 'anthropic-main',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-secret',
      defaultModel: 'claude-sonnet-4-5',
      models: [{ model: 'claude-sonnet-4-5', maxContextSize: 200_000 }]
    })
    expect(wrapper.find('.secondary-provider-form').exists()).toBe(false)
    const anthropicCard = wrapper.findAll('.provider-card').find((card) => card.text().includes('anthropic-main'))!
    await anthropicCard.get('.provider-model-select').trigger('click')
    await anthropicCard.get('.provider-model-item').trigger('click')
    expect(anthropicCard.get('.provider-model-select').text()).toContain('Claude Sonnet 4.5')
    expect(anthropicCard.get('.provider-model-select').classes()).toContain('has-selection')
    expect(wrapper.text()).toContain('anthropic-main 已连接并读取到 1 个模型')
    wrapper.unmount()
  })

  it('adds a Provider from the Kimi catalog directory with auto-filled fields', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const catalogSummary = {
      id: 'opencode-go', name: 'OpenCode Go', wireType: 'openai', needsBaseUrl: false,
      envKey: 'OPENCODE_API_KEY', modelCount: 2, rejected: false, rejectReason: null
    }
    const catalogDetail = {
      ...catalogSummary,
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', maxContextSize: 1_000_000, capabilities: ['thinking'], reasoning: true },
        { id: 'kimi-k3', name: 'Kimi K3', maxContextSize: 1_048_576, capabilities: ['tool_use'], reasoning: true }
      ]
    }
    const connected: KimiSettingsSnapshot = {
      ...writableSnapshot,
      auth: { ...writableSnapshot.auth, providersCount: 3 },
      providers: [
        ...writableSnapshot.providers,
        {
          id: 'opencode-go', type: 'openai', baseUrl: null, defaultModel: 'opencode-go/deepseek-v4-flash',
          hasCredential: true, status: 'connected', models: ['opencode-go/deepseek-v4-flash']
        }
      ]
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot),
      listKimiCatalogProviders: vi.fn(async () => [catalogSummary]),
      getKimiCatalogProvider: vi.fn(async () => catalogDetail),
      addKimiProvider: vi.fn(async () => connected)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    const addButton = wrapper.findAll('.provider-add-card')
      .find((button) => button.text().includes('添加模型服务'))
    await addButton!.trigger('click')
    await flushPromises()

    // The picker is the primary field: open it and pick the directory entry.
    expect(api.listKimiCatalogProviders).toHaveBeenCalledOnce()
    expect(wrapper.get('.provider-picker-trigger').text()).toContain('选择供应商…')
    await wrapper.get('.provider-picker-trigger').trigger('click')
    const pickerItem = wrapper.get('.provider-picker-option')
    expect(pickerItem.text()).toContain('OpenCode Go')
    await pickerItem.trigger('click')
    await flushPromises()

    // Selecting the entry auto-fills id/type and hides Base URL when not needed.
    expect(api.getKimiCatalogProvider).toHaveBeenCalledWith('opencode-go')
    const form = wrapper.get('.secondary-provider-form')
    expect((form.get('.provider-form-grid input').element as HTMLInputElement).value).toBe('opencode-go')
    expect((form.get('select').element as HTMLSelectElement).value).toBe('openai')
    expect(form.text()).not.toContain('API Base URL')
    expect(form.get('input[type="password"]').attributes('placeholder')).toBe('对应 OPENCODE_API_KEY 的 API Key')

    // The default model select is required before submitting.
    const submit = form.get('.provider-form-actions .primary-button')
    expect((submit.element as HTMLButtonElement).disabled).toBe(true)
    await form.get('label.provider-form-wide select').setValue('deepseek-v4-flash')
    await form.get('input[type="password"]').setValue('sk-opencode-secret')
    await form.trigger('submit')
    await flushPromises()

    expect(api.addKimiProvider).toHaveBeenCalledWith({
      id: 'opencode-go',
      type: 'openai',
      apiKey: 'sk-opencode-secret',
      defaultModel: 'deepseek-v4-flash'
    })
    expect(wrapper.find('.secondary-provider-form').exists()).toBe(false)
    wrapper.unmount()
  })

  it('falls back to the manual provider form when the catalog is unavailable', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot),
      listKimiCatalogProviders: vi.fn(async () => { throw new Error('catalog unavailable') }),
      addKimiProvider: vi.fn(async () => writableSnapshot)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    const addButton = wrapper.findAll('.provider-add-card')
      .find((button) => button.text().includes('添加模型服务'))
    await addButton!.trigger('click')
    await flushPromises()

    // The form degrades to manual mode and still exposes the full manual fields.
    expect(wrapper.get('.provider-picker-trigger').text()).toContain('手动配置')
    const form = wrapper.get('.secondary-provider-form')
    expect(form.text()).toContain('API Base URL')
    await form.get('input[placeholder="例如 openai-main"]').setValue('private-manual')
    await form.get('input[type="url"]').setValue('https://private.example.com/v1')
    // 目录不可用时无法自动补全模型元数据，至少一个完整模型行变为必填。
    // 注意：重渲染可能替换表单元素，断言前重新查询。
    const freshForm = () => wrapper.get('.secondary-provider-form')
    const submitDisabled = () =>
      (freshForm().get('.provider-form-actions .primary-button').element as HTMLButtonElement).disabled
    expect(freshForm().text()).toContain('需至少填写一个模型')
    expect(submitDisabled()).toBe(true)
    await form.get('input[placeholder="例如 glm-5.3"]').setValue('private-coder')
    await form.get('input[placeholder="例如 131072"]').setValue('131072')
    expect(submitDisabled()).toBe(false)
    await freshForm().trigger('submit')
    await flushPromises()
    expect(api.addKimiProvider).toHaveBeenCalledWith(expect.objectContaining({
      id: 'private-manual', type: 'openai',
      baseUrl: 'https://private.example.com/v1',
      defaultModel: 'private-coder',
      models: [{ model: 'private-coder', maxContextSize: 131_072 }]
    }))
    wrapper.unmount()
  })

  it('keeps manual model fields optional when the Base URL domain hits the Kimi catalog', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const catalogSummary = {
      id: 'deepseek', name: 'DeepSeek', wireType: 'openai', needsBaseUrl: false,
      envKey: 'DEEPSEEK_API_KEY', modelCount: 2, rejected: false, rejectReason: null
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot),
      listKimiCatalogProviders: vi.fn(async () => [catalogSummary]),
      addKimiProvider: vi.fn(async () => writableSnapshot)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    const addButton = wrapper.findAll('.provider-add-card')
      .find((button) => button.text().includes('添加模型服务'))
    await addButton!.trigger('click')
    await flushPromises()

    await wrapper.get('.provider-picker-trigger').trigger('click')
    await flushPromises()
    await wrapper.get('.provider-picker-manual').trigger('click')
    await flushPromises()
    // 用语义选择器填表：picker 打开时搜索框会占据 inputs[0]，下标不可靠。
    const form = wrapper.get('.secondary-provider-form')
    await form.get('input[placeholder="例如 openai-main"]').setValue('my-deepseek')
    await form.get('select').setValue('openai')
    await form.get('input[type="url"]').setValue('https://api.deepseek.com/v1')
    await form.get('input[type="password"]').setValue('sk-deepseek-secret')
    await flushPromises()

    // api.deepseek.com 命中目录中的 deepseek，模型元数据由主进程自动补全，无需手填。
    // 注意：重渲染可能替换表单元素，断言前重新查询。
    const freshForm = () => wrapper.get('.secondary-provider-form')
    expect(freshForm().text()).not.toContain('需至少填写一个模型')
    const submit = freshForm().get('.provider-form-actions .primary-button')
    expect((submit.element as HTMLButtonElement).disabled).toBe(false)
    await freshForm().trigger('submit')
    await flushPromises()
    expect(api.addKimiProvider).toHaveBeenCalledWith({
      id: 'my-deepseek',
      type: 'openai',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-deepseek-secret'
    })
    wrapper.unmount()
  })

  it('adds a Provider with a typed context size (number-cast input) and submits it as a number', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const connected: KimiSettingsSnapshot = {
      ...writableSnapshot,
      auth: { ...writableSnapshot.auth, providersCount: 3 },
      providers: [
        ...writableSnapshot.providers,
        {
          id: 'opencode-go', type: 'openai', baseUrl: 'https://opencode.example.com/v1', defaultModel: 'opencode-go/latest',
          hasCredential: true, status: 'connected', models: ['opencode-go/latest']
        }
      ]
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot),
      addKimiProvider: vi.fn(async () => connected)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    const addButton = wrapper.findAll('.provider-add-card')
      .find((button) => button.text().includes('添加模型服务'))
    await addButton!.trigger('click')
    await flushPromises()

    // The catalog is not mocked, so the form degrades to manual mode.
    const form = wrapper.get('.secondary-provider-form')
    await form.get('input[placeholder="例如 openai-main"]').setValue('opencode-go')
    await form.get('select').setValue('openai')
    await form.get('input[type="url"]').setValue('https://opencode.example.com/v1')
    await form.get('input[type="password"]').setValue('sk-opencode-secret')
    await form.get('input[placeholder="例如 glm-5.3"]').setValue('latest')
    await form.get('input[placeholder="例如 131072"]').setValue('200000')
    await form.trigger('submit')
    await flushPromises()

    expect(api.addKimiProvider).toHaveBeenCalledWith({
      id: 'opencode-go',
      type: 'openai',
      baseUrl: 'https://opencode.example.com/v1',
      apiKey: 'sk-opencode-secret',
      defaultModel: 'latest',
      models: [{ model: 'latest', maxContextSize: 200_000 }]
    })
    expect(wrapper.find('.secondary-provider-form').exists()).toBe(false)
    wrapper.unmount()
  })

  it('edits and deletes a custom Provider from the model service detail', async () => {
    const managementSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        canEditProvider: true,
        canDeleteProvider: true,
        providerManagementUnavailableReason: null,
        providerDeleteUnavailableReason: null
      }
    }
    const renamed: KimiSettingsSnapshot = {
      ...managementSnapshot,
      providers: managementSnapshot.providers.map((provider) => provider.id === 'openai-main'
        ? { ...provider, id: 'openai-work' }
        : provider),
      secondaryModelOptions: managementSnapshot.secondaryModelOptions.map((model) => model.providerId === 'openai-main'
        ? { ...model, providerId: 'openai-work' }
        : model)
    }
    const afterDelete: KimiSettingsSnapshot = {
      ...renamed,
      providers: renamed.providers.filter((provider) => provider.id !== 'openai-work'),
      secondaryModelOptions: renamed.secondaryModelOptions.filter((model) => model.providerId !== 'openai-work')
    }
    const api = {
      getKimiSettings: vi.fn(async () => managementSnapshot),
      updateKimiProvider: vi.fn(async () => renamed),
      deleteKimiProvider: vi.fn(async () => afterDelete)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const confirm = vi.fn(() => true)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm })
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')

    await wrapper.get('.provider-icon-button[aria-label="编辑 openai-main"]').trigger('click')
    const form = wrapper.get('.secondary-provider-form')
    await form.find('input').setValue('openai-work')
    await form.trigger('submit')
    await flushPromises()

    expect(api.updateKimiProvider).toHaveBeenCalledWith(expect.objectContaining({
      id: 'openai-main', newId: 'openai-work', type: 'openai_responses'
    }))
    expect(wrapper.text()).toContain('openai-work 的模型服务设置已保存')

    await wrapper.get('.provider-icon-button[aria-label="删除 openai-work"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(api.deleteKimiProvider).toHaveBeenCalledWith('openai-work')
    expect(wrapper.text()).toContain('模型服务 openai-work 已删除')
    wrapper.unmount()
  })

  it('adds a custom Provider with multiple models in one save', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot),
      addKimiProvider: vi.fn(async () => writableSnapshot)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.get('.provider-add-card').trigger('click')
    await flushPromises()

    const form = wrapper.get('.secondary-provider-form')
    await form.get('input[placeholder="例如 openai-main"]').setValue('company-gateway')
    await form.get('input[type="url"]').setValue('https://llm.example.com/v1')
    await form.get('input[type="password"]').setValue('gw-key')

    // 一次添加多个模型：再加一行，默认模型选择第二个。
    // 注意：重渲染会替换表单元素，每次操作后重新查询。
    await form.get('.provider-model-add').trigger('click')
    await flushPromises()
    const rows = wrapper.get('.secondary-provider-form').findAll('.provider-model-row')
    expect(rows).toHaveLength(2)
    await rows[0]!.get('input[placeholder="例如 glm-5.3"]').setValue('glm-5.3')
    await rows[0]!.get('input[placeholder="例如 131072"]').setValue('131072')
    await rows[1]!.get('input[placeholder="例如 glm-5.3"]').setValue('deepseek-v4-pro')
    await rows[1]!.get('input[placeholder="例如 131072"]').setValue('202752')
    await rows[1]!.get('input[placeholder="可选"]').setValue('DeepSeek V4 Pro')
    await flushPromises()
    await wrapper.get('.secondary-provider-form').get('label.provider-form-wide select').setValue('deepseek-v4-pro')
    await wrapper.get('.secondary-provider-form').trigger('submit')
    await flushPromises()

    expect(api.addKimiProvider).toHaveBeenCalledWith({
      id: 'company-gateway',
      type: 'openai',
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'gw-key',
      defaultModel: 'deepseek-v4-pro',
      models: [
        { model: 'glm-5.3', maxContextSize: 131_072 },
        { model: 'deepseek-v4-pro', maxContextSize: 202_752, displayName: 'DeepSeek V4 Pro' }
      ]
    })
    wrapper.unmount()
  })

  it('removes a single model from a Provider in the editor', async () => {
    const twoModelSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      secondaryModelOptions: [
        ...snapshot.secondaryModelOptions,
        {
          id: 'company/glm-5.3', providerId: 'company', displayName: 'GLM 5.3',
          maxContextSize: 131_072, capabilities: ['thinking'], supportEfforts: [], defaultEffort: null
        },
        {
          id: 'company/deepseek-v4-pro', providerId: 'company', displayName: 'DeepSeek V4 Pro',
          maxContextSize: 202_752, capabilities: ['thinking', 'tool_use'], supportEfforts: ['low'], defaultEffort: null
        }
      ],
      providers: [
        ...snapshot.providers,
        {
          id: 'company', type: 'openai', baseUrl: 'https://llm.example.com/v1', defaultModel: 'company/glm-5.3',
          hasCredential: true, status: 'connected', models: ['company/glm-5.3', 'company/deepseek-v4-pro']
        }
      ],
      capabilities: {
        ...snapshot.capabilities,
        canEditProvider: true,
        canDeleteProvider: true,
        providerManagementUnavailableReason: null,
        providerDeleteUnavailableReason: null
      }
    }
    const api = {
      getKimiSettings: vi.fn(async () => twoModelSnapshot),
      updateKimiProvider: vi.fn(async () => twoModelSnapshot)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.get('.provider-icon-button[aria-label="编辑 company"]').trigger('click')

    // 编辑时用当前模型初始化表格；删除 deepseek-v4-pro 行后保存。
    const form = wrapper.get('.secondary-provider-form')
    const rows = form.findAll('.provider-model-row')
    expect(rows).toHaveLength(2)
    expect((rows[0]!.get('input[placeholder="例如 glm-5.3"]').element as HTMLInputElement).value).toBe('glm-5.3')
    await rows[1]!.get('button[title="移除该模型"]').trigger('click')
    await flushPromises()
    await wrapper.get('.secondary-provider-form').trigger('submit')
    await flushPromises()

    expect(api.updateKimiProvider).toHaveBeenCalledWith(expect.objectContaining({
      id: 'company',
      defaultModel: 'glm-5.3',
      models: [
        { model: 'glm-5.3', maxContextSize: 131_072, displayName: 'GLM 5.3', capabilities: ['thinking'] }
      ]
    }))
    const payload = (api.updateKimiProvider as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      models: Array<{ model: string }>
    }
    expect(payload.models).toHaveLength(1)
    wrapper.unmount()
  })

  it('blocks submit when duplicate model aliases are entered', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot),
      addKimiProvider: vi.fn(async () => writableSnapshot)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.get('.provider-add-card').trigger('click')
    await flushPromises()

    const form = wrapper.get('.secondary-provider-form')
    await form.get('input[placeholder="例如 openai-main"]').setValue('company-gateway')
    await form.get('input[type="url"]').setValue('https://llm.example.com/v1')
    await form.get('.provider-model-add').trigger('click')
    await flushPromises()
    const rows = wrapper.get('.secondary-provider-form').findAll('.provider-model-row')
    expect(rows).toHaveLength(2)
    await rows[0]!.get('input[placeholder="例如 glm-5.3"]').setValue('glm-5.3')
    await rows[0]!.get('input[placeholder="例如 131072"]').setValue('131072')
    await rows[1]!.get('input[placeholder="例如 glm-5.3"]').setValue('glm-5.3')
    await rows[1]!.get('input[placeholder="例如 131072"]').setValue('65536')
    await flushPromises()

    const freshForm = () => wrapper.get('.secondary-provider-form')
    expect(freshForm().text()).toContain('模型别名重复')
    const submit = freshForm().get('.provider-form-actions .primary-button')
    expect((submit.element as HTMLButtonElement).disabled).toBe(true)
    expect(api.addKimiProvider).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('submits a zero-model Provider edit using catalog-resolvable DeepSeek metadata', async () => {
    const zeroModelSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      providers: [
        ...snapshot.providers,
        {
          id: 'pixel', type: 'openai', baseUrl: 'https://old.example.com/v1', defaultModel: null,
          hasCredential: true, status: 'error', models: []
        }
      ],
      capabilities: {
        ...snapshot.capabilities,
        canEditProvider: true,
        canDeleteProvider: true,
        providerManagementUnavailableReason: null,
        providerDeleteUnavailableReason: null
      }
    }
    const repaired: KimiSettingsSnapshot = {
      ...zeroModelSnapshot,
      providers: zeroModelSnapshot.providers.map((provider) => provider.id === 'pixel'
        ? {
          ...provider, id: 'deepseek', baseUrl: 'https://api.deepseek.com',
          defaultModel: 'deepseek/deepseek-v4-flash', status: 'connected' as const,
          models: ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro']
        }
        : provider)
    }
    const api = {
      getKimiSettings: vi.fn(async () => zeroModelSnapshot),
      updateKimiProvider: vi.fn(async () => repaired)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.get('.provider-icon-button[aria-label="编辑 pixel"]').trigger('click')

    const form = wrapper.get('.secondary-provider-form')
    await form.get('input[placeholder="例如 openai-main"]').setValue('deepseek')
    await form.get('input[type="url"]').setValue('https://api.deepseek.com')
    // 零模型供应商的修复路径：模型表格整表留空（目录自动补全），默认模型走自由文本。
    await form.get('input[placeholder="留空则自动选择首个模型"]').setValue('deepseek-v4-flash')
    await form.trigger('submit')
    await flushPromises()

    expect(api.updateKimiProvider).toHaveBeenCalledWith({
      id: 'pixel', newId: 'deepseek', type: 'openai',
      baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash'
    })
    expect(wrapper.text()).toContain('deepseek 的模型服务设置已保存')
    wrapper.unmount()
  })

  it('selects a model from another Provider as the sub Agent model', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const selected: KimiSettingsSnapshot = {
      ...writableSnapshot,
      secondaryModelControl: {
        ...writableSnapshot.secondaryModelControl,
        preference: { mode: 'configured', model: 'gpt-5-mini', defaultEffort: 'medium' },
        requiresRestart: true
      }
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot),
      setSecondaryModel: vi.fn(async () => selected)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    const openaiCard = wrapper.findAll('.provider-card').find((card) => card.text().includes('openai-main'))!
    await openaiCard.get('.provider-model-select').trigger('click')
    await openaiCard.get('.provider-model-item').trigger('click')
    await wrapper.get('.secondary-model-actions .primary-button').trigger('click')
    await flushPromises()

    // Switching model keeps the previously applied effort (gpt-5-mini supports 'low').
    expect(api.setSecondaryModel).toHaveBeenCalledWith({ model: 'gpt-5-mini', defaultEffort: 'low' })
    expect(wrapper.text()).toContain('子 Agent 模型已保存')
    wrapper.unmount()
  })

  it('closes the provider editor dialog via its close button, backdrop, and Escape', async () => {
    const writableSnapshot: KimiSettingsSnapshot = {
      ...snapshot,
      capabilities: {
        ...snapshot.capabilities,
        secondaryModel: {
          ...snapshot.capabilities.secondaryModel,
          writable: true,
          canDisable: true,
          unavailableReason: null
        }
      }
    }
    const api = {
      getKimiSettings: vi.fn(async () => writableSnapshot)
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.findAll('.settings-tab')[1]!.trigger('click')
    await wrapper.get('.provider-add-card').trigger('click')
    await flushPromises()

    // Open with the close button; Escape closes the dialog instead of the panel.
    expect(wrapper.find('.provider-editor-dialog').exists()).toBe(true)
    await wrapper.get('.provider-dialog-close').trigger('click')
    await flushPromises()
    expect(wrapper.find('.provider-editor-dialog').exists()).toBe(false)

    await wrapper.get('.provider-add-card').trigger('click')
    await flushPromises()
    await window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('.provider-editor-dialog').exists()).toBe(false)
    expect(wrapper.find('.settings-page').exists()).toBe(true)

    await wrapper.get('.provider-add-card').trigger('click')
    await flushPromises()
    await wrapper.get('.provider-editor-backdrop').trigger('mousedown')
    await flushPromises()
    expect(wrapper.find('.provider-editor-dialog').exists()).toBe(false)
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

    await wrapper.findAll('.settings-tab')[2]!.trigger('click')
    await flushPromises()
    expect(api.listSessionSkills).toHaveBeenCalledWith('session-1')
    expect(wrapper.get('.skill-list').text()).toContain('/review')

    await wrapper.findAll('.settings-tab')[3]!.trigger('click')
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

    await wrapper.findAll('.settings-tab')[2]!.trigger('click')
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

    await wrapper.findAll('.settings-tab')[4]!.trigger('click')
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

    await wrapper.findAll('.settings-tab')[4]!.trigger('click')
    const notificationToggles = wrapper.findAll('.preference-row input[type="checkbox"]')
    await notificationToggles[1]!.setValue(false)
    await notificationToggles[2]!.setValue(false)
    await wrapper.findAll('.settings-tab')[0]!.trigger('click')
    await wrapper.get('.preference-row select').setValue('en-US')
    await flushPromises()

    expect(api.updateKimiUsagePreferences).toHaveBeenCalledWith(expect.objectContaining({ turnNotifications: false }))
    expect(api.updateKimiUsagePreferences).toHaveBeenCalledWith(expect.objectContaining({ notificationSound: false }))
    expect(api.updateKimiUsagePreferences).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en-US' }))
    wrapper.unmount()
  })

  it('keeps the desktop pet disabled by default and toggles it from General settings', async () => {
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
    vi.useFakeTimers()

    await wrapper.findAll('.settings-tab')[0]!.trigger('click')
    const petToggle = wrapper.find('.settings-section input[type="checkbox"]')
    expect((petToggle.element as HTMLInputElement).checked).toBe(false)
    await petToggle.setValue(true)
    await flushPromises()

    expect(api.updateKimiUsagePreferences).toHaveBeenCalledWith(expect.objectContaining({ petEnabled: true }))
    expect(wrapper.text()).toContain('宠物设置已保存在本机')
    expect(wrapper.get('.settings-message').attributes('role')).toBe('status')
    await vi.advanceTimersByTimeAsync(2_800)
    expect(wrapper.text()).not.toContain('宠物设置已保存在本机')
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('checks and downloads a Kimi Code CLI update from General settings', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      checkKimiCliUpdate: vi.fn(async () => ({
        phase: 'available' as const,
        currentVersion: '0.29.0', latestVersion: '0.29.1',
        executable: '/Users/test/.kimi-code/bin/kimi', checkedAt: '2026-07-26T01:00:00.000Z',
        error: null, requiresRestart: false
      })),
      downloadKimiCliUpdate: vi.fn(async () => ({
        phase: 'installed' as const,
        currentVersion: '0.29.1', latestVersion: '0.29.1',
        executable: '/Users/test/.kimi-code/bin/kimi', checkedAt: '2026-07-26T01:01:00.000Z',
        error: null, requiresRestart: true
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: true, activeSessionId: 'session-1', activeWorkspaceId: 'workspace-1', usage },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.findAll('.settings-tab')[0]!.trigger('click')
    await flushPromises()
    expect(api.checkKimiCliUpdate).toHaveBeenCalledOnce()
    expect(wrapper.get('.cli-update-card').text()).toContain('发现 0.29.1，当前版本为 0.29.0')

    await wrapper.get('.cli-update-card .primary-button').trigger('click')
    await flushPromises()
    expect(api.downloadKimiCliUpdate).toHaveBeenCalledOnce()
    expect(wrapper.get('.cli-update-card').text()).toContain('重启 Moon Code 后生效')
    wrapper.unmount()
  })

  it('keeps CLI update checks available when Kimi Runtime is stopped', async () => {
    const api = {
      getKimiSettings: vi.fn(async () => snapshot),
      checkKimiCliUpdate: vi.fn(async () => ({
        phase: 'up-to-date' as const,
        currentVersion: '0.29.1', latestVersion: '0.29.1',
        executable: '/Users/test/.kimi-code/bin/kimi', checkedAt: '2026-07-26T01:00:00.000Z',
        error: null, requiresRestart: false
      }))
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(SettingsPanel, {
      props: { open: true, runtimeRunning: false, activeSessionId: '', activeWorkspaceId: '', usage },
      global: { stubs: { Teleport: true } }
    })

    await wrapper.findAll('.settings-tab')[0]!.trigger('click')
    await flushPromises()
    expect(api.getKimiSettings).not.toHaveBeenCalled()
    expect(api.checkKimiCliUpdate).toHaveBeenCalledOnce()
    expect(wrapper.get('.cli-update-card').text()).toContain('已是最新版本')
    expect(wrapper.text()).toContain('Kimi Runtime 未连接时')
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

    await wrapper.findAll('.settings-tab')[5]!.trigger('click')
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
