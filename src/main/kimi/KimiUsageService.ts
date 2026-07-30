import { EventEmitter } from 'node:events'
import { KimiApiError } from '../../../packages/kimi-adapter/src/transport/KimiRestClient.js'
import type { ManagedUsageResult, ManagedUsageWindow } from '../../../packages/kimi-adapter/src/wire/schemas.js'
import type {
  KimiPlanUsageWindow,
  KimiUsagePreferences,
  KimiUsageState,
  RuntimePublicState
} from '../../shared/contracts.js'
import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import {
  DEFAULT_USAGE_PREFERENCES,
  type UsagePreferencesStore,
  validateUsagePreferences
} from './UsagePreferencesStore.js'

const ACTIVE_REFRESH_MS = 30_000
const BACKGROUND_REFRESH_MS = 60_000
const REQUEST_TIMEOUT_MS = 10_000
const FAILURE_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000] as const

export interface UsageThresholdNotice {
  window: KimiPlanUsageWindow
  threshold: number
}

export interface TurnCompletionNotice {
  sessionId: string
  title: string
  failed: boolean
}

export class KimiUsageService extends EventEmitter {
  readonly #runtime: KimiRuntimeManager
  readonly #notifyThreshold: (notice: UsageThresholdNotice) => void
  readonly #notifyTurnCompletion: (notice: TurnCompletionNotice) => void
  readonly #onUnauthorized: () => void
  readonly #preferencesStore: UsagePreferencesStore | null
  readonly #cache = new Map<string, KimiUsageState>()
  readonly #notified = new Set<string>()
  #state = emptyUsageState()
  #timer: NodeJS.Timeout | null = null
  #inFlight: Promise<KimiUsageState> | null = null
  #active = true
  #started = false
  #closed = false
  #failureCount = 0
  #cacheKey: string | null = null

  constructor(
    runtime: KimiRuntimeManager,
    options: {
      notifyThreshold?: (notice: UsageThresholdNotice) => void
      notifyTurnCompletion?: (notice: TurnCompletionNotice) => void
      onUnauthorized?: () => void
      preferencesStore?: UsagePreferencesStore
    } = {}
  ) {
    super()
    this.#runtime = runtime
    this.#notifyThreshold = options.notifyThreshold ?? (() => undefined)
    this.#notifyTurnCompletion = options.notifyTurnCompletion ?? (() => undefined)
    this.#onUnauthorized = options.onUnauthorized ?? (() => undefined)
    this.#preferencesStore = options.preferencesStore ?? null
  }

  get state(): KimiUsageState {
    return cloneUsageState(this.#state)
  }

  start(): void {
    if (this.#started || this.#closed) return
    this.#started = true
    this.#runtime.on('state-changed', this.#onRuntimeState)
    if (this.#preferencesStore === null) this.#onRuntimeState(this.#runtime.state)
    else {
      void this.#preferencesStore.load().then((preferences) => {
        if (this.#closed) return
        this.#state.preferences = preferences
        this.#emitState()
        this.#onRuntimeState(this.#runtime.state)
      })
    }
  }

  setActive(active: boolean): void {
    if (this.#closed || this.#active === active) return
    this.#active = active
    if (active) void this.refresh()
    else this.#schedule(BACKGROUND_REFRESH_MS)
  }

  refresh(): Promise<KimiUsageState> {
    if (this.#closed) return Promise.resolve(this.state)
    if (this.#inFlight !== null) return this.#inFlight
    if (this.#runtime.state.status !== 'running') {
      this.#markRuntimeUnavailable()
      return Promise.resolve(this.state)
    }
    this.#clearTimer()
    this.#state.refreshing = true
    this.#state.phase = this.#state.updatedAt === null ? 'loading' : this.#state.phase
    this.#state.error = null
    this.#emitState()
    const operation = this.#performRefresh()
    this.#inFlight = operation.finally(() => {
      this.#inFlight = null
    })
    return this.#inFlight
  }

  async updatePreferences(value: unknown): Promise<KimiUsageState> {
    const preferences = validateUsagePreferences(value)
    if (this.#preferencesStore !== null) await this.#preferencesStore.save(preferences)
    this.#state.preferences = preferences
    this.#notified.clear()
    this.#emitState()
    return this.state
  }

  notifyTurnCompleted(notice: TurnCompletionNotice): void {
    if (this.#closed || this.#state.preferences.turnNotifications === false) return
    this.#notifyTurnCompletion({ ...notice })
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#clearTimer()
    if (this.#started) this.#runtime.off('state-changed', this.#onRuntimeState)
  }

  readonly #onRuntimeState = (runtimeState: RuntimePublicState): void => {
    if (this.#closed) return
    if (runtimeState.status !== 'running' || runtimeState.serverId === null) {
      this.#cacheKey = null
      this.#markRuntimeUnavailable()
      return
    }
    const nextKey = `${runtimeState.serverId}:default`
    if (nextKey !== this.#cacheKey) {
      this.#cacheKey = nextKey
      const cached = this.#cache.get(nextKey)
      const preferences = this.#state.preferences
      this.#state = cached === undefined ? emptyUsageState(preferences) : {
        ...cloneUsageState(cached),
        preferences: { ...preferences }
      }
      this.#failureCount = 0
      this.#emitState()
    }
    void this.refresh()
  }

  async #performRefresh(): Promise<KimiUsageState> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('Kimi usage request timed out')), REQUEST_TIMEOUT_MS)
    timeout.unref()
    let nextDelay = this.#active ? ACTIVE_REFRESH_MS : BACKGROUND_REFRESH_MS
    try {
      const result = await this.#runtime.createRestClient().getOAuthUsage(undefined, controller.signal)
      if (result.kind === 'error') {
        throw new ManagedUsageError(result.message, result.status ?? null)
      }
      const updatedAt = new Date().toISOString()
      this.#state = mapUsageResult(result, updatedAt, nextDelay, this.#state.preferences)
      this.#failureCount = 0
      if (this.#cacheKey !== null) this.#cache.set(this.#cacheKey, cloneUsageState(this.#state))
      this.#emitThresholds(this.#state)
    } catch (error) {
      if (
        (error instanceof KimiApiError && error.status === 401) ||
        (error instanceof ManagedUsageError && error.status === 401)
      ) this.#onUnauthorized()
      this.#failureCount += 1
      const backoff = FAILURE_BACKOFF_MS[Math.min(this.#failureCount - 1, FAILURE_BACKOFF_MS.length - 1)]!
      nextDelay = error instanceof KimiApiError && error.status === 429 && error.retryAfterMs !== null
        ? Math.max(backoff, error.retryAfterMs)
        : backoff
      this.#state.refreshing = false
      this.#state.phase = this.#state.updatedAt === null ? 'unavailable' : 'stale'
      this.#state.error = safeUsageError(error)
      this.#state.nextRefreshAt = new Date(Date.now() + nextDelay).toISOString()
    } finally {
      clearTimeout(timeout)
    }
    this.#emitState()
    this.#schedule(nextDelay)
    return this.state
  }

  #markRuntimeUnavailable(): void {
    this.#clearTimer()
    this.#state.refreshing = false
    this.#state.phase = this.#state.updatedAt === null ? 'idle' : 'stale'
    this.#state.error = this.#state.updatedAt === null ? null : 'Kimi Runtime 未运行，用量数据可能已过期'
    this.#state.nextRefreshAt = null
    this.#emitState()
  }

  #schedule(delayMs: number): void {
    this.#clearTimer()
    if (this.#closed || this.#runtime.state.status !== 'running') return
    this.#state.nextRefreshAt = new Date(Date.now() + delayMs).toISOString()
    this.#timer = setTimeout(() => {
      this.#timer = null
      void this.refresh()
    }, delayMs)
    this.#timer.unref()
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
  }

  #emitThresholds(state: KimiUsageState): void {
    if (!state.preferences.systemNotifications) return
    const thresholds = [state.preferences.warningThreshold, state.preferences.criticalThreshold]
    for (const window of [state.summary, ...state.limits]) {
      if (window === null || window.ratio === null) continue
      let noticeThreshold: number | null = null
      for (const threshold of thresholds) {
        const key = `${this.#cacheKey ?? 'unknown'}\0${window.key}\0${window.resetHint ?? ''}\0${threshold}`
        if (window.ratio < threshold) {
          this.#notified.delete(key)
          continue
        }
        if (this.#notified.has(key)) continue
        this.#notified.add(key)
        noticeThreshold = threshold
      }
      if (noticeThreshold !== null) this.#notifyThreshold({ window, threshold: noticeThreshold })
    }
  }

  #emitState(): void {
    this.emit('state-changed', this.state)
  }
}

class ManagedUsageError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message)
    this.name = 'ManagedUsageError'
  }
}

function mapUsageResult(
  result: Extract<ManagedUsageResult, { kind: 'ok' }>,
  updatedAt: string,
  refreshDelayMs: number,
  preferences: KimiUsagePreferences
): KimiUsageState {
  return {
    phase: 'ready',
    summary: result.summary === null ? null : mapWindow(result.summary, 'summary'),
    limits: result.limits.map((window, index) => mapWindow(window, `limit-${index}`)),
    extraUsage: result.extra_usage === null ? null : {
      balanceCents: Math.max(0, result.extra_usage.balance_cents),
      totalCents: Math.max(0, result.extra_usage.total_cents),
      monthlyChargeLimitEnabled: result.extra_usage.monthly_charge_limit_enabled,
      monthlyChargeLimitCents: Math.max(0, result.extra_usage.monthly_charge_limit_cents),
      monthlyUsedCents: Math.max(0, result.extra_usage.monthly_used_cents),
      currency: result.extra_usage.currency
    },
    updatedAt,
    nextRefreshAt: new Date(Date.now() + refreshDelayMs).toISOString(),
    refreshing: false,
    source: 'kimi-oauth-usage',
    error: null,
    preferences: { ...preferences }
  }
}

function mapWindow(window: ManagedUsageWindow, fallbackKey: string): KimiPlanUsageWindow {
  const used = Math.max(0, window.used)
  const limit = Math.max(0, window.limit)
  const label = managedWindowLabel(window, fallbackKey)
  return {
    key: `${fallbackKey}:${label}`,
    label,
    used,
    limit,
    ratio: limit === 0 ? null : Math.max(0, Math.min(1, used / limit)),
    resetHint: window.reset_hint?.trim() || window.reset_at?.trim() || null
  }
}

function managedWindowLabel(window: ManagedUsageWindow, fallbackKey: string): string {
  const legacyLabel = window.label?.trim()
  if (legacyLabel) return legacyLabel
  if (window.window !== undefined) {
    const { duration, unit } = window.window
    if (unit === 'week' && duration === 1) return 'Weekly limit'
    const abbreviation = { minute: 'm', hour: 'h', day: 'd', week: 'w' }[unit]
    return `${duration}${abbreviation} limit`
  }
  const name = window.name?.trim()
  if (name) return name
  return fallbackKey === 'summary'
    ? 'Plan usage'
    : `Limit ${Number.parseInt(fallbackKey.replace(/^limit-/, ''), 10) + 1 || 1}`
}

function emptyUsageState(
  preferences: KimiUsagePreferences = DEFAULT_USAGE_PREFERENCES
): KimiUsageState {
  return {
    phase: 'idle',
    summary: null,
    limits: [],
    extraUsage: null,
    updatedAt: null,
    nextRefreshAt: null,
    refreshing: false,
    source: 'kimi-oauth-usage',
    error: null,
    preferences: { ...preferences }
  }
}

function cloneUsageState(state: KimiUsageState): KimiUsageState {
  return {
    ...state,
    summary: state.summary === null ? null : { ...state.summary },
    limits: state.limits.map((window) => ({ ...window })),
    extraUsage: state.extraUsage === null ? null : { ...state.extraUsage },
    preferences: { ...state.preferences }
  }
}

function safeUsageError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password)\b\s*[:=]\s*([^\s,;]+)/gi, '$1=[redacted]')
    .slice(0, 1_000)
}
