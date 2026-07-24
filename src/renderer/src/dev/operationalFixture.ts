import type { KimiModelCatalogItem, KimiPromptControls, KimiSessionOperationalState } from '@shared/contracts'
import type { LocalPromptDraft } from '../utils/localPromptQueue'

export const operationalControlsFixture: KimiPromptControls = {
  model: 'kimi-for-coding',
  thinking: 'high',
  permissionMode: 'manual',
  planMode: true,
  swarmMode: false
}

export const operationalModelsFixture: KimiModelCatalogItem[] = [{
  id: 'kimi-for-coding',
  providerId: 'managed:kimi-code',
  displayName: 'Kimi for Coding',
  maxContextSize: 262_144,
  capabilities: ['thinking'],
  supportEfforts: ['off', 'low', 'high', 'max'],
  defaultEffort: 'high'
}]

export const localPromptQueueFixture: LocalPromptDraft[] = [{
  id: 'local-draft-1',
  sessionId: 'session-fixture',
  createdAt: new Date().toISOString(),
  input: {
    text: '补齐 Workspace 与 Session 生命周期操作',
    controls: operationalControlsFixture
  }
}, {
  id: 'local-draft-2',
  sessionId: 'session-fixture',
  createdAt: new Date().toISOString(),
  input: {
    text: '接入附件上传和媒体预览',
    controls: operationalControlsFixture
  }
}]

export const operationalFixture: KimiSessionOperationalState = {
  goal: {
    goalId: 'goal-fixture',
    objective: '补齐 Kimi Web P0，并保持 Kimi Code 为唯一 Agent 内核',
    completionCriterion: null,
    status: 'active',
    turnsUsed: 12,
    tokensUsed: 48_320,
    wallClockMs: 1_240_000,
    budget: {
      tokenBudget: 120_000,
      turnBudget: null,
      wallClockBudgetMs: null,
      remainingTokens: 71_680,
      remainingTurns: null,
      remainingWallClockMs: null,
      tokenBudgetReached: false,
      turnBudgetReached: false,
      wallClockBudgetReached: false,
      overBudget: false
    },
    terminalReason: null
  },
  prompts: {
    active: {
      promptId: 'prompt-active', userMessageId: 'message-active', status: 'running',
      textPreview: '实现真实 Session Controls 与 Goal 状态', createdAt: new Date().toISOString()
    },
    queued: [{
      promptId: 'prompt-queued', userMessageId: 'message-queued', status: 'queued',
      textPreview: '继续补齐 Workspace 和 Session 生命周期', createdAt: new Date().toISOString()
    }]
  },
  tasks: [{
    id: 'task-fixture', sessionId: 'session-fixture', kind: 'bash', description: '运行完整回归测试',
    status: 'running', command: 'pnpm test', createdAt: new Date().toISOString(), startedAt: new Date().toISOString(),
    completedAt: null, outputPreview: '52 files passed · 217 tests passed', outputBytes: 4_096
  }]
}
