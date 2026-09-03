import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SECONDARY_MODEL_PREFERENCE,
  SecondaryModelPreferencesStore,
  validateSecondaryModelPreference
} from '../../src/main/runtime/SecondaryModelPreferencesStore.js'

describe('SecondaryModelPreferencesStore', () => {
  it('persists a validated Runtime launch preference with private permissions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moon-code-secondary-model-'))
    const path = join(root, 'secondary.json')
    const store = new SecondaryModelPreferencesStore(path)
    const preference = { mode: 'configured' as const, model: 'local/coder', defaultEffort: 'low' }

    await store.save(preference)

    await expect(store.load()).resolves.toEqual(preference)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(preference)
    // 私有权限位仅在有 POSIX 权限模型的平台有意义
    // （Windows 无权限位，mode 由只读属性推导：可写文件为 0o666，断言必假）
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o777).toBe(0o600)
    }
  })

  it('falls back safely for invalid disk data and rejects incomplete configured mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moon-code-secondary-invalid-'))
    const path = join(root, 'secondary.json')
    await writeFile(path, '{bad json')

    await expect(new SecondaryModelPreferencesStore(path).load()).resolves.toEqual(
      DEFAULT_SECONDARY_MODEL_PREFERENCE
    )
    expect(() => validateSecondaryModelPreference({
      mode: 'configured', model: null, defaultEffort: null
    })).toThrow('requires a model')
  })

  it('accepts explicit inherit and disabled modes without a model', () => {
    expect(validateSecondaryModelPreference({ mode: 'inherit', model: null, defaultEffort: null }))
      .toEqual(DEFAULT_SECONDARY_MODEL_PREFERENCE)
    expect(validateSecondaryModelPreference({ mode: 'disabled', model: null, defaultEffort: null }))
      .toEqual({ mode: 'disabled', model: null, defaultEffort: null })
  })
})
