import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface StoredWindowState {
  version: 1
  bounds: WindowBounds | null
  isMaximized: boolean
}

export interface ResolvedWindowState {
  bounds: { width: number; height: number; x?: number; y?: number }
  isMaximized: boolean
}

export interface WindowStateLimits {
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
}

export const EMPTY_WINDOW_STATE: StoredWindowState = { version: 1, bounds: null, isMaximized: false }

export class WindowStateStore {
  readonly #pathSource: string | (() => string)
  #writeQueue: Promise<void> = Promise.resolve()

  constructor(pathSource: string | (() => string)) {
    this.#pathSource = pathSource
  }

  async load(): Promise<StoredWindowState> {
    try {
      return parseWindowState(JSON.parse(await readFile(this.#path(), 'utf8')))
    } catch {
      return structuredClone(EMPTY_WINDOW_STATE)
    }
  }

  save(state: StoredWindowState): Promise<void> {
    const snapshot = parseWindowState(state)
    this.#writeQueue = this.#writeQueue.then(async () => {
      const path = this.#path()
      await mkdir(dirname(path), { recursive: true })
      const temporaryPath = `${path}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
      await rename(temporaryPath, path)
    })
    return this.#writeQueue
  }

  // Lets shutdown paths wait for queued debounced writes before the process exits.
  async flush(): Promise<void> {
    await this.#writeQueue
  }

  #path(): string {
    return typeof this.#pathSource === 'string' ? this.#pathSource : this.#pathSource()
  }
}

export function parseWindowState(value: unknown): StoredWindowState {
  if (!isRecord(value) || value.version !== 1) return structuredClone(EMPTY_WINDOW_STATE)
  return {
    version: 1,
    bounds: parseBounds(value.bounds),
    isMaximized: value.isMaximized === true
  }
}

// Pure validation/clamping: callers inject the current display rectangles so
// saved bounds can be rejected when no connected display overlaps them.
export function resolveWindowState(
  state: StoredWindowState,
  displays: readonly WindowBounds[],
  limits: WindowStateLimits
): ResolvedWindowState {
  const fallback: ResolvedWindowState = {
    bounds: {
      width: Math.max(limits.defaultWidth, limits.minWidth),
      height: Math.max(limits.defaultHeight, limits.minHeight)
    },
    isMaximized: state.isMaximized
  }
  if (state.bounds === null) return fallback
  const bounds: WindowBounds = {
    x: Math.round(state.bounds.x),
    y: Math.round(state.bounds.y),
    width: Math.max(Math.round(state.bounds.width), limits.minWidth),
    height: Math.max(Math.round(state.bounds.height), limits.minHeight)
  }
  if (!displays.some((display) => intersects(bounds, display))) return fallback
  return { bounds, isMaximized: state.isMaximized }
}

function parseBounds(value: unknown): WindowBounds | null {
  if (!isRecord(value)) return null
  const { x, y, width, height } = value
  if (typeof x !== 'number' || !Number.isFinite(x)) return null
  if (typeof y !== 'number' || !Number.isFinite(y)) return null
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return null
  return { x, y, width, height }
}

function intersects(a: WindowBounds, b: WindowBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
