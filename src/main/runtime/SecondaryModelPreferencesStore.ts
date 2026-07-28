import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { KimiSecondaryModelPreference } from '../../shared/contracts.js'

export const DEFAULT_SECONDARY_MODEL_PREFERENCE: KimiSecondaryModelPreference = {
  mode: 'inherit',
  model: null,
  defaultEffort: null
}

export class SecondaryModelPreferencesStore {
  constructor(private readonly pathSource: string | (() => string)) {}

  async load(): Promise<KimiSecondaryModelPreference> {
    try {
      return validateSecondaryModelPreference(JSON.parse(await readFile(this.#path(), 'utf8')))
    } catch {
      return { ...DEFAULT_SECONDARY_MODEL_PREFERENCE }
    }
  }

  async save(preference: KimiSecondaryModelPreference): Promise<void> {
    const validated = validateSecondaryModelPreference(preference)
    const path = this.#path()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 })
  }

  #path(): string {
    return typeof this.pathSource === 'string' ? this.pathSource : this.pathSource()
  }
}

export function validateSecondaryModelPreference(value: unknown): KimiSecondaryModelPreference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid secondary model preference')
  }
  const record = value as Record<string, unknown>
  if (record.mode !== 'inherit' && record.mode !== 'configured' && record.mode !== 'disabled') {
    throw new TypeError('Invalid secondary model preference mode')
  }
  const model = nullableNonEmptyString(record.model, 'secondary model')
  const defaultEffort = nullableNonEmptyString(record.defaultEffort, 'secondary effort')
  if (record.mode === 'configured' && model === null) {
    throw new TypeError('Configured secondary model preference requires a model')
  }
  return { mode: record.mode, model, defaultEffort }
}

function nullableNonEmptyString(value: unknown, label: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new TypeError(`Invalid ${label}`)
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 512) throw new TypeError(`Invalid ${label}`)
  return trimmed
}
