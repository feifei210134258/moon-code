import type {
  AddKimiProviderInput,
  KimiAgentDesktopApi,
  KimiPreferencesPatch,
  KimiSettingsSnapshot,
  RuntimePublicState
} from '@shared/contracts'

const runtime: RuntimePublicState = {
  status: 'running',
  mode: 'managed',
  version: '0.29.2',
  serverId: 'settings-fixture',
  origin: 'http://127.0.0.1:1',
  error: null
}

const snapshot: KimiSettingsSnapshot = {
  auth: {
    ready: true,
    providersCount: 2,
    defaultModel: 'kimi-for-coding',
    managedProvider: { name: 'managed:kimi-code', status: 'authenticated' }
  },
  models: [
    {
      id: 'kimi-for-coding', providerId: 'managed:kimi-code', displayName: 'Kimi for Coding',
      maxContextSize: 262_144, capabilities: ['thinking'], supportEfforts: ['off', 'high'], defaultEffort: 'high'
    },
    {
      id: 'kimi-k2.5', providerId: 'managed:kimi-code', displayName: 'Kimi K2.5',
      maxContextSize: 262_144, capabilities: ['thinking', 'vision'], supportEfforts: ['low', 'high'], defaultEffort: 'high'
    }
  ],
  secondaryModelOptions: [
    {
      id: 'kimi-for-coding', providerId: 'managed:kimi-code', displayName: 'Kimi for Coding',
      maxContextSize: 262_144, capabilities: ['thinking'], supportEfforts: ['off', 'high'], defaultEffort: 'high'
    },
    {
      id: 'kimi-k2.5', providerId: 'managed:kimi-code', displayName: 'Kimi K2.5',
      maxContextSize: 262_144, capabilities: ['thinking', 'vision'], supportEfforts: ['low', 'high'], defaultEffort: 'high'
    },
    {
      id: 'gpt-5-mini', providerId: 'openai-main', displayName: 'GPT-5 mini',
      maxContextSize: 400_000, capabilities: ['thinking'], supportEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium'
    }
  ],
  providers: [
    {
      id: 'managed:kimi-code', type: 'kimi', baseUrl: 'https://api.kimi.com/coding/v1',
      defaultModel: 'kimi-for-coding', hasCredential: true, status: 'connected',
      models: ['kimi-for-coding', 'kimi-k2.5']
    },
    {
      id: 'openai-main', type: 'openai_responses', baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5-mini', hasCredential: true, status: 'connected',
      models: ['gpt-5-mini']
    }
  ],
  preferences: {
    defaultProvider: 'managed:kimi-code',
    defaultModel: 'kimi-for-coding',
    defaultPermissionMode: 'manual',
    defaultPlanMode: true,
    mergeAllAvailableSkills: true,
    telemetry: false
  },
  secondaryModel: { model: 'gpt-5-mini', defaultEffort: 'low', maxOutputSize: 8192 },
  secondaryModelControl: {
    preference: { mode: 'inherit', model: null, defaultEffort: null },
    appliedPreference: { mode: 'inherit', model: null, defaultEffort: null },
    appliedSource: 'kimi-config',
    requiresRestart: false,
    configurationMode: 'runtime-env'
  },
  capabilities: {
    canAddProvider: true,
    canEditProvider: true,
    canDeleteProvider: false,
    providerManagementUnavailableReason: null,
    providerDeleteUnavailableReason:
      '当前 Kimi Runtime 没有安全的 Provider 删除 REST 接口；客户端不会绕过 Kimi 直接改配置文件。',
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

export function installSettingsApiFixture(): void {
  const api = {
    getBootstrapState: async () => ({
      appVersion: '0.2.0',
      platform: 'darwin',
      runtime,
      discovery: {
        supportedRange: '>=0.29.2',
        managed: { kind: 'managed', version: '0.29.2', executable: 'kimi', compatible: true, reason: null },
        system: { kind: 'system', version: null, executable: null, compatible: false, reason: 'not found' }
      }
    }),
    getWorkspaceTree: async () => [{
      id: 'workspace-1', name: 'moon-code', root: '/path/to/moon-code',
      sessions: [{
        id: 'session-1', title: '实现 Skills 与 MCP', updatedAt: '2026-07-23T07:00:00.000Z',
        busy: true, pendingInteraction: 'none' as const, lastTurnReason: null, lastPrompt: '继续实现 Kimi parity'
      }]
    }],
    openSession: async () => ({
      sessionId: 'session-1', title: '实现 Skills 与 MCP', busy: true, mainTurnActive: true,
      activePromptId: 'prompt-1', activePromptStatus: 'running' as const, phase: 'ready' as const,
      cursor: { seq: 12, epoch: 'fixture' }, messages: [], pendingApprovals: [], pendingQuestions: [],
      agents: [
        {
          id: 'main', role: 'main' as const, name: 'Kimi', description: '当前会话的主 Agent', status: 'working' as const,
          subagentType: null, parentAgentId: null, parentToolCallId: null, swarmIndex: null,
          runInBackground: false, createdAt: null, startedAt: null, completedAt: null,
          suspendedReason: null, outputPreview: null, usage: null
        },
        {
          id: 'agent-1', role: 'subagent' as const, name: 'explore', description: '核对 MCP 运行时契约', status: 'completed' as const,
          subagentType: 'explore', parentAgentId: 'main', parentToolCallId: 'tool-1', swarmIndex: 0,
          runInBackground: false, createdAt: null, startedAt: null, completedAt: null,
          suspendedReason: null, outputPreview: '已确认 Kimi v2 REST route 与状态映射。',
          usage: { inputTokens: 1200, outputTokens: 230, cacheReadTokens: 480, cacheCreationTokens: 0, contextTokens: 4200 }
        }
      ],
      hasMoreMessages: false, resyncCount: 0, unknownEventCount: 0, error: null
    }),
    listFiles: async () => ({ path: '.', items: [], truncated: false }),
    getGitStatus: async () => ({
      branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
    }),
    getKimiSettings: async () => structuredClone(snapshot),
    checkKimiCliUpdate: async () => ({
      phase: 'available' as const,
      currentVersion: '0.29.2',
      latestVersion: '0.29.3',
      executable: '/path/to/.kimi-code/bin/kimi',
      checkedAt: new Date().toISOString(),
      error: null,
      requiresRestart: false
    }),
    downloadKimiCliUpdate: async () => ({
      phase: 'installed' as const,
      currentVersion: '0.29.3',
      latestVersion: '0.29.3',
      executable: '/path/to/.kimi-code/bin/kimi',
      checkedAt: new Date().toISOString(),
      error: null,
      requiresRestart: true
    }),
    setDefaultModel: async (modelId: string) => {
      snapshot.preferences.defaultModel = modelId
      return structuredClone(snapshot)
    },
    setSecondaryModel: async (input: {
      model: string
      defaultEffort?: string
      maxOutputSize?: number
    }) => {
      snapshot.secondaryModel = {
        model: input.model,
        defaultEffort: input.defaultEffort ?? null,
        maxOutputSize: input.maxOutputSize ?? null
      }
      snapshot.secondaryModelControl.preference = {
        mode: 'configured', model: input.model, defaultEffort: input.defaultEffort ?? null
      }
      snapshot.secondaryModelControl.requiresRestart = true
      return structuredClone(snapshot)
    },
    disableSecondaryModel: async () => {
      snapshot.secondaryModelControl.preference = { mode: 'disabled', model: null, defaultEffort: null }
      snapshot.secondaryModelControl.requiresRestart = true
      return structuredClone(snapshot)
    },
    inheritSecondaryModel: async () => {
      snapshot.secondaryModelControl.preference = { mode: 'inherit', model: null, defaultEffort: null }
      snapshot.secondaryModelControl.requiresRestart = true
      return structuredClone(snapshot)
    },
    updateKimiPreferences: async (patch: KimiPreferencesPatch) => {
      Object.assign(snapshot.preferences, patch)
      return structuredClone(snapshot.preferences)
    },
    addKimiProvider: async (input: AddKimiProviderInput) => {
      snapshot.providers.push({
        id: input.id,
        type: input.type,
        baseUrl: input.baseUrl ?? null,
        defaultModel: input.defaultModel ?? null,
        hasCredential: input.apiKey !== undefined,
        status: 'connected',
        models: []
      })
      snapshot.auth.providersCount = snapshot.providers.length
      return structuredClone(snapshot)
    },
    refreshKimiProviders: async () => ({ changed: [], unchanged: [], failed: [] }),
    startOAuthLogin: async () => ({
      flowId: 'fixture-flow', provider: 'managed:kimi-code', status: 'authenticated' as const,
      verificationUri: null, verificationUriComplete: null, userCode: null,
      expiresIn: null, interval: null, expiresAt: null, resolvedAt: null, errorMessage: null
    }),
    pollOAuthLogin: async () => null,
    cancelOAuthLogin: async () => ({ cancelled: true, status: 'cancelled' as const }),
    logoutOAuth: async () => ({ loggedOut: true as const, provider: 'managed:kimi-code' }),
    listSessionSkills: async () => [
      { name: 'review', description: '审查当前项目并给出可执行建议', source: 'project' as const, type: null, userInvocableOnly: false },
      { name: 'release-notes', description: '根据变更生成发布说明', source: 'user' as const, type: null, userInvocableOnly: true }
    ],
    listWorkspaceSkills: async () => [
      { name: 'review', description: '审查当前项目并给出可执行建议', source: 'project' as const, type: null, userInvocableOnly: false }
    ],
    activateSkill: async (_sessionId: string, skillName: string) => ({ activated: true, skillName }),
    listKimiTools: async () => [
      { name: 'ReadFile', description: '读取工作区文件', source: 'builtin' as const, mcpServerId: null, active: true },
      { name: 'mcp__github__search', description: '搜索 GitHub', source: 'mcp' as const, mcpServerId: 'github', active: true }
    ],
    listMcpServers: async () => [
      { id: 'github', name: 'github', transport: 'stdio' as const, status: 'connected' as const, lastError: null, toolCount: 12 }
    ],
    restartMcpServer: async () => ({ restarting: true as const }),
    openHtmlPreview: async () => browserState(),
    navigateBrowser: async () => browserState(),
    browserBack: async () => browserState(),
    browserForward: async () => browserState(),
    browserReload: async () => browserState(),
    browserStop: async () => browserState(),
    setBrowserBounds: async () => undefined,
    setBrowserVisible: async (visible: boolean) => ({ ...browserState(), visible }),
    setBrowserOverlay: async () => undefined,
    setBrowserViewport: async () => browserState(),
    clearBrowserConsole: async () => browserState(),
    clearBrowserNetwork: async () => browserState(),
    getBrowserNetworkDetails: async (requestId: string) => ({
      requestId, requestHeaders: {}, responseHeaders: {}, body: null,
      bodyTruncated: false, bodyUnavailableReason: 'fixture'
    }),
    captureBrowser: async (fullPage: boolean) => ({
      dataUrl: 'data:image/png;base64,AA==', width: 1, height: 1, fullPage
    }),
    pickBrowserAnnotation: async (mode: 'element' | 'region') => ({
      id: 'fixture-annotation',
      annotation: {
        schemaVersion: 1 as const,
        page: { url: 'preview://fixture/index.html', title: 'Fixture', viewport: { width: 800, height: 600, dpr: 1 } },
        target: { kind: mode, rect: { x: 20, y: 20, width: 180, height: 80 } },
        comment: '',
        capturedAt: new Date().toISOString()
      },
      screenshot: { dataUrl: 'data:image/png;base64,AA==', width: 196, height: 96, fullPage: false }
    }),
    deleteBrowserAnnotation: async () => undefined,
    submitBrowserAnnotation: async () => ({
      promptId: 'fixture-prompt', userMessageId: 'fixture-message', status: 'running' as const
    }),
    openBrowserExternal: async () => ({ opened: true as const }),
    discoverBrowserLocalServers: async () => [],
    onRuntimeStateChanged: () => () => {},
    onSessionStateChanged: () => () => {},
    onTerminalOutput: () => () => {},
    onTerminalExit: () => () => {},
    onBrowserStateChanged: () => () => {}
  } as unknown as KimiAgentDesktopApi
  window.kimiAgent = api
}

function browserState() {
  return {
    url: '', title: '', loading: false, canGoBack: false, canGoForward: false, visible: false,
    viewport: { mode: 'auto' as const, width: null, height: null, deviceScaleFactor: 1 },
    consoleEntries: [], networkEntries: [], error: null
  }
}
