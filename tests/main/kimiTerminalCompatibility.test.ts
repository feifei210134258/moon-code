import { beforeEach, describe, expect, it, vi } from 'vitest'

const ptyMock = vi.hoisted(() => ({
  processes: [] as Array<{
    write: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
    emitData(data: string): void
    emitExit(exitCode: number): void
    exitOnKill: boolean
  }>
}))

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    let dataListener: ((data: string) => void) | undefined
    let exitListener: ((event: { exitCode: number }) => void) | undefined
    const process = {
      write: vi.fn(),
      resize: vi.fn(),
      exitOnKill: true,
      kill: vi.fn(() => {
        if (process.exitOnKill) exitListener?.({ exitCode: 0 })
      }),
      onData(listener: (data: string) => void) {
        dataListener = listener
        return { dispose() { dataListener = undefined } }
      },
      onExit(listener: (event: { exitCode: number }) => void) {
        exitListener = listener
        return { dispose() { exitListener = undefined } }
      },
      emitData(data: string) { dataListener?.(data) },
      emitExit(exitCode: number) { exitListener?.({ exitCode }) }
    }
    ptyMock.processes.push(process)
    return process
  })
}))

import {
  KimiTerminalCompatibility,
  MAX_COMPAT_TERMINALS_PER_SESSION
} from '../../src/main/kimi/KimiTerminalCompatibility.js'

beforeEach(() => {
  ptyMock.processes.length = 0
})

describe('KimiTerminalCompatibility', () => {
  it('scopes PTY I/O to a Session and replays only unseen output', async () => {
    const service = new KimiTerminalCompatibility()
    const outputs: Array<{ seq: number; data: string }> = []
    const exits: Array<{ exitCode: number | null }> = []
    service.on('terminal-output', (event) => outputs.push({ seq: event.seq, data: event.data }))
    service.on('terminal-exit', (event) => exits.push({ exitCode: event.exitCode }))

    const terminal = await service.create('session-1', process.cwd(), { cols: 80, rows: 24 })
    const pty = ptyMock.processes[0]!
    pty.emitData('prompt')
    expect(outputs).toEqual([])

    service.attach('session-1', terminal.id)
    expect(outputs).toEqual([{ seq: 1, data: 'prompt' }])
    service.detach('session-1', terminal.id)
    pty.emitData('later')
    expect(outputs).toHaveLength(1)
    service.attach('session-1', terminal.id, 1)
    expect(outputs.at(-1)).toEqual({ seq: 2, data: 'later' })

    service.write('session-1', terminal.id, 'ls\r')
    service.resize('session-1', terminal.id, 100, 30)
    expect(pty.write).toHaveBeenCalledWith('ls\r')
    expect(pty.resize).toHaveBeenCalledWith(100, 30)
    expect(service.list('session-1')[0]).toEqual(expect.objectContaining({ cols: 100, rows: 30 }))

    await expect(service.close('session-1', terminal.id)).resolves.toEqual({ closed: true })
    expect(exits).toEqual([{ exitCode: 0 }])
    expect(service.list('session-1')).toEqual([])
    await service.dispose()
  })

  it('retains the PTY handle through graceful shutdown and SIGKILL escalation', async () => {
    vi.useFakeTimers()
    try {
      const service = new KimiTerminalCompatibility({ closeGraceMs: 10 })
      const terminal = await service.create('session-1', process.cwd(), { cols: 80, rows: 24 })
      const pty = ptyMock.processes[0]!
      pty.exitOnKill = false

      const closing = service.close('session-1', terminal.id)
      expect(pty.kill).toHaveBeenCalledTimes(1)
      expect(service.list('session-1')).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(10)
      expect(pty.kill).toHaveBeenLastCalledWith('SIGKILL')
      expect(service.list('session-1')).toHaveLength(1)

      pty.emitExit(137)
      await expect(closing).resolves.toEqual({ closed: true })
      expect(service.list('session-1')).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds the number of compatibility PTYs owned by one Session', async () => {
    const service = new KimiTerminalCompatibility()
    for (let index = 0; index < MAX_COMPAT_TERMINALS_PER_SESSION; index += 1) {
      await service.create('session-1', process.cwd(), { cols: 80, rows: 24 })
    }

    await expect(service.create('session-1', process.cwd(), { cols: 80, rows: 24 }))
      .rejects.toThrow(`at most ${MAX_COMPAT_TERMINALS_PER_SESSION}`)
    await service.dispose()
  })
})
