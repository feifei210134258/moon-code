import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_USAGE_PREFERENCES,
  UsagePreferencesStore,
  validateUsagePreferences
} from '../../src/main/kimi/UsagePreferencesStore.js'

describe('UsagePreferencesStore', () => {
  it('persists only validated local threshold preferences with private file mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-usage-preferences-'))
    const path = join(root, 'usage.json')
    const store = new UsagePreferencesStore(path)
    const preferences = {
      infoThreshold: 0.45,
      warningThreshold: 0.75,
      criticalThreshold: 0.9,
      systemNotifications: false
    }
    await store.save(preferences)
    await expect(store.load()).resolves.toEqual(preferences)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(preferences)
  })

  it('rejects unordered/out-of-range thresholds and safely falls back on invalid disk data', async () => {
    expect(() => validateUsagePreferences({
      infoThreshold: 0.8, warningThreshold: 0.5, criticalThreshold: 0.95, systemNotifications: true
    })).toThrow('Invalid usage thresholds')
    const root = await mkdtemp(join(tmpdir(), 'kimi-usage-preferences-invalid-'))
    const path = join(root, 'usage.json')
    await writeFile(path, '{bad json')
    await expect(new UsagePreferencesStore(path).load()).resolves.toEqual(DEFAULT_USAGE_PREFERENCES)
  })
})
