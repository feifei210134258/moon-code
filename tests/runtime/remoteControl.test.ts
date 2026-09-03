import { EventEmitter } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'
import { RemoteControlPreferencesStore } from '../../src/main/runtime/RemoteControlPreferencesStore.js'
import {
  KimiRemoteControlBridge,
  defaultKimiRcLockPath,
  defaultKimiRcQrPath
} from '../../src/main/kimi/KimiRemoteControlBridge.js'

const servers: Server[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('KimiRuntimeManager remote-control launch preference', () => {
  it('connects without the ready line when remote control replaces stdout with the RC banner', { timeout: 15_000 }, async () => {
    // RC 模式下 kimi web 的 stdout 只有横幅/二维码，没有
    // `Kimi server: <origin>#token=` 就绪行；就绪探测必须走
    // healthz 轮询 + 共享 token 文件路径。
    let activeChild: FakeChild | null = null
    const { origin, token } = await startRuntimeProtocolServer(() => activeChild?.kill())
    const spawnImpl = vi.fn(() => {
      const child = new FakeChild()
      activeChild = child
      queueMicrotask(() => child.stdout.emit('data', Buffer.from(
        `  Kimi Remote Control ready  0.39.0 (experimental)\n  ✓ Connected to code-rc.kimi.com…\n`
      )))
      return child
    })
    const manager = new KimiRuntimeManager({
      startupTimeoutMs: 4_000,
      spawnImpl: spawnImpl as never,
      readSharedToken: async () => token,
      sharedOrigin: origin,
      remoteControlPreferencesStore: { load: async () => ({ enabled: true }) },
      discoverRuntimes: async () => ({
        supportedRange: '>=0.29.2',
        managed: {
          kind: 'managed', version: '0.39.0', executable: '/managed.mjs', compatible: true, reason: null
        },
        system: {
          kind: 'system', version: '0.39.0', executable: '/usr/local/bin/kimi', compatible: true, reason: null
        }
      })
    })

    // 轮询间隔 400ms：给 3 秒预算避免计时器粒度导致的 flake
    await expect(manager.start('system')).resolves.toEqual(expect.objectContaining({
      status: 'running', mode: 'system', version: '0.39.0'
    }))
    expect(manager.appliedRemoteControlEnabled).toBe(true)
    await manager.stop()
  })

  it('appends --remote-control and sets the experiment env when the preference is enabled', async () => {
    let activeChild: FakeChild | null = null
    const { origin } = await startRuntimeProtocolServer(() => activeChild?.kill())
    const spawnImpl = vi.fn((_executable, _args, options) => {
      const child = new FakeChild()
      activeChild = child
      queueMicrotask(() => child.stdout.emit('data', Buffer.from(
        `Kimi server: ${origin}#token=runtime-test-token\n`
      )))
      return child
    })
    const manager = new KimiRuntimeManager({
      spawnImpl: spawnImpl as never,
      readSharedToken: async () => null,
      remoteControlPreferencesStore: { load: async () => ({ enabled: true }) },
      discoverRuntimes: async () => ({
        supportedRange: '>=0.29.2',
        managed: {
          kind: 'managed', version: '0.39.0', executable: '/managed.mjs', compatible: true, reason: null
        },
        system: {
          kind: 'system', version: '0.39.0', executable: '/usr/local/bin/kimi', compatible: true, reason: null
        }
      })
    })

    await expect(manager.start('system')).resolves.toEqual(expect.objectContaining({
      status: 'running', mode: 'system', version: '0.39.0'
    }))
    const args = spawnImpl.mock.calls[0]?.[1] as string[]
    expect(args).toContain('--remote-control')
    const env = spawnImpl.mock.calls[0]?.[2]?.env as NodeJS.ProcessEnv
    expect(env.KIMI_CODE_EXPERIMENTAL_REMOTE_CONTROL).toBe('1')
    expect(manager.appliedRemoteControlEnabled).toBe(true)

    await manager.stop()
  })

  it('launches without remote control flags and disables the env when the preference is off', async () => {
    let activeChild: FakeChild | null = null
    const { origin } = await startRuntimeProtocolServer(() => activeChild?.kill())
    const spawnImpl = vi.fn((_executable, _args, options) => {
      const child = new FakeChild()
      activeChild = child
      queueMicrotask(() => child.stdout.emit('data', Buffer.from(
        `Kimi server: ${origin}#token=runtime-test-token\n`
      )))
      return child
    })
    const manager = new KimiRuntimeManager({
      spawnImpl: spawnImpl as never,
      readSharedToken: async () => null,
      remoteControlPreferencesStore: { load: async () => ({ enabled: false }) },
      discoverRuntimes: async () => ({
        supportedRange: '>=0.29.2',
        managed: {
          kind: 'managed', version: '0.39.0', executable: '/managed.mjs', compatible: true, reason: null
        },
        system: {
          kind: 'system', version: '0.39.0', executable: '/usr/local/bin/kimi', compatible: true, reason: null
        }
      })
    })

    await expect(manager.start('system')).resolves.toEqual(expect.objectContaining({ status: 'running' }))
    const args = spawnImpl.mock.calls[0]?.[1] as string[]
    expect(args).not.toContain('--remote-control')
    const env = spawnImpl.mock.calls[0]?.[2]?.env as NodeJS.ProcessEnv
    expect(env.KIMI_CODE_EXPERIMENTAL_REMOTE_CONTROL).toBe('0')
    expect(manager.appliedRemoteControlEnabled).toBe(false)

    await manager.stop()
  })
})

describe('KimiRemoteControlBridge', () => {
  it('reports inactive when rc.json is missing and reads url/qr when the holder process is alive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'moon-rc-test-'))
    tempDirs.push(dir)
    const lockPath = join(dir, 'rc.json')
    const qrPath = join(dir, 'rc-qrcode.png')
    const runtime = new KimiRuntimeManager({
      readSharedToken: async () => null,
      remoteControlPreferencesStore: { load: async () => ({ enabled: true }) }
    })
    const bridge = new KimiRemoteControlBridge(
      runtime,
      { load: async () => ({ enabled: true }), save: async () => {} },
      { rcLockPath: lockPath, rcQrPath: qrPath, watchImpl: () => new EventEmitter() as never }
    )

    const inactive = await bridge.getState()
    expect(inactive.active).toBe(false)
    expect(inactive.url).toBeNull()
    expect(inactive.qrCodeDataUrl).toBeNull()
    // owned runtime 未启动：appliedEnabled 为 null，requiresRestart 为 false
    expect(inactive.appliedEnabled).toBeNull()
    expect(inactive.requiresRestart).toBe(false)

    // 活的 pid（本测试进程）+ rc.json + 二维码 → active
    await writeFile(lockPath, JSON.stringify({
      pid: process.pid,
      nonce: 'abc123',
      local_origin: 'http://127.0.0.1:58627',
      device_id: 'dev-1234567890',
      url: 'https://code-rc.kimi.com/devices/dev-1234567890/',
      started_at: 1_756_300_000_000
    }))
    await writeFile(qrPath, Buffer.from('89504e470d0a1a0a', 'hex'))

    const active = await bridge.getState()
    expect(active.active).toBe(true)
    expect(active.url).toBe('https://code-rc.kimi.com/devices/dev-1234567890/')
    expect(active.deviceId).toBe('dev-1234567890')
    expect(active.startedAt).toBe(1_756_300_000_000)
    expect(active.qrCodeDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('treats a stale lock (dead pid) as inactive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'moon-rc-test-'))
    tempDirs.push(dir)
    const lockPath = join(dir, 'rc.json')
    await writeFile(lockPath, JSON.stringify({
      pid: 999_999_999,
      nonce: 'abc123',
      local_origin: 'http://127.0.0.1:58627',
      device_id: 'dev-x',
      url: 'https://code-rc.kimi.com/devices/dev-x/',
      started_at: 1
    }))
    const runtime = new KimiRuntimeManager({ readSharedToken: async () => null })
    const bridge = new KimiRemoteControlBridge(
      runtime,
      { load: async () => ({ enabled: false }), save: async () => {} },
      { rcLockPath: lockPath, rcQrPath: join(dir, 'rc-qrcode.png'), watchImpl: () => new EventEmitter() as never }
    )
    const state = await bridge.getState()
    expect(state.active).toBe(false)
    expect(state.url).toBeNull()
  })

  it('persists the enabled flag through the preferences store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'moon-rc-test-'))
    tempDirs.push(dir)
    const store = new RemoteControlPreferencesStore(join(dir, 'preferences.json'))
    await store.save({ enabled: true })
    expect(await readFile(join(dir, 'preferences.json'), 'utf8')).toContain('"enabled": true')
    expect(await store.load()).toEqual({ enabled: true })
    await store.save({ enabled: false })
    expect(await store.load()).toEqual({ enabled: false })
  })
})

describe('remote control file paths', () => {
  it('resolves rc.json and the qr code inside ~/.kimi-code', () => {
    // 分隔符跟随宿主平台（Windows 为 \）：仅 Windows 归一化，POSIX 保持严格全等
    const normalize = (value: string): string =>
      process.platform === 'win32' ? value.split(/[\\/]+/).join('/') : value
    expect(normalize(defaultKimiRcLockPath('/home/user'))).toBe('/home/user/.kimi-code/server/rc.json')
    expect(normalize(defaultKimiRcQrPath('/home/user'))).toBe('/home/user/.kimi-code/rc-qrcode.png')
  })
})

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  exitCode: number | null = null

  kill(): boolean {
    if (this.exitCode !== null) return false
    this.exitCode = 0
    this.emit('exit', 0, null)
    return true
  }
}

async function startRuntimeProtocolServer(onShutdown: () => void): Promise<{ origin: string; token: string }> {
  const token = 'remote-control-shared-token'
  const server = createServer((request, response) => {
    if (request.url === '/api/v1/healthz') {
      response.writeHead(200).end('ok')
      return
    }
    if (request.url === '/api/v1/meta') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        code: 0,
        msg: 'ok',
        data: {
          server_version: '0.39.0',
          capabilities: {},
          server_id: 'remote-control-test',
          started_at: '2026-08-27T00:00:00.000Z',
          dangerous_bypass_auth: false,
          backend: 'v2'
        }
      }))
      return
    }
    if (request.url === '/api/v1/shutdown' && request.method === 'POST') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        code: 0, msg: 'ok', data: {}
      }))
      setTimeout(onShutdown, 10)
      return
    }
    response.writeHead(404).end()
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token }
}
