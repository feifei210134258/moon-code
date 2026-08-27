import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type {
  RemoteControlPreference,
  RemoteControlState
} from '../../shared/contracts.js'
import type { RemoteControlPreferencesStore } from '../runtime/RemoteControlPreferencesStore.js'

export function defaultKimiRcLockPath(homeDirectory: string = homedir()): string {
  return join(homeDirectory, '.kimi-code', 'server', 'rc.json')
}

export function defaultKimiRcQrPath(homeDirectory: string = homedir()): string {
  return join(homeDirectory, '.kimi-code', 'rc-qrcode.png')
}

interface RemoteControlLock {
  pid: number
  url: string
  deviceId: string
  startedAt: number
}

interface RemoteControlBridgeOptions {
  rcLockPath?: string
  rcQrPath?: string
  watchImpl?: typeof watch
  /** 轮询兜底间隔：rc.json 原子替换在部分文件系统上不触发 rename 事件。 */
  pollMs?: number
}

/**
 * 只读桥接 Kimi Remote Control 的落盘状态：`~/.kimi-code/server/rc.json`
 * （kimi-code 0.39 写入，含设备链接/设备 id/启动时间）与 `rc-qrcode.png`。
 *
 * Moon Code 不解析或改写 Kimi 的任何凭据/配置——rc.json 是 kimi 官方
 * Remote Control 客户端自己写的公开引导信息（URL 不含 token）。
 */
export class KimiRemoteControlBridge extends EventEmitter {
  readonly #runtime: KimiRuntimeManager
  readonly #preferencesStore: Pick<RemoteControlPreferencesStore, 'load' | 'save'>
  readonly #rcLockPath: string
  readonly #rcQrPath: string
  readonly #watchImpl: typeof watch
  readonly #pollMs: number
  #watcher: FSWatcher | null = null
  #pollTimer: NodeJS.Timeout | null = null
  #state: RemoteControlState | null = null

  constructor(
    runtime: KimiRuntimeManager,
    preferencesStore: Pick<RemoteControlPreferencesStore, 'load' | 'save'>,
    options: RemoteControlBridgeOptions = {}
  ) {
    super()
    this.#runtime = runtime
    this.#preferencesStore = preferencesStore
    this.#rcLockPath = options.rcLockPath ?? defaultKimiRcLockPath()
    this.#rcQrPath = options.rcQrPath ?? defaultKimiRcQrPath()
    this.#watchImpl = options.watchImpl ?? watch
    this.#pollMs = options.pollMs ?? 5_000
  }

  async getState(): Promise<RemoteControlState> {
    const [preference, lock, qrDataUrl] = await Promise.all([
      this.#preferencesStore.load(),
      this.#readLock(),
      this.#readQr()
    ])
    const runtime = this.#runtime.state
    const ownedRuntime = runtime.mode === 'managed' || runtime.mode === 'system'
    const appliedEnabled = this.#runtime.appliedRemoteControlEnabled
    const lockAlive = lock !== null && this.#isLockAlive(lock)
    return {
      preference,
      runtimeMode: runtime.mode,
      appliedEnabled,
      requiresRestart: ownedRuntime && appliedEnabled !== preference.enabled,
      active: lockAlive,
      url: lockAlive ? lock!.url : null,
      deviceId: lockAlive ? lock!.deviceId : null,
      startedAt: lockAlive ? lock!.startedAt : null,
      qrCodeDataUrl: lockAlive ? qrDataUrl : null
    }
  }

  async setEnabled(enabled: boolean): Promise<RemoteControlState> {
    await this.#preferencesStore.save({ enabled })
    return await this.getState()
  }

  /** 随主窗口生命周期启动：watch rc.json 目录 + 低频轮询兜底。 */
  startWatching(): void {
    if (this.#watcher !== null) return
    try {
      this.#watcher = this.#watchImpl(dirname(this.#rcLockPath), () => {
        this.#emitState('changed')
      })
      this.#watcher.on('error', () => this.#stopWatcher())
    } catch {
      this.#watcher = null
    }
    if (this.#pollTimer === null) {
      this.#pollTimer = setInterval(() => this.#emitState('poll'), this.#pollMs)
      this.#pollTimer.unref()
    }
  }

  stopWatching(): void {
    this.#stopWatcher()
    if (this.#pollTimer !== null) {
      clearInterval(this.#pollTimer)
      this.#pollTimer = null
    }
  }

  #stopWatcher(): void {
    if (this.#watcher !== null) {
      this.#watcher.close()
      this.#watcher = null
    }
  }

  async #emitState(_reason: string): Promise<void> {
    const state = await this.getState()
    if (
      this.#state === null ||
      this.#state.active !== state.active ||
      this.#state.url !== state.url ||
      this.#state.appliedEnabled !== state.appliedEnabled ||
      this.#state.requiresRestart !== state.requiresRestart
    ) {
      this.#state = state
      this.emit('state-changed', state)
    }
  }

  async #readLock(): Promise<RemoteControlLock | null> {
    try {
      const raw = JSON.parse(await readFile(this.#rcLockPath, 'utf8'))
      if (
        typeof raw.pid !== 'number' ||
        typeof raw.url !== 'string' ||
        typeof raw.device_id !== 'string' ||
        typeof raw.started_at !== 'number'
      ) return null
      return { pid: raw.pid, url: raw.url, deviceId: raw.device_id, startedAt: raw.started_at }
    } catch {
      return null
    }
  }

  async #readQr(): Promise<string | null> {
    try {
      const png = await readFile(this.#rcQrPath)
      return `data:image/png;base64,${png.toString('base64')}`
    } catch {
      return null
    }
  }

  #isLockAlive(lock: RemoteControlLock): boolean {
    // kimi 用 O_EXCL 创建 rc.json 并在退出时删除；文件存在但进程已死视为过期
    // （macOS 上 process.kill(pid, 0) 对不存在的进程抛 ESRCH）。
    try {
      process.kill(lock.pid, 0)
      return true
    } catch {
      return false
    }
  }
}

export type { RemoteControlPreference }
