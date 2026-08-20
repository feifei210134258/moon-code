import { computed, type ComputedRef } from 'vue'
import type { SessionRetryStatus, SessionViewState } from '@shared/contracts'
import type { ChatTurn } from '../types'
import { rendererLocale } from '../i18n/rendererLocale'

/**
 * 会话轮次健康度：失败 Turn 常驻卡片 + 模型请求自动重试的 loading 指示。
 *
 * 数据来自 `SessionViewState`（store 已 hydrate）：
 * - `lastTurnReason === 'failed'` 且会话空闲 → 显示失败卡片并允许一键重发最近一条
 *   用户 prompt 恢复（手动取消得到的是 `cancelled`，不显示卡片）；
 * - `retry` 非空（来自协议 `turn.step.retrying` 的 failedAttempt/nextAttempt/
 *   maxAttempts/errorMessage）→ loading 指示展示「重试中 (attempt N/M)」与
 *   provider 错误摘要。
 */
export interface TurnHealthInput {
  turns: ChatTurn[]
  phase: SessionViewState['phase']
  lastTurnReason: SessionViewState['lastTurnReason']
  lastTurnError: string | null
  retry: SessionRetryStatus | null
  /** 主 turn 正在执行（或等待操作）时隐藏失败卡片。 */
  sessionBusy: boolean
  draftActive: boolean
}

export interface TurnHealth {
  /** 是否展示常驻失败卡片。 */
  failedTurn: ComputedRef<boolean>
  /** 失败原因摘要（协议 error message，可能为 null）。 */
  failedReason: ComputedRef<string | null>
  /** 最近一条用户 prompt 的文本；无文本（如纯附件）时不可恢复。 */
  resumeText: ComputedRef<string>
  /** 是否存在可重发的用户 prompt。 */
  canResume: ComputedRef<boolean>
  /** 自动重试期间是否展示「重试中」指示。 */
  retryActive: ComputedRef<boolean>
  /** 「重试中 (attempt N/M)」本地化标签；非重试时为 null。 */
  retryLabel: ComputedRef<string | null>
  /** provider 错误一行摘要；非重试或无摘要时为 null。 */
  retryError: ComputedRef<string | null>
}

export function useTurnHealth(input: TurnHealthInput): TurnHealth {
  const lastUserTurn = computed(() => {
    for (let index = input.turns.length - 1; index >= 0; index -= 1) {
      const turn = input.turns[index]
      if (turn?.role === 'user') return turn
    }
    return null
  })

  const resumeText = computed(() => {
    const turn = lastUserTurn.value
    if (turn === null) return ''
    return turn.blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .replace(/\s+/g, ' ').trim()
  })

  const failedTurn = computed(() => {
    if (input.phase !== 'ready' || input.draftActive) return false
    if (input.lastTurnReason !== 'failed') return false
    /* 新一轮正在执行时不要盖住对话；此后轮次结局会覆盖 lastTurnReason。 */
    if (input.sessionBusy) return false
    return true
  })

  const failedReason = computed(() => (
    failedTurn.value ? input.lastTurnError : null
  ))

  const canResume = computed(() => failedTurn.value && resumeText.value.length > 0)

  const retryActive = computed(() => (
    input.phase === 'ready' && input.retry !== null
  ))

  const retryLabel = computed(() => {
    if (input.retry === null) return null
    const attempt = Math.max(1, input.retry.nextAttempt)
    const maxAttempts = Math.max(attempt, input.retry.maxAttempts)
    return rendererLocale() === 'en-US'
      ? `Retrying (attempt ${attempt}/${maxAttempts})`
      : `重试中 (attempt ${attempt}/${maxAttempts})`
  })

  const retryError = computed(() => {
    const retry = input.retry
    if (retry === null) return null
    return retry.errorMessage ?? retry.errorName ?? null
  })

  return { failedTurn, failedReason, resumeText, canResume, retryActive, retryLabel, retryError }
}
