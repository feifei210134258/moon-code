import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { spawn, type IPty } from 'node-pty'
import type { SessionTerminal, TerminalExitEvent, TerminalOutputEvent } from '../../shared/contracts.js'

const MAX_BUFFERED_FRAMES = 1_000
const MAX_BUFFERED_CHARS = 2_000_000
export const MAX_COMPAT_TERMINALS_PER_SESSION = 8
export const MAX_COMPAT_TERMINALS_TOTAL = 24
const DEFAULT_CLOSE_GRACE_MS = 1_500

interface BufferedOutput {
  seq: number
  data: string
}

interface TerminalRecord {
  terminal: SessionTerminal
  process: IPty
  attached: boolean
  nextSeq: number
  buffer: BufferedOutput[]
  bufferedChars: number
  dataSubscription: { dispose(): void }
  exitSubscription: { dispose(): void }
  exitWaiters: Set<() => void>
  closePromise: Promise<void> | null
}

interface KimiTerminalCompatibilityOptions {
  closeGraceMs?: number
}

/**
 * Compatibility implementation for Kimi Code 0.29.0's v2 server, whose REST
 * terminal routes are present but whose WebSocket dispatcher drops every
 * terminal_* control frame. It mirrors Kimi's Session Terminal semantics and
 * remains an accessory PTY only; Agent requests still exclusively use Kimi.
 */
export class KimiTerminalCompatibility extends EventEmitter {
  readonly #records = new Map<string, TerminalRecord>()
  readonly #closeGraceMs: number

  constructor(options: KimiTerminalCompatibilityOptions = {}) {
    super()
    this.#closeGraceMs = options.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS
  }

  list(sessionId: string): SessionTerminal[] {
    return [...this.#records.values()]
      .filter((record) => record.terminal.sessionId === sessionId)
      .map((record) => ({ ...record.terminal }))
  }

  async create(
    sessionId: string,
    cwd: string,
    size: { cols: number; rows: number }
  ): Promise<SessionTerminal> {
    const sessionTerminalCount = [...this.#records.values()]
      .filter((record) => record.terminal.sessionId === sessionId)
      .length
    if (sessionTerminalCount >= MAX_COMPAT_TERMINALS_PER_SESSION) {
      throw new Error(`A Kimi Session can have at most ${MAX_COMPAT_TERMINALS_PER_SESSION} terminals`)
    }
    if (this.#records.size >= MAX_COMPAT_TERMINALS_TOTAL) {
      throw new Error(`Kimi Agent can have at most ${MAX_COMPAT_TERMINALS_TOTAL} terminals`)
    }
    const resolvedCwd = await realpath(cwd)
    const shell = defaultShell()
    const process = spawn(shell, [], {
      name: 'xterm-256color',
      cwd: resolvedCwd,
      cols: size.cols,
      rows: size.rows,
      env: processEnv()
    })
    const terminal: SessionTerminal = {
      id: `compat_term_${randomUUID()}`,
      sessionId,
      cwd: resolvedCwd,
      shell,
      cols: size.cols,
      rows: size.rows,
      status: 'running',
      createdAt: new Date().toISOString(),
      exitedAt: null,
      exitCode: null
    }
    const noopSubscription = { dispose() {} }
    const record: TerminalRecord = {
      terminal,
      process,
      attached: false,
      nextSeq: 0,
      buffer: [],
      bufferedChars: 0,
      dataSubscription: noopSubscription,
      exitSubscription: noopSubscription,
      exitWaiters: new Set(),
      closePromise: null
    }
    record.dataSubscription = process.onData((data) => this.#onData(record, data))
    record.exitSubscription = process.onExit((event) => this.#markExited(record, event.exitCode))
    this.#records.set(terminalKey(sessionId, terminal.id), record)
    return { ...terminal }
  }

  attach(sessionId: string, terminalId: string, sinceSeq = 0): void {
    const record = this.#requireRecord(sessionId, terminalId)
    record.attached = true
    for (const frame of record.buffer) {
      if (frame.seq > sinceSeq) this.#emitOutput(record, frame)
    }
    if (record.terminal.status === 'exited') this.#emitExit(record)
  }

  detach(sessionId: string, terminalId: string): void {
    const record = this.#records.get(terminalKey(sessionId, terminalId))
    if (record !== undefined) record.attached = false
  }

  write(sessionId: string, terminalId: string, data: string): void {
    const record = this.#requireRecord(sessionId, terminalId)
    if (record.terminal.status !== 'running') throw new Error('Kimi terminal has exited')
    record.process.write(data)
  }

  resize(sessionId: string, terminalId: string, cols: number, rows: number): void {
    const record = this.#requireRecord(sessionId, terminalId)
    if (record.terminal.status !== 'running') return
    record.process.resize(cols, rows)
    record.terminal = { ...record.terminal, cols, rows }
  }

  async close(sessionId: string, terminalId: string): Promise<{ closed: boolean }> {
    const key = terminalKey(sessionId, terminalId)
    const record = this.#requireRecord(sessionId, terminalId)
    await this.#stopRecord(record)
    this.#releaseRecord(key, record)
    return { closed: true }
  }

  async dispose(): Promise<void> {
    const records = [...this.#records.entries()]
    for (const [, record] of records) {
      record.attached = false
    }
    const results = await Promise.allSettled(records.map(async ([key, record]) => {
      await this.#stopRecord(record)
      this.#releaseRecord(key, record)
    }))
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason)
    if (failures.length > 0) throw new AggregateError(failures, 'Failed to stop one or more Kimi terminals')
  }

  #onData(record: TerminalRecord, data: string): void {
    const frame = { seq: ++record.nextSeq, data }
    record.buffer.push(frame)
    record.bufferedChars += data.length
    while (
      record.buffer.length > MAX_BUFFERED_FRAMES ||
      (record.bufferedChars > MAX_BUFFERED_CHARS && record.buffer.length > 1)
    ) {
      const removed = record.buffer.shift()
      if (removed !== undefined) record.bufferedChars -= removed.data.length
    }
    if (record.attached) this.#emitOutput(record, frame)
  }

  #markExited(record: TerminalRecord, exitCode: number | null): void {
    if (record.terminal.status === 'exited') return
    record.terminal = {
      ...record.terminal,
      status: 'exited',
      exitedAt: new Date().toISOString(),
      exitCode
    }
    record.dataSubscription.dispose()
    record.exitSubscription.dispose()
    for (const resolve of record.exitWaiters) resolve()
    record.exitWaiters.clear()
    if (record.attached) this.#emitExit(record)
  }

  async #stopRecord(record: TerminalRecord): Promise<void> {
    if (record.terminal.status === 'exited') return
    if (record.closePromise !== null) return await record.closePromise

    const operation = this.#terminateRecord(record).finally(() => {
      record.closePromise = null
    })
    record.closePromise = operation
    return await operation
  }

  async #terminateRecord(record: TerminalRecord): Promise<void> {
    try {
      record.process.kill()
    } catch {
      // A stale native handle may reject the graceful signal. Escalation below
      // still owns the handle until node-pty confirms exit.
    }
    if (await this.#waitForExit(record, this.#closeGraceMs)) return

    try {
      record.process.kill('SIGKILL')
    } catch {
      // Preserve the record and report failure if the native process still does
      // not produce an exit event after the bounded escalation window.
    }
    if (await this.#waitForExit(record, this.#closeGraceMs)) return
    throw new Error(`Kimi terminal ${record.terminal.id} did not exit after SIGKILL`)
  }

  #waitForExit(record: TerminalRecord, timeoutMs: number): Promise<boolean> {
    if (record.terminal.status === 'exited') return Promise.resolve(true)
    return new Promise((resolve) => {
      let settled = false
      const finish = (exited: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        record.exitWaiters.delete(onExit)
        resolve(exited)
      }
      const onExit = (): void => finish(true)
      const timer = setTimeout(() => finish(record.terminal.status === 'exited'), timeoutMs)
      record.exitWaiters.add(onExit)
      if (record.terminal.status === 'exited') onExit()
    })
  }

  #releaseRecord(key: string, record: TerminalRecord): void {
    if (record.terminal.status !== 'exited' || this.#records.get(key) !== record) return
    record.dataSubscription.dispose()
    record.exitSubscription.dispose()
    record.exitWaiters.clear()
    this.#records.delete(key)
  }

  #emitOutput(record: TerminalRecord, frame: BufferedOutput): void {
    const output: TerminalOutputEvent = {
      sessionId: record.terminal.sessionId,
      terminalId: record.terminal.id,
      seq: frame.seq,
      data: frame.data
    }
    this.emit('terminal-output', output)
  }

  #emitExit(record: TerminalRecord): void {
    const exit: TerminalExitEvent = {
      sessionId: record.terminal.sessionId,
      terminalId: record.terminal.id,
      exitCode: record.terminal.exitCode
    }
    this.emit('terminal-exit', exit)
  }

  #requireRecord(sessionId: string, terminalId: string): TerminalRecord {
    const record = this.#records.get(terminalKey(sessionId, terminalId))
    if (record === undefined) throw new Error('Kimi terminal does not exist in this Session')
    return record
  }
}

function terminalKey(sessionId: string, terminalId: string): string {
  return `${sessionId}\0${terminalId}`
}

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC ?? 'powershell.exe'
  if (process.env.SHELL?.startsWith('/') === true) return process.env.SHELL
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh'
}

function processEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
}
