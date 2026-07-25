import { describe, expect, it, vi } from 'vitest'
import {
  KimiWsClient,
  type WebSocketLike,
  type WebSocketMessageEventLike
} from '../../packages/kimi-adapter/src/transport/KimiWsClient.js'

type Listener = (...args: never[]) => void

class FakeWebSocket implements WebSocketLike {
  readyState = 1
  sent: string[] = []
  readonly listeners = new Map<string, Listener[]>()

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
    this.emit('close', { code: 1000, reason: 'closed' })
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  emit(type: string, value?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(value as never)
  }

  message(value: object): void {
    this.emit('message', { data: JSON.stringify(value) } satisfies WebSocketMessageEventLike)
  }
}

describe('KimiWsClient', () => {
  it('uses the bearer subprotocol, performs hello, and answers ping', async () => {
    const socket = new FakeWebSocket()
    const factory = vi.fn(() => socket)
    const client = new KimiWsClient({
      origin: 'http://127.0.0.1:54959/',
      token: 'secret-token',
      clientId: 'test-client',
      requestTimeoutMs: 1_000,
      webSocketFactory: factory
    })

    const connecting = client.connect({ subscriptions: ['session-1'] })
    socket.emit('open')
    socket.message({
      type: 'server_hello',
      timestamp: '2026-07-23T00:00:00.000Z',
      payload: {
        ws_connection_id: 'connection-1',
        protocol_version: 1,
        max_event_buffer_size: 1000,
        capabilities: { event_batching: false, compression: false }
      }
    })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))
    const hello = JSON.parse(socket.sent[0] ?? '{}') as { id?: string; type?: string }
    socket.message({
      type: 'ack',
      id: hello.id,
      code: 0,
      msg: 'ok',
      payload: { accepted_subscriptions: ['session-1'], resync_required: [] }
    })
    await connecting

    expect(factory).toHaveBeenCalledWith('ws://127.0.0.1:54959/api/v1/ws?client_id=test-client', [
      'kimi-code.bearer.secret-token'
    ])
    expect(hello.type).toBe('client_hello')

    socket.message({
      type: 'ping',
      timestamp: '2026-07-23T00:00:01.000Z',
      payload: { nonce: 'ping-1' }
    })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
    expect(JSON.parse(socket.sent[1] ?? '{}')).toEqual({ type: 'pong', payload: { nonce: 'ping-1' } })
    client.close()
  })

  it('does not emit duplicate or gapped session events as accepted events', async () => {
    const socket = new FakeWebSocket()
    const client = new KimiWsClient({
      origin: 'http://127.0.0.1:54959',
      token: 'secret-token',
      clientId: 'test-client',
      requestTimeoutMs: 1_000,
      webSocketFactory: () => socket
    })
    const accepted = vi.fn()
    const duplicate = vi.fn()
    const resync = vi.fn()
    client.on('session-event', accepted)
    client.on('duplicate-event', duplicate)
    client.on('resync-required', resync)

    const connecting = client.connect({
      subscriptions: ['session-1'],
      cursors: { 'session-1': { seq: 10, epoch: 'epoch-1' } }
    })
    socket.emit('open')
    socket.message({
      type: 'server_hello',
      timestamp: '2026-07-23T00:00:00.000Z',
      payload: {
        ws_connection_id: 'connection-1',
        protocol_version: 1,
        max_event_buffer_size: 1000,
        capabilities: { event_batching: false, compression: false }
      }
    })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))
    const hello = JSON.parse(socket.sent[0] ?? '{}') as { id?: string }
    socket.message({ type: 'ack', id: hello.id, code: 0, msg: 'ok', payload: {} })
    await connecting

    const event = (seq: number) => ({
      type: 'event.session.work_changed',
      seq,
      epoch: 'epoch-1',
      session_id: 'session-1',
      timestamp: '2026-07-23T00:00:01.000Z',
      payload: { type: 'event.session.work_changed', busy: true }
    })
    socket.message(event(11))
    socket.message(event(11))
    socket.message(event(13))

    await vi.waitFor(() => {
      expect(accepted).toHaveBeenCalledTimes(1)
      expect(duplicate).toHaveBeenCalledTimes(1)
      expect(resync).toHaveBeenCalledTimes(1)
    })
    client.close()
  })

  it('sends official fire-and-forget terminal frames and keeps Terminal seq outside Session cursors', async () => {
    const socket = new FakeWebSocket()
    const client = new KimiWsClient({
      origin: 'http://127.0.0.1:54959',
      token: 'secret-token',
      requestTimeoutMs: 1_000,
      webSocketFactory: () => socket
    })
    const output = vi.fn()
    const duplicate = vi.fn()
    const exited = vi.fn()
    client.on('terminal-output', output)
    client.on('duplicate-terminal-output', duplicate)
    client.on('terminal-exit', exited)

    await connectAndAck(client, socket)
    sendTerminalFrame(socket, () => client.attachTerminal('session-1', 'terminal-1', 5), {
      type: 'terminal_attach',
      payload: { session_id: 'session-1', terminal_id: 'terminal-1', since_seq: 5 }
    })
    sendTerminalFrame(socket, () => client.sendTerminalInput('session-1', 'terminal-1', 'ls\r'), {
      type: 'terminal_input',
      payload: { session_id: 'session-1', terminal_id: 'terminal-1', data: 'ls\r' }
    })
    sendTerminalFrame(socket, () => client.resizeTerminal('session-1', 'terminal-1', 120, 32), {
      type: 'terminal_resize',
      payload: { session_id: 'session-1', terminal_id: 'terminal-1', cols: 120, rows: 32 }
    })

    socket.message({
      type: 'terminal_output', session_id: 'session-1', terminal_id: 'terminal-1', seq: 6,
      payload: { data: 'first' }
    })
    socket.message({
      type: 'terminal_output', session_id: 'session-1', terminal_id: 'terminal-1', seq: 6,
      payload: { data: 'replay' }
    })
    socket.message({
      type: 'terminal_exit', session_id: 'session-1', terminal_id: 'terminal-1',
      payload: { exit_code: 0 }
    })

    await vi.waitFor(() => {
      expect(output).toHaveBeenCalledOnce()
      expect(output).toHaveBeenCalledWith({
        sessionId: 'session-1', terminalId: 'terminal-1', seq: 6, data: 'first'
      })
      expect(duplicate).toHaveBeenCalledOnce()
      expect(exited).toHaveBeenCalledWith({
        sessionId: 'session-1', terminalId: 'terminal-1', exitCode: 0
      })
    })
    expect(client.cursors).toEqual({})
    client.close()
  })

  it('reattaches terminals from the last output sequence after reconnect', async () => {
    const first = new FakeWebSocket()
    const second = new FakeWebSocket()
    const factory = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const client = new KimiWsClient({
      origin: 'http://127.0.0.1:54959',
      token: 'secret-token',
      requestTimeoutMs: 1_000,
      webSocketFactory: factory
    })

    await connectAndAck(client, first)
    sendTerminalFrame(first, () => client.attachTerminal('session-1', 'terminal-1'), {
      type: 'terminal_attach',
      payload: { session_id: 'session-1', terminal_id: 'terminal-1' }
    })
    first.message({
      type: 'terminal_output', session_id: 'session-1', terminal_id: 'terminal-1', seq: 9,
      payload: { data: 'output' }
    })
    first.emit('close', { code: 1006, reason: 'network' })

    const reconnecting = client.connect()
    second.emit('open')
    second.message(serverHello())
    await vi.waitFor(() => expect(second.sent).toHaveLength(1))
    acknowledgeLast(second)
    await vi.waitFor(() => expect(second.sent).toHaveLength(2))
    expect(JSON.parse(second.sent[1] ?? '{}')).toEqual(expect.objectContaining({
      type: 'terminal_attach',
      payload: { session_id: 'session-1', terminal_id: 'terminal-1', since_seq: 9 }
    }))
    await reconnecting
    client.close()
  })

  it('drops terminal output and exit frames after ownership is detached', async () => {
    const socket = new FakeWebSocket()
    const client = new KimiWsClient({
      origin: 'http://127.0.0.1:54959',
      token: 'secret-token',
      requestTimeoutMs: 1_000,
      webSocketFactory: () => socket
    })
    const output = vi.fn()
    const exited = vi.fn()
    client.on('terminal-output', output)
    client.on('terminal-exit', exited)

    await connectAndAck(client, socket)
    client.attachTerminal('session-1', 'terminal-1', 0)
    client.detachTerminal('session-1', 'terminal-1')
    socket.message({
      type: 'terminal_output', session_id: 'session-1', terminal_id: 'terminal-1', seq: 1,
      payload: { data: 'late output' }
    })
    socket.message({
      type: 'terminal_exit', session_id: 'session-1', terminal_id: 'terminal-1',
      payload: { exit_code: 0 }
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(output).not.toHaveBeenCalled()
    expect(exited).not.toHaveBeenCalled()
    client.close()
  })
})

function serverHello(): object {
  return {
    type: 'server_hello',
    timestamp: '2026-07-23T00:00:00.000Z',
    payload: {
      ws_connection_id: 'connection-1', protocol_version: 1, max_event_buffer_size: 1000,
      capabilities: { event_batching: false, compression: false }
    }
  }
}

async function connectAndAck(client: KimiWsClient, socket: FakeWebSocket): Promise<void> {
  const connecting = client.connect()
  socket.emit('open')
  socket.message(serverHello())
  await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThan(0))
  acknowledgeLast(socket)
  await connecting
}

function sendTerminalFrame(
  socket: FakeWebSocket,
  request: () => void,
  expected: object
): void {
  const count = socket.sent.length
  request()
  expect(socket.sent).toHaveLength(count + 1)
  expect(JSON.parse(socket.sent[count] ?? '{}')).toEqual(expect.objectContaining(expected))
}

function acknowledgeLast(socket: FakeWebSocket): void {
  const frame = JSON.parse(socket.sent.at(-1) ?? '{}') as { id?: string }
  socket.message({ type: 'ack', id: frame.id, code: 0, msg: 'ok', payload: {} })
}
