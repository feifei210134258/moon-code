import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { KimiUsagePreferences } from '../../shared/contracts.js'

export const DEFAULT_USAGE_PREFERENCES: KimiUsagePreferences = {
  infoThreshold: 0.5,
  warningThreshold: 0.8,
  criticalThreshold: 0.95,
  systemNotifications: true,
  turnNotifications: true,
  notificationSound: true,
  locale: 'zh-CN'
}

export class UsagePreferencesStore {
  constructor(private readonly pathSource: string | (() => string)) {}

  async load(): Promise<KimiUsagePreferences> {
    try {
      return validateUsagePreferences(JSON.parse(await readFile(this.#path(), 'utf8')))
    } catch {
      return { ...DEFAULT_USAGE_PREFERENCES }
    }
  }

  async save(preferences: KimiUsagePreferences): Promise<void> {
    const validated = validateUsagePreferences(preferences)
    const path = this.#path()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 })
  }

  #path(): string {
    return typeof this.pathSource === 'string' ? this.pathSource : this.pathSource()
  }
}

export function validateUsagePreferences(value: unknown): KimiUsagePreferences {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid usage preferences')
  }
  const record = value as Record<string, unknown>
  const infoThreshold = threshold(record.infoThreshold)
  const warningThreshold = threshold(record.warningThreshold)
  const criticalThreshold = threshold(record.criticalThreshold)
  if (
    infoThreshold === null || warningThreshold === null || criticalThreshold === null ||
    !(infoThreshold < warningThreshold && warningThreshold < criticalThreshold)
  ) throw new TypeError('Invalid usage thresholds')
  if (typeof record.systemNotifications !== 'boolean') throw new TypeError('Invalid usage notification preference')
  const turnNotifications = record.turnNotifications === undefined
    ? DEFAULT_USAGE_PREFERENCES.turnNotifications!
    : record.turnNotifications
  const notificationSound = record.notificationSound === undefined
    ? DEFAULT_USAGE_PREFERENCES.notificationSound!
    : record.notificationSound
  const locale = record.locale === undefined ? DEFAULT_USAGE_PREFERENCES.locale! : record.locale
  if (typeof turnNotifications !== 'boolean' || typeof notificationSound !== 'boolean') {
    throw new TypeError('Invalid Kimi turn notification preference')
  }
  if (locale !== 'zh-CN' && locale !== 'en-US') throw new TypeError('Invalid Kimi locale preference')
  return {
    infoThreshold,
    warningThreshold,
    criticalThreshold,
    systemNotifications: record.systemNotifications,
    turnNotifications,
    notificationSound,
    locale
  }
}

function threshold(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.1 && value <= 1
    ? Math.round(value * 100) / 100
    : null
}
