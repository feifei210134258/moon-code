import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import type {
  KimiSecondaryModelAppliedSource,
  KimiSecondaryModelPreference,
  RuntimeDiscovery,
  RuntimeExternalConnectionInput,
  RuntimePublicState
} from '../../shared/contracts.js'
import { KimiRestClient } from '../kimi/KimiRestClient.js'
import { KimiWsClient } from '../../../packages/kimi-adapter/src/transport/KimiWsClient.js'
import { discoverRuntimes, resolveManagedKimiEntry } from './discovery.js'
import { parseRuntimeReadyOutput, redactRuntimeOutput } from './readyLine.js'
import {
  DEFAULT_SECONDARY_MODEL_PREFERENCE,
  type SecondaryModelPreferencesStore
} from './SecondaryModelPreferencesStore.js'
import {
  DEFAULT_REMOTE_CONTROL_PREFERENCE,
  type RemoteControlPreferencesStore
} from './RemoteControlPreferencesStore.js'

interface RuntimeConnection {
  origin: string
  token: string
  serverId: string
  version: string
  backend: 'v1' | 'v2'
}

interface RuntimeManagerOptions {
  startupTimeoutMs?: number
  spawnImpl?: typeof spawn
  discoverRuntimes?: () => Promise<RuntimeDiscovery>
  readSharedToken?: () => Promise<string | null>
  sharedOrigin?: string
  clientVersion?: string
  secondaryModelPreferencesStore?: Pick<SecondaryModelPreferencesStore, 'load'>
  remoteControlPreferencesStore?: Pick<RemoteControlPreferencesStore, 'load'>
}

type RuntimeChild = ChildProcessByStdio<null, Readable, Readable>

const DEFAULT_SHARED_KIMI_WEB_ORIGIN = 'http://127.0.0.1:58627'
const DESKTOP_CLIENT_ID = 'kimi-agent-desktop-main'
const SECONDARY_MODEL_EXPERIMENT_ENV = 'KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL'
const EXPERIMENT_MASTER_ENV = 'KIMI_CODE_EXPERIMENTAL_FLAG'
const SECONDARY_MODEL_ENV = 'KIMI_SECONDARY_MODEL'
const SECONDARY_EFFORT_ENV = 'KIMI_SECONDARY_EFFORT'
export const REMOTE_CONTROL_EXPERIMENT_ENV = 'KIMI_CODE_EXPERIMENTAL_REMOTE_CONTROL'

async function readSharedKimiWebToken(): Promise<string | null> {
  try {
    const token = (await readFile(join(homedir(), '.kimi-code', 'server.token'), 'utf8')).trim()
    return token.length > 0 ? token : null
  } catch {
    return null
  }
}

export class KimiRuntimeManager extends EventEmitter {
  readonly #startupTimeoutMs: number
  readonly #spawn: typeof spawn
  readonly #discoverRuntimes: () => Promise<RuntimeDiscovery>
  readonly #readSharedToken: () => Promise<string | null>
  readonly #sharedOrigin: string
  readonly #clientVersion: string
  readonly #secondaryModelPreferencesStore: Pick<SecondaryModelPreferencesStore, 'load'> | null
  readonly #remoteControlPreferencesStore: Pick<RemoteControlPreferencesStore, 'load'> | null
  #process: RuntimeChild | null = null
  #connection: RuntimeConnection | null = null
  #appliedSecondaryModelPreference: KimiSecondaryModelPreference | null = null
  #appliedSecondaryModelSource: KimiSecondaryModelAppliedSource | null = null
  #appliedRemoteControlEnabled: boolean | null = null
  #state: RuntimePublicState = {
    status: 'stopped',
    mode: null,
    version: null,
    serverId: null,
    origin: null,
    error: null
  }

  constructor(options: RuntimeManagerOptions = {}) {
    super()
    this.#startupTimeoutMs = options.startupTimeoutMs ?? 20_000
    this.#spawn = options.spawnImpl ?? spawn
    this.#discoverRuntimes = options.discoverRuntimes ?? discoverRuntimes
    this.#readSharedToken = options.readSharedToken ?? readSharedKimiWebToken
    this.#sharedOrigin = (options.sharedOrigin ?? DEFAULT_SHARED_KIMI_WEB_ORIGIN).replace(/\/$/, '')
    this.#clientVersion = options.clientVersion ?? '0.0.0-dev'
    this.#secondaryModelPreferencesStore = options.secondaryModelPreferencesStore ?? null
    this.#remoteControlPreferencesStore = options.remoteControlPreferencesStore ?? null
  }

  get state(): RuntimePublicState {
    return { ...this.#state }
  }

  get backend(): 'v1' | 'v2' | null {
    return this.#connection?.backend ?? null
  }

  get appliedSecondaryModelPreference(): KimiSecondaryModelPreference | null {
    return this.#appliedSecondaryModelPreference === null
      ? null
      : { ...this.#appliedSecondaryModelPreference }
  }

  get appliedSecondaryModelSource(): KimiSecondaryModelAppliedSource | null {
    return this.#appliedSecondaryModelSource
  }

  /** 本次 owned Runtime 启动时 Remote Control 的生效状态；null = 非 owned/未启动。 */
  get appliedRemoteControlEnabled(): boolean | null {
    return this.#appliedRemoteControlEnabled
  }

  createRestClient(): KimiRestClient {
    const connection = this.#connection
    if (connection === null) throw new Error('Kimi runtime is not connected')
    return new KimiRestClient({
      origin: connection.origin,
      token: connection.token,
      identity: {
        clientId: DESKTOP_CLIENT_ID,
        clientName: 'moon-code-desktop',
        clientVersion: this.#clientVersion,
        clientUiMode: 'desktop'
      }
    })
  }

  createWsClient(options: { clientId?: string } = {}): KimiWsClient {
    const connection = this.#connection
    if (connection === null) throw new Error('Kimi runtime is not connected')
    return new KimiWsClient({
      origin: connection.origin,
      token: connection.token,
      clientId: options.clientId ?? DESKTOP_CLIENT_ID
    })
  }

  async start(mode: 'managed' | 'system' = 'system'): Promise<RuntimePublicState> {
    if (this.#state.status === 'running') {
      return this.state
    }
    if (this.#state.status === 'starting' || this.#state.status === 'stopping') {
      throw new Error(`Kimi runtime is ${this.#state.status}`)
    }

    this.#setState({
      status: 'starting',
      mode,
      version: null,
      serverId: null,
      origin: null,
      error: null
    })

    try {
      const remoteControlPreference = await this.#loadRemoteControlPreference()
      // RC 偏好开启时必须由本进程带 --remote-control 启动；直接连上既有
      // shared server 会静默丢掉 RC（那个进程没有注册中继），所以跳过
      // shared 连接，走下方 owned spawn。偏好关闭时维持原有 shared 优先。
      const sharedConnection = remoteControlPreference.enabled
        ? null
        : await this.#tryConnectSharedRuntime()
      if (sharedConnection !== null) {
        this.#connection = sharedConnection
        this.#setState({
          status: 'running',
          mode: 'shared',
          version: sharedConnection.version,
          serverId: sharedConnection.serverId,
          origin: sharedConnection.origin,
          error: null
        })
        return this.state
      }

      const discovery = await this.#discoverRuntimes()
      const candidate = mode === 'managed' ? discovery.managed : discovery.system
      if (!candidate.compatible || candidate.executable === null) {
        throw new Error(candidate.reason ?? 'Kimi runtime is not compatible')
      }

      const managed = mode === 'managed'
      const executable = managed ? process.execPath : candidate.executable
      const baseArgs = ['web', '--port', '58627', '--no-open', '--log-level', 'error']
      const args = managed
        ? [resolveManagedKimiEntry(), ...baseArgs]
        : [...baseArgs]
      // Remote Control 与 server 同进程（kimi rc ≡ kimi web --remote-control）：
      // 开关只在 owned 启动时生效，需要 Kimi 登录态（refreshToken）才能注册中继。
      if (remoteControlPreference.enabled) args.push('--remote-control')
      const secondaryPreference = await this.#loadSecondaryModelPreference()
      const launchEnvironment = {
        ...process.env,
        NO_COLOR: '1',
        ...(managed && process.versions.electron !== undefined ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        ...(remoteControlPreference.enabled
          ? { [REMOTE_CONTROL_EXPERIMENT_ENV]: '1' }
          : { [REMOTE_CONTROL_EXPERIMENT_ENV]: '0' })
      }
      const child = this.#spawn(executable, args, {
        cwd: process.cwd(),
        env: buildSecondaryModelRuntimeEnvironment(launchEnvironment, secondaryPreference),
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.#process = child

      const connection = await this.#waitUntilReady(child, remoteControlPreference.enabled)
      this.#connection = connection
      this.#appliedSecondaryModelPreference = { ...secondaryPreference }
      this.#appliedSecondaryModelSource = secondaryModelRuntimeSource(
        launchEnvironment,
        secondaryPreference
      )
      this.#appliedRemoteControlEnabled = remoteControlPreference.enabled
      this.#setState({
        status: 'running',
        mode,
        version: connection.version,
        serverId: connection.serverId,
        origin: connection.origin,
        error: null
      })

      child.once('exit', (code, signal) => {
        if (this.#process !== child) return
        this.#process = null
        this.#connection = null
        this.#appliedSecondaryModelPreference = null
        this.#appliedSecondaryModelSource = null
        this.#appliedRemoteControlEnabled = null
        const expected = this.#state.status === 'stopping'
        this.#setState({
          status: expected ? 'stopped' : 'error',
          mode: null,
          version: null,
          serverId: null,
          origin: null,
          error: expected ? null : `Kimi runtime exited (${signal ?? code ?? 'unknown'})`
        })
      })

      return this.state
    } catch (error) {
      this.#process?.kill('SIGTERM')
      this.#process = null
      this.#connection = null
      this.#appliedSecondaryModelPreference = null
      this.#appliedSecondaryModelSource = null
      this.#appliedRemoteControlEnabled = null
      this.#setState({
        status: 'error',
        mode,
        version: null,
        serverId: null,
        origin: null,
        error: error instanceof Error ? error.message : String(error)
      })
      return this.state
    }
  }

  async connectExternal(input: RuntimeExternalConnectionInput): Promise<RuntimePublicState> {
    if (this.#state.status === 'running') return this.state
    if (this.#state.status === 'starting' || this.#state.status === 'stopping') {
      throw new Error(`Kimi runtime is ${this.#state.status}`)
    }
    this.#setState({
      status: 'starting', mode: 'external', version: null, serverId: null, origin: null, error: null
    })
    try {
      const origin = input.origin.replace(/\/$/, '')
      const health = await fetch(`${origin}/api/v1/healthz`)
      if (!health.ok) throw new Error(`Kimi health check failed with HTTP ${health.status}`)
      const connection = await this.#verifyRuntimeConnection(origin, input.token)
      this.#connection = connection
      this.#appliedSecondaryModelPreference = null
      this.#appliedSecondaryModelSource = null
      this.#appliedRemoteControlEnabled = null
      this.#setState({
        status: 'running', mode: 'external', version: connection.version,
        serverId: connection.serverId, origin, error: null
      })
    } catch {
      this.#connection = null
      this.#appliedSecondaryModelPreference = null
      this.#appliedSecondaryModelSource = null
      this.#appliedRemoteControlEnabled = null
      this.#setState({
        status: 'error', mode: 'external', version: null, serverId: null, origin: null,
        error: 'Unable to connect to the protected Kimi Runtime.'
      })
    }
    return this.state
  }

  async stop(): Promise<RuntimePublicState> {
    const child = this.#process
    const connection = this.#connection
    if (child === null) {
      this.#connection = null
      this.#appliedSecondaryModelPreference = null
      this.#appliedSecondaryModelSource = null
      this.#appliedRemoteControlEnabled = null
      this.#setState({
        status: 'stopped',
        mode: null,
        version: null,
        serverId: null,
        origin: null,
        error: null
      })
      return this.state
    }

    this.#setState({ ...this.#state, status: 'stopping', error: null })
    if (connection !== null) {
      try {
        await new KimiRestClient(connection).shutdown()
      } catch {
        child.kill('SIGTERM')
      }
    } else {
      child.kill('SIGTERM')
    }

    await Promise.race([
      new Promise<void>((resolve) => child.once('exit', () => resolve())),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGTERM')
          resolve()
        }, 3_000).unref()
      })
    ])

    this.#process = null
    this.#connection = null
    this.#appliedSecondaryModelPreference = null
    this.#appliedSecondaryModelSource = null
    this.#appliedRemoteControlEnabled = null
    this.#setState({
      status: 'stopped',
      mode: null,
      version: null,
      serverId: null,
      origin: null,
      error: null
    })
    return this.state
  }

  async restart(): Promise<RuntimePublicState> {
    const mode = this.#state.mode
    if (this.#state.status !== 'running' || (mode !== 'managed' && mode !== 'system')) {
      throw new Error('Only a Moon Code-owned Kimi Runtime can be restarted')
    }
    await this.stop()
    return await this.start(mode)
  }

  async #loadSecondaryModelPreference(): Promise<KimiSecondaryModelPreference> {
    if (this.#secondaryModelPreferencesStore === null) {
      return { ...DEFAULT_SECONDARY_MODEL_PREFERENCE }
    }
    return await this.#secondaryModelPreferencesStore.load()
  }

  async #loadRemoteControlPreference(): Promise<{ enabled: boolean }> {
    if (this.#remoteControlPreferencesStore === null) {
      return { ...DEFAULT_REMOTE_CONTROL_PREFERENCE }
    }
    return await this.#remoteControlPreferencesStore.load()
  }

  async #tryConnectSharedRuntime(): Promise<RuntimeConnection | null> {
    const token = await this.#readSharedToken()
    if (token === null) return null
    try {
      const health = await fetch(`${this.#sharedOrigin}/api/v1/healthz`)
      if (!health.ok) return null
    } catch {
      // No Kimi Web Runtime is listening. Starting the system CLI below will
      // create the shared listener on the standard port.
      return null
    }

    try {
      return await this.#verifyRuntimeConnection(this.#sharedOrigin, token)
    } catch {
      // A healthy endpoint with a rejected bearer may be another service or a
      // Kimi server with a rotated token. Do not start a second process on the
      // same port and do not expose token-derived diagnostics to the renderer.
      throw new Error('Unable to verify the shared Kimi Web Runtime.')
    }
  }

  async #verifyRuntimeConnection(origin: string, token: string): Promise<RuntimeConnection> {
    const meta = await new KimiRestClient({ origin, token }).getMeta()
    return {
      origin,
      token,
      serverId: meta.server_id,
      version: meta.server_version,
      backend: meta.backend ?? 'v1'
    }
  }

  /**
   * 普通模式：kimi web 会输出 `Kimi server: <origin>#token=<token>` 就绪行，
   * 解析后经 healthz/meta 验证连接。
   * RC 模式（--remote-control）：stdout 全部换成 RC 横幅与二维码，不再输出
   * 就绪行；server 照常监听 58627 并沿用 ~/.kimi-code/server.token 共享令牌，
   * 因此改为轮询 healthz + 读共享 token 文件验证。
   */
  async #waitUntilReady(child: RuntimeChild, remoteControl: boolean): Promise<RuntimeConnection> {
    return await new Promise<RuntimeConnection>((resolve, reject) => {
      let buffer = ''
      let settled = false
      let timer: NodeJS.Timeout | undefined

      const finish = (error?: Error, connection?: RuntimeConnection): void => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        if (error !== undefined) reject(error)
        else if (connection !== undefined) resolve(connection)
      }

      const inspect = async (chunk: Buffer): Promise<void> => {
        buffer = `${buffer}${chunk.toString('utf8')}`.slice(-16_384)
        const ready = parseRuntimeReadyOutput(buffer)
        if (ready === null || settled) return
        try {
          const health = await fetch(`${ready.origin}/api/v1/healthz`)
          if (!health.ok) throw new Error(`Kimi health check failed with HTTP ${health.status}`)
          finish(undefined, await this.#verifyRuntimeConnection(ready.origin, ready.token))
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      }

      child.stdout.on('data', (chunk: Buffer) => void inspect(chunk))
      child.stderr.on('data', (chunk: Buffer) => {
        buffer = `${buffer}${chunk.toString('utf8')}`.slice(-16_384)
      })
      child.once('error', (error) => finish(error))
      child.once('exit', (code, signal) => {
        finish(new Error(`Kimi runtime exited before ready (${signal ?? code ?? 'unknown'}): ${redactRuntimeOutput(buffer)}`))
      })

      timer = setTimeout(() => {
        finish(new Error(`Kimi runtime did not become ready within ${this.#startupTimeoutMs}ms`))
      }, this.#startupTimeoutMs)
      timer.unref()

      if (remoteControl) {
        void this.#pollUntilRemoteControlReady().then(
          (connection) => finish(undefined, connection),
          (error) => finish(error instanceof Error ? error : new Error(String(error)))
        )
      }
    })
  }

  async #pollUntilRemoteControlReady(): Promise<RuntimeConnection> {
    const origin = this.#sharedOrigin
    const deadline = Date.now() + this.#startupTimeoutMs
    let lastError: Error = new Error('Kimi remote-control runtime did not become ready')
    while (Date.now() < deadline) {
      if (this.#process === null) throw lastError
      await new Promise((resolve) => setTimeout(resolve, 400))
      try {
        const health = await fetch(`${origin}/api/v1/healthz`)
        if (!health.ok) {
          lastError = new Error(`Kimi health check failed with HTTP ${health.status}`)
          continue
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        continue
      }
      const token = await this.#readSharedToken()
      if (token === null) {
        lastError = new Error('Kimi runtime did not publish its shared server token')
        continue
      }
      try {
        return await this.#verifyRuntimeConnection(origin, token)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
    throw lastError
  }

  #setState(next: RuntimePublicState): void {
    this.#state = next
    this.emit('state-changed', this.state)
  }
}

export function buildSecondaryModelRuntimeEnvironment(
  base: NodeJS.ProcessEnv,
  preference: KimiSecondaryModelPreference
): NodeJS.ProcessEnv {
  const env = { ...base }
  if (preference.mode === 'disabled') {
    // Kimi's master experimental flag has higher precedence than the
    // feature-specific flag. Stop inheriting it or a parent value of `1`
    // would silently re-enable secondary-model support.
    delete env[EXPERIMENT_MASTER_ENV]
    delete env[SECONDARY_MODEL_ENV]
    delete env[SECONDARY_EFFORT_ENV]
    env[SECONDARY_MODEL_EXPERIMENT_ENV] = '0'
    return env
  }
  env[SECONDARY_MODEL_EXPERIMENT_ENV] = '1'
  if (preference.mode === 'configured') {
    delete env[SECONDARY_MODEL_ENV]
    delete env[SECONDARY_EFFORT_ENV]
    env[SECONDARY_MODEL_ENV] = preference.model!
    if (preference.defaultEffort !== null) {
      env[SECONDARY_EFFORT_ENV] = preference.defaultEffort
    }
  }
  return env
}

export function secondaryModelRuntimeSource(
  base: NodeJS.ProcessEnv,
  preference: KimiSecondaryModelPreference
): KimiSecondaryModelAppliedSource {
  if (preference.mode === 'disabled') return 'disabled'
  if (preference.mode === 'configured') return 'moon-code-environment'
  return nonBlankEnvironmentValue(base[SECONDARY_MODEL_ENV]) ||
    nonBlankEnvironmentValue(base[SECONDARY_EFFORT_ENV])
    ? 'inherited-environment'
    : 'kimi-config'
}

function nonBlankEnvironmentValue(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0
}
