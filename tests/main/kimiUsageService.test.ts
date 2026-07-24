import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KimiApiError } from '../../packages/kimi-adapter/src/transport/KimiRestClient.js'
import { KimiUsageService } from '../../src/main/kimi/KimiUsageService.js'
import type { RuntimePublicState } from '../../src/shared/contracts.js'
import type { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('KimiUsageService', () => {
  it('single-flights refreshes, clamps malformed progress and emits threshold notices once per reset window', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-23T00:00:00.000Z') })
    let resolveUsage!: (value: any) => void
    const deferred = new Promise<any>((resolve) => { resolveUsage = resolve })
    const getOAuthUsage = vi.fn(() => deferred)
    const { runtime } = fakeRuntime(getOAuthUsage)
    const notify = vi.fn()
    const service = new KimiUsageService(runtime, { notifyThreshold: notify })
    service.start()

    const first = service.refresh()
    const second = service.refresh()
    expect(getOAuthUsage).toHaveBeenCalledOnce()
    resolveUsage({
      kind: 'ok',
      summary: { label: '套餐', used: 82, limit: 100, reset_hint: '5 days' },
      limits: [{ label: 'empty', used: -3, limit: 0 }],
      extra_usage: {
        balance_cents: -1, total_cents: 5000, monthly_charge_limit_enabled: true,
        monthly_charge_limit_cents: 2000, monthly_used_cents: 620, currency: 'CNY'
      }
    })
    await expect(first).resolves.toEqual(expect.objectContaining({ phase: 'ready' }))
    await expect(second).resolves.toEqual(expect.objectContaining({ phase: 'ready' }))
    expect(service.state.summary?.ratio).toBe(0.82)
    expect(service.state.limits[0]).toEqual(expect.objectContaining({ used: 0, ratio: null }))
    expect(service.state.extraUsage?.balanceCents).toBe(0)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0.8 }))

    service.close()
  })

  it('retains the last success as stale and respects Retry-After without request pile-up', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-23T00:00:00.000Z') })
    const getOAuthUsage = vi.fn()
      .mockResolvedValueOnce({ kind: 'ok', summary: null, limits: [], extra_usage: null })
      .mockRejectedValueOnce(new KimiApiError('rate limited', {
        code: 42900, status: 429, retryAfterMs: 45_000
      }))
      .mockResolvedValueOnce({ kind: 'ok', summary: null, limits: [], extra_usage: null })
    const { runtime } = fakeRuntime(getOAuthUsage)
    const service = new KimiUsageService(runtime)
    service.start()
    await service.refresh()
    const updatedAt = service.state.updatedAt

    await service.refresh()
    expect(service.state).toEqual(expect.objectContaining({
      phase: 'stale', updatedAt, error: 'rate limited', refreshing: false
    }))
    expect(new Date(service.state.nextRefreshAt!).getTime() - Date.now()).toBe(45_000)

    await vi.advanceTimersByTimeAsync(44_999)
    expect(getOAuthUsage).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(getOAuthUsage).toHaveBeenCalledTimes(3)
    service.close()
  })

  it('uses 30 second foreground and 60 second background polling and refreshes on focus', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-23T00:00:00.000Z') })
    const getOAuthUsage = vi.fn(async () => ({ kind: 'ok', summary: null, limits: [], extra_usage: null }))
    const { runtime } = fakeRuntime(getOAuthUsage)
    const service = new KimiUsageService(runtime)
    service.start()
    await service.refresh()
    expect(getOAuthUsage).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(getOAuthUsage).toHaveBeenCalledTimes(2)
    service.setActive(false)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(getOAuthUsage).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(getOAuthUsage).toHaveBeenCalledTimes(3)
    service.setActive(true)
    await vi.runAllTicks()
    expect(getOAuthUsage).toHaveBeenCalledTimes(4)
    service.close()
  })

  it('keeps the last success but stops scheduling when the managed runtime stops', async () => {
    const getOAuthUsage = vi.fn(async () => ({ kind: 'ok', summary: null, limits: [], extra_usage: null }))
    const fixture = fakeRuntime(getOAuthUsage)
    const service = new KimiUsageService(fixture.runtime)
    service.start()
    await service.refresh()

    fixture.setState({
      status: 'stopped', mode: null, version: null, serverId: null, origin: null, error: null
    })
    expect(service.state.phase).toBe('stale')
    expect(service.state.updatedAt).not.toBeNull()
    expect(service.state.nextRefreshAt).toBeNull()
    service.close()
  })

  it('surfaces unauthenticated/error responses without inventing zero usage', async () => {
    const getOAuthUsage = vi.fn(async () => ({ kind: 'error', message: 'Not logged in', status: 401 }))
    const { runtime } = fakeRuntime(getOAuthUsage)
    const onUnauthorized = vi.fn()
    const service = new KimiUsageService(runtime, { onUnauthorized })
    service.start()
    await service.refresh()

    expect(service.state).toEqual(expect.objectContaining({
      phase: 'unavailable', summary: null, limits: [], updatedAt: null, error: 'Not logged in'
    }))
    expect(onUnauthorized).toHaveBeenCalledOnce()
    service.close()
  })

  it('aborts a stuck usage request after ten seconds and schedules bounded retry', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-23T00:00:00.000Z') })
    const getOAuthUsage = vi.fn((_provider?: string, signal?: AbortSignal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const { runtime } = fakeRuntime(getOAuthUsage)
    const service = new KimiUsageService(runtime)
    service.start()
    const refresh = service.refresh()
    await vi.advanceTimersByTimeAsync(10_000)
    await refresh

    expect(service.state.phase).toBe('unavailable')
    expect(service.state.error).toContain('timed out')
    expect(new Date(service.state.nextRefreshAt!).getTime() - Date.now()).toBe(5_000)
    service.close()
  })

  it('never overlaps requests even if an upstream fetch ignores abort for eight background hours', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-23T00:00:00.000Z') })
    const getOAuthUsage = vi.fn(() => new Promise(() => undefined))
    const { runtime } = fakeRuntime(getOAuthUsage)
    const service = new KimiUsageService(runtime)
    service.start()
    service.setActive(false)

    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1_000)
    expect(getOAuthUsage).toHaveBeenCalledOnce()
    service.close()
  })

  it('applies ordered configurable thresholds and can disable system notifications', async () => {
    const getOAuthUsage = vi.fn(async () => ({
      kind: 'ok',
      summary: { label: 'Plan', used: 76, limit: 100, reset_hint: 'cycle-1' },
      limits: [],
      extra_usage: null
    }))
    const { runtime } = fakeRuntime(getOAuthUsage)
    const notify = vi.fn()
    const service = new KimiUsageService(runtime, { notifyThreshold: notify })
    await service.updatePreferences({
      infoThreshold: 0.4,
      warningThreshold: 0.75,
      criticalThreshold: 0.9,
      systemNotifications: false
    })
    service.start()
    await service.refresh()
    expect(service.state.preferences.warningThreshold).toBe(0.75)
    expect(notify).not.toHaveBeenCalled()
    await expect(service.updatePreferences({
      infoThreshold: 0.8,
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
      systemNotifications: true
    })).rejects.toThrow('Invalid usage thresholds')
    service.close()
  })
})

function fakeRuntime(getOAuthUsage: (...args: any[]) => Promise<any>): {
  runtime: KimiRuntimeManager
  setState: (state: RuntimePublicState) => void
} {
  const emitter = new EventEmitter() as EventEmitter & {
    state: RuntimePublicState
    createRestClient: () => { getOAuthUsage: typeof getOAuthUsage }
  }
  let state: RuntimePublicState = {
    status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1',
    origin: 'http://127.0.0.1:1234', error: null
  }
  Object.defineProperty(emitter, 'state', { get: () => state })
  emitter.createRestClient = () => ({ getOAuthUsage })
  return {
    runtime: emitter as unknown as KimiRuntimeManager,
    setState: (next) => {
      state = next
      emitter.emit('state-changed', next)
    }
  }
}
