import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_WINDOW_STATE,
  WindowStateStore,
  parseWindowState,
  resolveWindowState
} from '../../src/main/WindowStateStore.js'

const LIMITS = { defaultWidth: 1488, defaultHeight: 1040, minWidth: 920, minHeight: 680 } as const
const DISPLAYS = [{ x: 0, y: 0, width: 2560, height: 1440 }]

describe('WindowStateStore', () => {
  it('falls back to the empty default state when no file has been saved yet', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-window-state-'))
    const store = new WindowStateStore(join(root, 'window-state.json'))
    await expect(store.load()).resolves.toEqual(EMPTY_WINDOW_STATE)
    expect(resolveWindowState(EMPTY_WINDOW_STATE, DISPLAYS, LIMITS)).toEqual({
      bounds: { width: 1488, height: 1040 },
      isMaximized: false
    })
  })

  it('persists and reloads window bounds and the maximized flag', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-window-state-'))
    const path = join(root, 'window-state.json')
    const store = new WindowStateStore(path)
    const state = {
      version: 1 as const,
      bounds: { x: 120, y: 80, width: 1280, height: 900 },
      isMaximized: false
    }
    await store.save(state)
    await expect(store.load()).resolves.toEqual(state)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(state)
  })

  it('serializes queued saves so the latest state wins', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-window-state-'))
    const store = new WindowStateStore(join(root, 'window-state.json'))
    const latest = {
      version: 1 as const,
      bounds: { x: 10, y: 20, width: 1000, height: 700 },
      isMaximized: false
    }
    await Promise.all([
      store.save({ ...EMPTY_WINDOW_STATE, isMaximized: true }),
      store.save(latest)
    ])
    await expect(store.load()).resolves.toEqual(latest)
  })

  it('safely falls back on corrupted or unexpected disk data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-window-state-invalid-'))
    const path = join(root, 'window-state.json')
    await writeFile(path, '{bad json')
    await expect(new WindowStateStore(path).load()).resolves.toEqual(EMPTY_WINDOW_STATE)
    await writeFile(path, JSON.stringify({ version: 2, bounds: { x: 1, y: 2, width: 3, height: 4 } }))
    await expect(new WindowStateStore(path).load()).resolves.toEqual(EMPTY_WINDOW_STATE)
    expect(parseWindowState({
      version: 1,
      bounds: { x: 0, y: 0, width: 'wide', height: 900 },
      isMaximized: 'yes'
    })).toEqual(EMPTY_WINDOW_STATE)
  })

  it('restores saved bounds when they intersect a connected display', () => {
    const resolved = resolveWindowState(
      { version: 1, bounds: { x: 100, y: 60, width: 1200, height: 800 }, isMaximized: true },
      DISPLAYS,
      LIMITS
    )
    expect(resolved).toEqual({
      bounds: { x: 100, y: 60, width: 1200, height: 800 },
      isMaximized: true
    })
  })

  it('falls back to centered default size when saved bounds intersect no display', () => {
    const resolved = resolveWindowState(
      { version: 1, bounds: { x: -8000, y: -6000, width: 1200, height: 800 }, isMaximized: true },
      DISPLAYS,
      LIMITS
    )
    expect(resolved.bounds).toEqual({ width: 1488, height: 1040 })
    expect(resolved.bounds.x).toBeUndefined()
    expect(resolved.bounds.y).toBeUndefined()
    expect(resolved.isMaximized).toBe(true)
  })

  it('clamps restored bounds to the minimum window size', () => {
    const resolved = resolveWindowState(
      { version: 1, bounds: { x: 40, y: 30, width: 100, height: 50 }, isMaximized: false },
      DISPLAYS,
      LIMITS
    )
    expect(resolved.bounds).toEqual({ x: 40, y: 30, width: 920, height: 680 })
  })
})
