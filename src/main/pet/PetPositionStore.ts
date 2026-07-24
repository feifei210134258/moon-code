import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface StoredPetPosition {
  displayId: string
  edge: 'left' | 'right'
  offsetY: number
}

interface StoredPetPositions {
  version: 1
  sessions: Record<string, StoredPetPosition>
}

const EMPTY_POSITIONS: StoredPetPositions = { version: 1, sessions: {} }

export class PetPositionStore {
  readonly #path: string
  #loaded: StoredPetPositions | null = null
  #writeQueue: Promise<void> = Promise.resolve()

  constructor(path: string) {
    this.#path = path
  }

  async get(sessionId: string): Promise<StoredPetPosition | null> {
    const positions = await this.#load()
    return positions.sessions[sessionId] ?? null
  }

  async set(sessionId: string, position: StoredPetPosition): Promise<void> {
    const positions = await this.#load()
    positions.sessions[sessionId] = sanitizePosition(position)
    this.#writeQueue = this.#writeQueue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true })
      const temporaryPath = `${this.#path}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(positions, null, 2)}\n`, { mode: 0o600 })
      await rename(temporaryPath, this.#path)
    })
    await this.#writeQueue
  }

  async #load(): Promise<StoredPetPositions> {
    if (this.#loaded !== null) return this.#loaded
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#path, 'utf8'))
      this.#loaded = parsePositions(parsed)
    } catch {
      this.#loaded = structuredClone(EMPTY_POSITIONS)
    }
    return this.#loaded
  }
}

function parsePositions(value: unknown): StoredPetPositions {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.sessions)) {
    return structuredClone(EMPTY_POSITIONS)
  }
  const sessions: Record<string, StoredPetPosition> = {}
  for (const [sessionId, candidate] of Object.entries(value.sessions)) {
    if (
      sessionId.length === 0 ||
      !isRecord(candidate) ||
      typeof candidate.displayId !== 'string' ||
      (candidate.edge !== 'left' && candidate.edge !== 'right') ||
      typeof candidate.offsetY !== 'number' ||
      !Number.isFinite(candidate.offsetY)
    ) continue
    sessions[sessionId] = sanitizePosition({
      displayId: candidate.displayId,
      edge: candidate.edge,
      offsetY: candidate.offsetY
    })
  }
  return { version: 1, sessions }
}

function sanitizePosition(position: StoredPetPosition): StoredPetPosition {
  return {
    displayId: position.displayId.slice(0, 128),
    edge: position.edge,
    offsetY: Math.max(0, Math.min(1, position.offsetY))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
