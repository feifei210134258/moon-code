import { describe, expect, it, vi } from 'vitest'
import { KimiNotificationService } from '../../src/main/kimi/KimiNotificationService.js'
import { DEFAULT_USAGE_PREFERENCES } from '../../src/main/kimi/UsagePreferencesStore.js'

describe('KimiNotificationService', () => {
  it('emits localized turn notices with an optional system sound', () => {
    const adapter = { isSupported: vi.fn(() => true), show: vi.fn(), beep: vi.fn() }
    const service = new KimiNotificationService(adapter)
    service.notifyTurnCompletion(
      { sessionId: 'session-1', title: 'Implement P0', failed: false },
      { ...DEFAULT_USAGE_PREFERENCES, locale: 'en-US', notificationSound: true }
    )
    expect(adapter.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Kimi task completed: Implement P0' }))
    expect(adapter.beep).toHaveBeenCalledOnce()
  })

  it('does not play a sound when it is disabled', () => {
    const adapter = { isSupported: vi.fn(() => true), show: vi.fn(), beep: vi.fn() }
    const service = new KimiNotificationService(adapter)
    service.notifyUsageThreshold(
      { window: { key: 'plan', label: '套餐', used: 80, limit: 100, ratio: 0.8, resetHint: null }, threshold: 0.8 },
      { ...DEFAULT_USAGE_PREFERENCES, notificationSound: false }
    )
    expect(adapter.show).toHaveBeenCalledOnce()
    expect(adapter.beep).not.toHaveBeenCalled()
  })
})
