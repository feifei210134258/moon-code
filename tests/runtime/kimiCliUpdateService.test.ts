import type { IPty } from 'node-pty'
import { describe, expect, it, vi } from 'vitest'
import { KimiCliUpdateService, LATEST_MANIFEST_URL } from '../../src/main/runtime/KimiCliUpdateService.js'
import type { RuntimeDiscovery } from '../../src/shared/contracts.js'

function discovery(
  version: string | null,
  executable: string | null = '/Users/test/.kimi-code/bin/kimi'
): RuntimeDiscovery {
  return {
    supportedRange: '>=0.29.0 <0.30.0',
    managed: {
      kind: 'managed', version: '0.29.0', executable: '/app/kimi.mjs', compatible: true, reason: null
    },
    system: {
      kind: 'system', version, executable, compatible: version !== null, reason: null
    }
  }
}

function manifest(version: string): Response {
  return new Response(JSON.stringify({ schemaVersion: 1, version }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

describe('KimiCliUpdateService', () => {
  it('checks the official Kimi manifest and reports an available system CLI update', async () => {
    const fetchLatest = vi.fn(async () => manifest('0.29.1'))
    const service = new KimiCliUpdateService({
      discoverRuntimes: vi.fn(async () => discovery('0.29.0')),
      fetch: fetchLatest as typeof fetch,
      now: () => new Date('2026-07-26T01:02:03.000Z')
    })

    await expect(service.check()).resolves.toEqual({
      phase: 'available',
      currentVersion: '0.29.0',
      latestVersion: '0.29.1',
      executable: '/Users/test/.kimi-code/bin/kimi',
      checkedAt: '2026-07-26T01:02:03.000Z',
      error: null,
      requiresRestart: false
    })
    expect(fetchLatest).toHaveBeenCalledWith(
      LATEST_MANIFEST_URL,
      expect.objectContaining({ headers: { accept: 'application/json' } })
    )
  })

  it('reports a useful error when no system Kimi CLI is installed', async () => {
    const service = new KimiCliUpdateService({
      discoverRuntimes: vi.fn(async () => discovery(null, null)),
      fetch: vi.fn(async () => manifest('0.29.1')) as typeof fetch
    })

    const state = await service.check()

    expect(state.phase).toBe('error')
    expect(state.error).toContain('未发现可更新的系统 Kimi Code CLI')
  })

  it('confirms the official interactive update and verifies the installed version', async () => {
    let onData: ((data: string) => void) | null = null
    let onExit: ((event: { exitCode: number; signal?: number }) => void) | null = null
    const write = vi.fn()
    const terminal = {
      onData(listener: (data: string) => void) {
        onData = listener
        return { dispose: vi.fn() }
      },
      onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
        onExit = listener
        return { dispose: vi.fn() }
      },
      write,
      kill: vi.fn()
    } as unknown as IPty
    const spawnPty = vi.fn(() => terminal)
    const discover = vi.fn()
      .mockResolvedValueOnce(discovery('0.29.0'))
      .mockResolvedValueOnce(discovery('0.29.1'))
    const service = new KimiCliUpdateService({
      discoverRuntimes: discover,
      fetch: vi.fn(async () => manifest('0.29.1')) as typeof fetch,
      spawnPty: spawnPty as unknown as typeof import('node-pty').spawn,
      now: () => new Date('2026-07-26T02:00:00.000Z')
    })
    await service.check()

    const installing = service.install()
    expect(spawnPty).toHaveBeenCalledWith(
      '/Users/test/.kimi-code/bin/kimi',
      ['update'],
      expect.objectContaining({ name: 'xterm-256color' })
    )
    expect(onData).not.toBeNull()
    onData!('Current 0.29.0\r\n ❯ Install update now (0.29.1)')
    expect(write).toHaveBeenCalledWith('\r')
    expect(onExit).not.toBeNull()
    onExit!({ exitCode: 0 })

    await expect(installing).resolves.toEqual(expect.objectContaining({
      phase: 'installed',
      currentVersion: '0.29.1',
      latestVersion: '0.29.1',
      requiresRestart: true
    }))
  })
})
