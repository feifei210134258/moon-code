import { homedir } from 'node:os'
import semver from 'semver'
import { spawn, type IPty } from 'node-pty'
import type { KimiCliUpdateState, RuntimeDiscovery } from '../../shared/contracts.js'
import { discoverRuntimes } from './discovery.js'

const LATEST_MANIFEST_URL = 'https://code.kimi.com/kimi-code/latest.json'
const CHECK_TIMEOUT_MS = 10_000
const INSTALL_TIMEOUT_MS = 5 * 60_000

type FetchLike = typeof fetch
type SpawnPty = typeof spawn

interface KimiCliUpdateServiceOptions {
  discoverRuntimes?: () => Promise<RuntimeDiscovery>
  fetch?: FetchLike
  spawnPty?: SpawnPty
  now?: () => Date
  installTimeoutMs?: number
}

interface LatestManifest {
  version: string
}

export class KimiCliUpdateService {
  readonly #discoverRuntimes: () => Promise<RuntimeDiscovery>
  readonly #fetch: FetchLike
  readonly #spawnPty: SpawnPty
  readonly #now: () => Date
  readonly #installTimeoutMs: number
  #state: KimiCliUpdateState = emptyState()
  #installPromise: Promise<KimiCliUpdateState> | null = null

  constructor(options: KimiCliUpdateServiceOptions = {}) {
    this.#discoverRuntimes = options.discoverRuntimes ?? discoverRuntimes
    this.#fetch = options.fetch ?? fetch
    this.#spawnPty = options.spawnPty ?? spawn
    this.#now = options.now ?? (() => new Date())
    this.#installTimeoutMs = options.installTimeoutMs ?? INSTALL_TIMEOUT_MS
  }

  get state(): KimiCliUpdateState {
    return { ...this.#state }
  }

  async check(): Promise<KimiCliUpdateState> {
    if (this.#installPromise !== null) return this.state
    return await this.#check()
  }

  async #check(): Promise<KimiCliUpdateState> {
    this.#state = { ...this.#state, phase: 'checking', error: null }
    try {
      const [discovery, latest] = await Promise.all([
        this.#discoverRuntimes(),
        this.#loadLatestManifest()
      ])
      const currentVersion = normalizeVersion(discovery.system.version)
      if (discovery.system.executable === null || currentVersion === null) {
        throw new Error(discovery.system.executable === null
          ? '未发现可更新的系统 Kimi Code CLI。'
          : '无法识别当前 Kimi Code CLI 版本。')
      }
      this.#state = {
        phase: semver.gt(latest.version, currentVersion) ? 'available' : 'up-to-date',
        currentVersion,
        latestVersion: latest.version,
        executable: discovery.system.executable,
        checkedAt: this.#now().toISOString(),
        error: null,
        requiresRestart: false
      }
    } catch (error) {
      this.#state = {
        ...this.#state,
        phase: 'error',
        checkedAt: this.#now().toISOString(),
        error: errorMessage(error),
        requiresRestart: false
      }
    }
    return this.state
  }

  async install(): Promise<KimiCliUpdateState> {
    if (this.#installPromise !== null) return await this.#installPromise
    this.#installPromise = this.#install()
    try {
      return await this.#installPromise
    } finally {
      this.#installPromise = null
    }
  }

  async #install(): Promise<KimiCliUpdateState> {
    const checked = this.#state.phase === 'available' ? this.state : await this.#check()
    if (checked.phase !== 'available' || checked.executable === null || checked.latestVersion === null) {
      return checked
    }
    this.#state = { ...checked, phase: 'downloading', error: null }
    try {
      await runOfficialUpgrade(checked.executable, this.#spawnPty, this.#installTimeoutMs)
      const discovery = await this.#discoverRuntimes()
      const installedVersion = normalizeVersion(discovery.system.version)
      if (installedVersion === null || semver.lt(installedVersion, checked.latestVersion)) {
        throw new Error(`Kimi Code CLI 更新未完成，仍为 ${installedVersion ?? '未知版本'}。`)
      }
      this.#state = {
        phase: 'installed',
        currentVersion: installedVersion,
        latestVersion: checked.latestVersion,
        executable: discovery.system.executable ?? checked.executable,
        checkedAt: this.#now().toISOString(),
        error: null,
        requiresRestart: true
      }
    } catch (error) {
      this.#state = {
        ...checked,
        phase: 'error',
        checkedAt: this.#now().toISOString(),
        error: errorMessage(error),
        requiresRestart: false
      }
    }
    return this.state
  }

  async #loadLatestManifest(): Promise<LatestManifest> {
    const response = await this.#fetch(LATEST_MANIFEST_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error(`Kimi 更新服务返回 HTTP ${response.status}。`)
    const value = await response.json() as unknown
    if (value === null || typeof value !== 'object' || !('version' in value)) {
      throw new Error('Kimi 更新清单格式无效。')
    }
    const version = normalizeVersion((value as { version?: unknown }).version)
    if (version === null) throw new Error('Kimi 更新清单中的版本无效。')
    return { version }
  }
}

async function runOfficialUpgrade(
  executable: string,
  spawnPty: SpawnPty,
  timeoutMs: number
): Promise<void> {
  const terminal = spawnPty(executable, ['update'], {
    name: 'xterm-256color',
    cwd: homedir(),
    cols: 100,
    rows: 28,
    env: processEnvironment()
  })
  await waitForUpgrade(terminal, timeoutMs)
}

async function waitForUpgrade(terminal: IPty, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = ''
    let confirmed = false
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let dataSubscription: { dispose(): void } = { dispose() {} }
    let exitSubscription: { dispose(): void } = { dispose() {} }
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      dataSubscription.dispose()
      exitSubscription.dispose()
      if (error === undefined) resolve()
      else reject(error)
    }
    dataSubscription = terminal.onData((data) => {
      output = `${output}${data}`.slice(-32_768)
      if (!confirmed && output.includes('Install update now')) {
        confirmed = true
        try {
          terminal.write('\r')
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      }
    })
    exitSubscription = terminal.onExit((event) => {
      if (event.exitCode === 0 && confirmed) finish()
      else {
        const detail = cleanTerminalOutput(output).slice(-600)
        finish(new Error(detail.length > 0
          ? `Kimi Code CLI 更新失败：${detail}`
          : `Kimi Code CLI 更新进程异常退出（${event.exitCode}）。`))
      }
    })
    timer = setTimeout(() => {
      try { terminal.kill() } catch {}
      finish(new Error('Kimi Code CLI 更新超时，请稍后重试。'))
    }, timeoutMs)
  })
}

function emptyState(): KimiCliUpdateState {
  return {
    phase: 'idle',
    currentVersion: null,
    latestVersion: null,
    executable: null,
    checkedAt: null,
    error: null,
    requiresRestart: false
  }
}

function normalizeVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const version = semver.valid(value.trim())
  return version === null ? null : version
}

function processEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
}

function cleanTerminalOutput(value: string): string {
  return value
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export { LATEST_MANIFEST_URL }
