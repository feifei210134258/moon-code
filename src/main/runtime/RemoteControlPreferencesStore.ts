import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface RemoteControlPreference {
  enabled: boolean
}

export const DEFAULT_REMOTE_CONTROL_PREFERENCE: RemoteControlPreference = {
  enabled: false
}

export class RemoteControlPreferencesStore {
  constructor(private readonly pathSource: string | (() => string)) {}

  async load(): Promise<RemoteControlPreference> {
    try {
      const raw = JSON.parse(await readFile(this.#path(), 'utf8'))
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ...DEFAULT_REMOTE_CONTROL_PREFERENCE }
      }
      return { enabled: (raw as Record<string, unknown>).enabled === true }
    } catch {
      return { ...DEFAULT_REMOTE_CONTROL_PREFERENCE }
    }
  }

  async save(preference: RemoteControlPreference): Promise<void> {
    const path = this.#path()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(preference, null, 2)}\n`, { mode: 0o600 })
  }

  #path(): string {
    return typeof this.pathSource === 'string' ? this.pathSource : this.pathSource()
  }
}
