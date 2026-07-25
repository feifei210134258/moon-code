import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import type { RuntimeDiscovery, RuntimeExternalConnectionInput, RuntimePublicState } from '../../shared/contracts.js'
import { KimiRestClient } from '../kimi/KimiRestClient.js'
import { KimiWsClient } from '../../../packages/kimi-adapter/src/transport/KimiWsClient.js'
import { discoverRuntimes, resolveManagedKimiEntry } from './discovery.js'
import { parseRuntimeReadyOutput, redactRuntimeOutput } from './readyLine.js'

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
}

type RuntimeChild = ChildProcessByStdio<null, Readable, Readable>

const DEFAULT_SHARED_KIMI_WEB_ORIGIN = 'http://127.0.0.1:58627'

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
  #process: RuntimeChild | null = null
  #connection: RuntimeConnection | null = null
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
  }

  get state(): RuntimePublicState {
    return { ...this.#state }
  }

  get backend(): 'v1' | 'v2' | null {
    return this.#connection?.backend ?? null
  }

  createRestClient(): KimiRestClient {
    const connection = this.#connection
    if (connection === null) throw new Error('Kimi runtime is not connected')
    return new KimiRestClient({ origin: connection.origin, token: connection.token })
  }

  createWsClient(options: { clientId?: string } = {}): KimiWsClient {
    const connection = this.#connection
    if (connection === null) throw new Error('Kimi runtime is not connected')
    return new KimiWsClient({
      origin: connection.origin,
      token: connection.token,
      ...(options.clientId === undefined ? {} : { clientId: options.clientId })
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
      const sharedConnection = await this.#tryConnectSharedRuntime()
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
      const args = managed
        ? [resolveManagedKimiEntry(), 'web', '--port', '58627', '--no-open', '--log-level', 'error']
        : ['web', '--port', '58627', '--no-open', '--log-level', 'error']
      const child = this.#spawn(executable, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NO_COLOR: '1',
          ...(managed && process.versions.electron !== undefined ? { ELECTRON_RUN_AS_NODE: '1' } : {})
        },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.#process = child

      const connection = await this.#waitUntilReady(child)
      this.#connection = connection
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
      this.#setState({
        status: 'running', mode: 'external', version: connection.version,
        serverId: connection.serverId, origin, error: null
      })
    } catch {
      this.#connection = null
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

  async #waitUntilReady(child: RuntimeChild): Promise<RuntimeConnection> {
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
    })
  }

  #setState(next: RuntimePublicState): void {
    this.#state = next
    this.emit('state-changed', this.state)
  }
}
