<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { PhCaretDown, PhPlus, PhSpinnerGap, PhTerminalWindow, PhX } from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SessionTerminal, TerminalExitEvent, TerminalOutputEvent } from '@shared/contracts'

const MAX_BUFFER_CHARS = 2_000_000

const props = defineProps<{
  sessionId: string
  enabled: boolean
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const host = ref<HTMLElement | null>(null)
const terminals = ref<SessionTerminal[]>([])
const activeTerminalId = ref<string | null>(null)
const pending = ref(false)
const createPending = ref(false)
const error = ref<string | null>(null)
const buffers = new Map<string, { text: string; lastSeq: number }>()
let xterm: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let inputQueue = Promise.resolve()
let generation = 0
let loadedSessionId: string | null = null
let unsubscribeOutput: (() => void) | undefined
let unsubscribeExit: (() => void) | undefined

const activeTerminal = computed(() => terminals.value.find((item) => item.id === activeTerminalId.value) ?? null)

function terminalLabel(terminal: SessionTerminal, index: number): string {
  const shell = terminal.shell.split('/').filter(Boolean).at(-1)
  return shell === undefined ? `Terminal ${index + 1}` : `${shell} ${index + 1}`
}

async function loadTerminals(sessionId: string): Promise<void> {
  if (window.kimiAgent === undefined || !props.enabled || loadedSessionId === sessionId) return
  const started = ++generation
  pending.value = true
  error.value = null
  try {
    const items = await window.kimiAgent.listTerminals(sessionId)
    if (started !== generation || sessionId !== props.sessionId || !props.enabled) return
    terminals.value = items
    loadedSessionId = sessionId
    const preferred = items.find((item) => item.status === 'running') ?? items[0] ?? null
    activeTerminalId.value = preferred?.id ?? null
    const attachments = await Promise.allSettled(items
      .filter((item) => item.status === 'running')
      .map((item) => window.kimiAgent?.attachTerminal(
        sessionId,
        item.id,
        buffers.get(item.id)?.lastSeq ?? 0
      )))
    if (started !== generation || sessionId !== props.sessionId) return
    const failed = attachments.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') error.value = errorMessage(failed.reason)
    await showActiveTerminal()
  } catch (reason) {
    if (started === generation && sessionId === props.sessionId) error.value = errorMessage(reason)
  } finally {
    if (started === generation) pending.value = false
  }
}

async function createTerminal(): Promise<void> {
  if (window.kimiAgent === undefined || !props.enabled || createPending.value) return
  const sessionId = props.sessionId
  createPending.value = true
  error.value = null
  try {
    ensureXterm()
    const terminal = await window.kimiAgent.createTerminal(sessionId, {
      cols: xterm?.cols ?? 120,
      rows: xterm?.rows ?? 32
    })
    if (sessionId !== props.sessionId) {
      await window.kimiAgent.closeTerminal(sessionId, terminal.id).catch(() => undefined)
      return
    }
    terminals.value = [...terminals.value, terminal]
    activeTerminalId.value = terminal.id
    await window.kimiAgent.attachTerminal(sessionId, terminal.id, 0)
    await showActiveTerminal()
  } catch (reason) {
    if (sessionId === props.sessionId) error.value = errorMessage(reason)
  } finally {
    createPending.value = false
  }
}

async function closeTerminal(terminal: SessionTerminal): Promise<void> {
  if (window.kimiAgent === undefined) return
  const sessionId = props.sessionId
  error.value = null
  try {
    await window.kimiAgent.closeTerminal(sessionId, terminal.id)
    if (sessionId !== props.sessionId) return
    terminals.value = terminals.value.filter((item) => item.id !== terminal.id)
    buffers.delete(terminal.id)
    if (activeTerminalId.value === terminal.id) {
      activeTerminalId.value = terminals.value[0]?.id ?? null
      await showActiveTerminal()
    }
  } catch (reason) {
    if (sessionId === props.sessionId) error.value = errorMessage(reason)
  }
}

async function selectTerminal(terminalId: string): Promise<void> {
  if (activeTerminalId.value === terminalId) {
    xterm?.focus()
    return
  }
  activeTerminalId.value = terminalId
  await showActiveTerminal()
}

function ensureXterm(): void {
  const element = host.value
  if (xterm !== null || element === null) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const terminal = new Terminal({
    cursorBlink: !reduceMotion,
    cursorStyle: 'bar',
    fontFamily: '"SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    lineHeight: 1.3,
    scrollback: 5_000,
    allowProposedApi: false,
    theme: {
      background: '#f8fafc',
      foreground: '#25303d',
      cursor: '#2563eb',
      cursorAccent: '#ffffff',
      selectionBackground: '#cddffc',
      black: '#26313e',
      red: '#c34f55',
      green: '#188763',
      yellow: '#a56f18',
      blue: '#2563eb',
      magenta: '#8b5bb7',
      cyan: '#237e8b',
      white: '#dce2e8',
      brightBlack: '#778292',
      brightWhite: '#ffffff'
    }
  })
  const fit = new FitAddon()
  terminal.loadAddon(fit)
  terminal.open(element)
  terminal.onData((data) => enqueueInput(data))
  terminal.onResize(({ cols, rows }) => scheduleResize(cols, rows))
  xterm = terminal
  fitAddon = fit
  resizeObserver = new ResizeObserver(() => {
    if (!props.open || element.clientWidth === 0 || element.clientHeight === 0) return
    requestAnimationFrame(() => fitTerminal())
  })
  resizeObserver.observe(element)
}

async function showActiveTerminal(): Promise<void> {
  await nextTick()
  ensureXterm()
  if (xterm === null) return
  xterm.reset()
  const id = activeTerminalId.value
  if (id === null) return
  const buffer = buffers.get(id)
  if (buffer !== undefined && buffer.text.length > 0) xterm.write(buffer.text)
  if (props.open) {
    fitTerminal()
    xterm.focus()
  }
}

function fitTerminal(): void {
  if (!props.open || host.value === null || host.value.clientWidth === 0 || host.value.clientHeight === 0) return
  try {
    fitAddon?.fit()
  } catch {
    // The host can transiently report stale geometry while the drawer animates.
  }
}

function enqueueInput(data: string): void {
  const api = window.kimiAgent
  const sessionId = props.sessionId
  const terminal = activeTerminal.value
  if (api === undefined || terminal === null || terminal.status !== 'running') return
  inputQueue = inputQueue
    .then(() => api.sendTerminalInput(sessionId, terminal.id, data))
    .catch((reason: unknown) => {
      if (sessionId === props.sessionId) error.value = errorMessage(reason)
    })
}

function scheduleResize(cols: number, rows: number): void {
  if (resizeTimer !== null) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    resizeTimer = null
    const api = window.kimiAgent
    const sessionId = props.sessionId
    const terminal = activeTerminal.value
    if (api === undefined || terminal === null || terminal.status !== 'running') return
    void api.resizeTerminal(sessionId, terminal.id, cols, rows).catch((reason: unknown) => {
      if (sessionId === props.sessionId) error.value = errorMessage(reason)
    })
  }, 80)
}

function handleOutput(output: TerminalOutputEvent): void {
  if (output.sessionId !== props.sessionId) return
  const existing = buffers.get(output.terminalId) ?? { text: '', lastSeq: -1 }
  if (output.seq <= existing.lastSeq) return
  existing.lastSeq = output.seq
  existing.text = `${existing.text}${output.data}`.slice(-MAX_BUFFER_CHARS)
  buffers.set(output.terminalId, existing)
  if (activeTerminalId.value === output.terminalId) xterm?.write(output.data)
}

function handleExit(exit: TerminalExitEvent): void {
  if (exit.sessionId !== props.sessionId) return
  terminals.value = terminals.value.map((terminal) => terminal.id === exit.terminalId
    ? { ...terminal, status: 'exited', exitCode: exit.exitCode, exitedAt: new Date().toISOString() }
    : terminal)
  if (activeTerminalId.value === exit.terminalId) {
    xterm?.write(`\r\n\u001b[90m[进程已退出${exit.exitCode === null ? '' : ` · code ${exit.exitCode}`} ]\u001b[0m\r\n`)
  }
}

async function resetSession(previousSessionId: string | null): Promise<void> {
  generation += 1
  const oldTerminals = terminals.value
  loadedSessionId = null
  terminals.value = []
  activeTerminalId.value = null
  buffers.clear()
  xterm?.reset()
  if (window.kimiAgent !== undefined && previousSessionId !== null) {
    await Promise.allSettled(oldTerminals
      .filter((item) => item.status === 'running')
      .map((item) => window.kimiAgent?.detachTerminal(previousSessionId, item.id)))
  }
}

watch(
  () => [props.sessionId, props.enabled] as const,
  ([sessionId, enabled], previous) => {
    const previousSessionId = previous?.[0] ?? ''
    if (sessionId !== previousSessionId) {
      void resetSession(previousSessionId || null).then(() => {
        if (enabled && props.open && sessionId.length > 0) void loadTerminals(sessionId)
      })
    } else if (enabled && props.open && sessionId.length > 0) {
      void loadTerminals(sessionId)
    }
  },
  { immediate: true }
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    if (props.enabled && props.sessionId.length > 0) void loadTerminals(props.sessionId)
    void nextTick().then(() => {
      ensureXterm()
      fitTerminal()
      xterm?.focus()
    })
  }
)

onMounted(() => {
  if (window.kimiAgent !== undefined) {
    unsubscribeOutput = window.kimiAgent.onTerminalOutput(handleOutput)
    unsubscribeExit = window.kimiAgent.onTerminalExit(handleExit)
  }
})

onBeforeUnmount(() => {
  generation += 1
  if (resizeTimer !== null) clearTimeout(resizeTimer)
  resizeObserver?.disconnect()
  xterm?.dispose()
  unsubscribeOutput?.()
  unsubscribeExit?.()
  const sessionId = loadedSessionId
  if (window.kimiAgent !== undefined && sessionId !== null) {
    for (const terminal of terminals.value) {
      if (terminal.status === 'running') void window.kimiAgent.detachTerminal(sessionId, terminal.id).catch(() => undefined)
    }
  }
})

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
</script>

<template>
  <section v-show="open" class="terminal-drawer" :class="{ 'is-open': open }" aria-label="Session Terminal">
    <header class="terminal-toolbar">
      <div class="terminal-heading">
        <PhTerminalWindow :size="15" />
        <strong>Terminal</strong>
      </div>
      <div class="terminal-tabs" role="tablist" aria-label="终端列表">
        <div
          v-for="(terminal, index) in terminals"
          :key="terminal.id"
          class="terminal-tab"
          :class="{ 'is-active': terminal.id === activeTerminalId, 'is-exited': terminal.status === 'exited' }"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="terminal.id === activeTerminalId"
            @click="selectTerminal(terminal.id)"
          >
            <span class="terminal-state-dot" />
            {{ terminalLabel(terminal, index) }}
          </button>
          <button type="button" class="terminal-tab-close" :aria-label="`关闭 ${terminalLabel(terminal, index)}`" @click="closeTerminal(terminal)">
            <PhX :size="11" />
          </button>
        </div>
      </div>
      <button
        type="button"
        class="terminal-tool-button"
        aria-label="新建终端"
        :disabled="!enabled || createPending"
        @click="createTerminal"
      >
        <PhSpinnerGap v-if="createPending" class="spin" :size="14" />
        <PhPlus v-else :size="14" />
      </button>
      <span v-if="activeTerminal" class="terminal-cwd" :title="activeTerminal.cwd">{{ activeTerminal.cwd }}</span>
      <button type="button" class="terminal-tool-button" aria-label="收起终端" @click="emit('close')">
        <PhCaretDown :size="14" />
      </button>
    </header>

    <div v-show="open" class="terminal-body">
      <div v-if="pending" class="terminal-empty"><PhSpinnerGap class="spin" :size="17" /> 正在读取终端…</div>
      <div v-else-if="terminals.length === 0" class="terminal-empty">
        <span>这个 Session 还没有终端</span>
        <button type="button" :disabled="!enabled || createPending" @click="createTerminal">新建终端</button>
      </div>
      <div ref="host" class="terminal-host" :class="{ 'is-empty': terminals.length === 0 || pending }" />
      <div v-if="error" class="terminal-error" role="alert">{{ error }}</div>
    </div>
  </section>
</template>
