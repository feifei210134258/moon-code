import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface StoredPetPosition {
  displayId: string
  edge: 'left' | 'right'
  offsetY: number
}

interface StoredPetPositions {
  version: 1
  pet: StoredPetPosition | null
}

const EMPTY_POSITIONS: StoredPetPositions = { version: 1, pet: null }

/**
 * Stores the position of the single pet window. Older versions keyed positions
 * by session id; that data is deliberately ignored, the pet is global now.
 */
export class PetPositionStore {
  readonly #path: string
  #loaded: StoredPetPositions | null = null
  #writeQueue: Promise<void> = Promise.resolve()

  constructor(path: string) {
    this.#path = path
  }

  async get(): Promise<StoredPetPosition | null> {
    const positions = await this.#load()
    return positions.pet
  }

  async set(position: StoredPetPosition): Promise<void> {
    const positions = await this.#load()
    positions.pet = sanitizePosition(position)
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
  if (!isRecord(value) || value.version !== 1) return structuredClone(EMPTY_POSITIONS)
  const candidate = value.pet
  if (
    candidate === null ||
    !isRecord(candidate) ||
    typeof candidate.displayId !== 'string' ||
    (candidate.edge !== 'left' && candidate.edge !== 'right') ||
    typeof candidate.offsetY !== 'number' ||
    !Number.isFinite(candidate.offsetY)
  ) return structuredClone(EMPTY_POSITIONS)
  return {
    version: 1,
    pet: sanitizePosition({
      displayId: candidate.displayId,
      edge: candidate.edge,
      offsetY: candidate.offsetY
    })
  }
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
