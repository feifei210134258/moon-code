import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { Readable } from 'node:stream'
import type { RuntimeExternalConnectionInput, RuntimePublicState } from '../../shared/contracts.js'
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
}

type RuntimeChild = ChildProcessByStdio<null, Readable, Readable>

export class KimiRuntimeManager extends EventEmitter {
  readonly #startupTimeoutMs: number
  readonly #spawn: typeof spawn
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

  async start(mode: 'managed' | 'system' = 'managed'): Promise<RuntimePublicState> {
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
      const discovery = await discoverRuntimes()
      const candidate = mode === 'managed' ? discovery.managed : discovery.system
      if (!candidate.compatible || candidate.executable === null) {
        throw new Error(candidate.reason ?? 'Kimi runtime is not compatible')
      }

      const managed = mode === 'managed'
      const executable = managed ? process.execPath : candidate.executable
      const args = managed
        ? [resolveManagedKimiEntry(), 'web', '--port', '0', '--no-open', '--log-level', 'error']
        : ['web', '--port', '0', '--no-open', '--log-level', 'error']
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
      const meta = await new KimiRestClient({ origin, token: input.token }).getMeta()
      this.#connection = {
        origin,
        token: input.token,
        serverId: meta.server_id,
        version: meta.server_version,
        backend: meta.backend ?? 'v1'
      }
      this.#setState({
        status: 'running', mode: 'external', version: meta.server_version,
        serverId: meta.server_id, origin, error: null
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
          const meta = await new KimiRestClient(ready).getMeta()
          finish(undefined, {
            origin: ready.origin,
            token: ready.token,
          serverId: meta.server_id,
          version: meta.server_version,
          backend: meta.backend ?? 'v1'
          })
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
