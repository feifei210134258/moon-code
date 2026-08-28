import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface TowerPreference {
  enabled: boolean
}

export const DEFAULT_TOWER_PREFERENCE: TowerPreference = {
  enabled: false
}

export class TowerPreferencesStore {
  constructor(private readonly pathSource: string | (() => string)) {}

  async load(): Promise<TowerPreference> {
    try {
      const raw = JSON.parse(await readFile(this.#path(), 'utf8'))
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ...DEFAULT_TOWER_PREFERENCE }
      }
      return { enabled: (raw as Record<string, unknown>).enabled === true }
    } catch {
      return { ...DEFAULT_TOWER_PREFERENCE }
    }
  }

  async save(preference: TowerPreference): Promise<void> {
    const path = this.#path()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(preference, null, 2)}\n`, { mode: 0o600 })
  }

  #path(): string {
    return typeof this.pathSource === 'string' ? this.pathSource : this.pathSource()
  }
}
