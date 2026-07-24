import { describe, expect, it, vi } from 'vitest'
import type { spawn } from 'node-pty'
import { runPackagedPtySmoke } from '../../src/main/packagedPtySmoke.js'

describe('runPackagedPtySmoke', () => {
  it('waits for the native PTY exit after observing the marker', async () => {
    const onData = vi.fn<(data: string) => void>()
    const onExit = vi.fn<(event: { exitCode: number; signal?: number }) => void>()
    const kill = vi.fn()
    const spawnPty = vi.fn(() => ({
      onData: (listener: (data: string) => void) => {
        onData.mockImplementation(listener)
        return { dispose: vi.fn() }
      },
      onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => {
        onExit.mockImplementation(listener)
        return { dispose: vi.fn() }
      },
      write: vi.fn(),
      kill
    })) as unknown as typeof spawn

    let settled = false
    const operation = runPackagedPtySmoke(1_000, spawnPty).then(() => { settled = true })
    onData('KIMI_PACKAGED_PTY_OK\r\n')
    await Promise.resolve()

    expect(kill).toHaveBeenCalledOnce()
    expect(settled).toBe(false)

    onExit({ exitCode: 0 })
    await operation
    expect(settled).toBe(true)
  })
})
