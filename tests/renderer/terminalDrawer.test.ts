// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  KimiAgentDesktopApi,
  SessionTerminal,
  TerminalExitEvent,
  TerminalOutputEvent
} from '../../src/shared/contracts.js'

const terminalMocks = vi.hoisted(() => ({
  instances: [] as Array<{
    cols: number
    rows: number
    write: ReturnType<typeof vi.fn>
    reset: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 120
    rows = 32
    write = vi.fn()
    reset = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    constructor() { terminalMocks.instances.push(this) }
    loadAddon(): void {}
    open(): void {}
    onData(): { dispose(): void } { return { dispose() {} } }
    onResize(): { dispose(): void } { return { dispose() {} } }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit(): void {} }
}))

import TerminalDrawer from '../../src/renderer/src/components/TerminalDrawer.vue'

const terminalA: SessionTerminal = {
  id: 'terminal-a',
  sessionId: 'session-a',
  cwd: '/tmp/project',
  shell: '/bin/zsh',
  cols: 120,
  rows: 32,
  status: 'running',
  createdAt: '2026-07-23T00:00:00.000Z',
  exitedAt: null,
  exitCode: null
}

beforeEach(() => {
  terminalMocks.instances.length = 0
  if (window.matchMedia === undefined) {
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia
  }
  if (window.ResizeObserver === undefined) {
    window.ResizeObserver = class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    } as unknown as typeof ResizeObserver
  }
})

afterEach(() => {
  delete window.kimiAgent
})

describe('TerminalDrawer', () => {
  it('lists, attaches, streams and closes Kimi Session terminals', async () => {
    let outputListener!: (event: TerminalOutputEvent) => void
    let exitListener!: (event: TerminalExitEvent) => void
    const created = { ...terminalA, id: 'terminal-b' }
    const api = {
      listTerminals: vi.fn(async () => [terminalA]),
      createTerminal: vi.fn(async () => created),
      attachTerminal: vi.fn(async () => undefined),
      detachTerminal: vi.fn(async () => undefined),
      sendTerminalInput: vi.fn(async () => undefined),
      resizeTerminal: vi.fn(async () => undefined),
      closeTerminal: vi.fn(async () => ({ closed: true })),
      onTerminalOutput: vi.fn((listener: (event: TerminalOutputEvent) => void) => {
        outputListener = listener
        return () => {}
      }),
      onTerminalExit: vi.fn((listener: (event: TerminalExitEvent) => void) => {
        exitListener = listener
        return () => {}
      })
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api

    const wrapper = mount(TerminalDrawer, {
      props: { sessionId: 'session-a', enabled: true, open: true }
    })
    await flushPromises()

    expect(api.listTerminals).toHaveBeenCalledWith('session-a')
    expect(api.attachTerminal).toHaveBeenCalledWith('session-a', 'terminal-a', 0)
    expect(wrapper.get('[role="tab"]').text()).toContain('zsh 1')

    outputListener({ sessionId: 'session-a', terminalId: 'terminal-a', seq: 1, data: 'hello\r\n' })
    expect(terminalMocks.instances[0]?.write).toHaveBeenCalledWith('hello\r\n')
    outputListener({ sessionId: 'session-a', terminalId: 'terminal-a', seq: 1, data: 'duplicate' })
    expect(terminalMocks.instances[0]?.write).not.toHaveBeenCalledWith('duplicate')

    exitListener({ sessionId: 'session-a', terminalId: 'terminal-a', exitCode: 0 })
    await flushPromises()
    expect(wrapper.get('.terminal-tab').classes()).toContain('is-exited')

    await wrapper.get('[aria-label="新建终端"]').trigger('click')
    await flushPromises()
    expect(api.createTerminal).toHaveBeenCalledWith('session-a', { cols: 120, rows: 32 })
    expect(api.attachTerminal).toHaveBeenCalledWith('session-a', 'terminal-b', 0)

    const closeButtons = wrapper.findAll('.terminal-tab-close')
    await closeButtons.at(-1)!.trigger('click')
    await flushPromises()
    expect(api.closeTerminal).toHaveBeenCalledWith('session-a', 'terminal-b')
    wrapper.unmount()
  })

  it('detaches the old terminal stream when the active Session changes', async () => {
    const api = {
      listTerminals: vi.fn(async (sessionId: string) => sessionId === 'session-a' ? [terminalA] : []),
      attachTerminal: vi.fn(async () => undefined),
      detachTerminal: vi.fn(async () => undefined),
      onTerminalOutput: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(TerminalDrawer, {
      props: { sessionId: 'session-a', enabled: true, open: true }
    })
    await flushPromises()

    await wrapper.setProps({ sessionId: 'session-b' })
    await flushPromises()

    expect(api.detachTerminal).toHaveBeenCalledWith('session-a', 'terminal-a')
    expect(api.listTerminals).toHaveBeenCalledWith('session-b')
    wrapper.unmount()
  })

  it('closes a terminal whose create request finishes after the Session changed', async () => {
    let resolveCreate!: (terminal: SessionTerminal) => void
    const api = {
      listTerminals: vi.fn(async () => []),
      createTerminal: vi.fn(() => new Promise<SessionTerminal>((resolve) => { resolveCreate = resolve })),
      attachTerminal: vi.fn(async () => undefined),
      detachTerminal: vi.fn(async () => undefined),
      closeTerminal: vi.fn(async () => ({ closed: true })),
      onTerminalOutput: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    const wrapper = mount(TerminalDrawer, {
      props: { sessionId: 'session-a', enabled: true, open: true }
    })
    await flushPromises()

    await wrapper.get('[aria-label="新建终端"]').trigger('click')
    await wrapper.setProps({ sessionId: 'session-b' })
    resolveCreate({ ...terminalA, id: 'late-terminal' })
    await flushPromises()

    expect(api.closeTerminal).toHaveBeenCalledWith('session-a', 'late-terminal')
    expect(api.attachTerminal).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
