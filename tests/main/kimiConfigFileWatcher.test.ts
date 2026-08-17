import { EventEmitter } from 'node:events'
import type { FSWatcher, WatchEventType } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KimiConfigFileWatcher } from '../../src/main/kimi/KimiConfigFileWatcher.js'

class FakeWatcher extends EventEmitter {
  readonly close = vi.fn(() => {
    this.emit('close')
  })
}

type WatchCallback = (eventType: WatchEventType, filename: string | null) => void

function createHarness(options: { throwOnWatch?: boolean } = {}) {
  const watchers: FakeWatcher[] = []
  const watchImpl = vi.fn((_path: string, listener: WatchCallback) => {
    if (options.throwOnWatch === true) throw new Error('ENOENT: no such file or directory')
    const watcher = new FakeWatcher()
    watchers.push(watcher)
    ;(watcher as unknown as { listener: WatchCallback }).listener = listener
    return watcher as unknown as FSWatcher
  })
  const trigger = (filename: string | null, index = 0) => {
    const watcher = watchers[index] as unknown as { listener: WatchCallback } | undefined
    watcher?.listener('change', filename)
  }
  return { watchers, watchImpl: watchImpl as never, trigger }
}

describe('KimiConfigFileWatcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits a single debounced change for a burst of config.toml writes', () => {
    vi.useFakeTimers()
    const harness = createHarness()
    const watcher = new KimiConfigFileWatcher({
      configFilePath: '/tmp/kimi-home/.kimi-code/config.toml',
      debounceMs: 300,
      watchImpl: harness.watchImpl
    })
    const events: string[] = []
    watcher.on('change', () => events.push('change'))

    watcher.start()
    expect(harness.watchImpl).toHaveBeenCalledWith('/tmp/kimi-home/.kimi-code', expect.any(Function))

    harness.trigger('config.toml')
    harness.trigger('config.toml')
    vi.advanceTimersByTime(299)
    expect(events).toEqual([])
    vi.advanceTimersByTime(1)
    expect(events).toEqual(['change'])

    harness.trigger('config.toml')
    vi.advanceTimersByTime(300)
    expect(events).toEqual(['change', 'change'])
    watcher.close()
  })

  it('ignores unrelated files and treats a null filename as a possible change', () => {
    vi.useFakeTimers()
    const harness = createHarness()
    const watcher = new KimiConfigFileWatcher({
      configFilePath: '/tmp/kimi-home/.kimi-code/config.toml',
      debounceMs: 300,
      watchImpl: harness.watchImpl
    })
    const events: string[] = []
    watcher.on('change', () => events.push('change'))
    watcher.start()

    harness.trigger('server.token')
    harness.trigger('session_index.jsonl')
    vi.advanceTimersByTime(1_000)
    expect(events).toEqual([])

    harness.trigger(null)
    vi.advanceTimersByTime(300)
    expect(events).toEqual(['change'])
    watcher.close()
  })

  it('stays silent when the config directory does not exist and can start later', () => {
    vi.useFakeTimers()
    const harness = createHarness({ throwOnWatch: true })
    const watcher = new KimiConfigFileWatcher({
      configFilePath: '/tmp/missing/.kimi-code/config.toml',
      debounceMs: 300,
      watchImpl: harness.watchImpl
    })
    expect(() => watcher.start()).not.toThrow()
    expect(() => watcher.start()).not.toThrow()
    expect(harness.watchImpl).toHaveBeenCalledTimes(2)
    watcher.close()
  })

  it('is idempotent while running and tears down on watcher error', () => {
    vi.useFakeTimers()
    const harness = createHarness()
    const watcher = new KimiConfigFileWatcher({
      configFilePath: '/tmp/kimi-home/.kimi-code/config.toml',
      debounceMs: 300,
      watchImpl: harness.watchImpl
    })
    watcher.start()
    watcher.start()
    expect(harness.watchImpl).toHaveBeenCalledTimes(1)

    harness.watchers[0]!.emit('error', new Error('directory removed'))
    expect(harness.watchers[0]!.close).toHaveBeenCalled()

    // 出错后可以重新开始监听（例如目录被重建）。
    watcher.start()
    expect(harness.watchImpl).toHaveBeenCalledTimes(2)
    watcher.close()
  })

  it('stops emitting after close', () => {
    vi.useFakeTimers()
    const harness = createHarness()
    const watcher = new KimiConfigFileWatcher({
      configFilePath: '/tmp/kimi-home/.kimi-code/config.toml',
      debounceMs: 300,
      watchImpl: harness.watchImpl
    })
    const events: string[] = []
    watcher.on('change', () => events.push('change'))
    watcher.start()
    harness.trigger('config.toml')
    watcher.close()
    vi.advanceTimersByTime(1_000)
    expect(events).toEqual([])
    expect(harness.watchers[0]!.close).toHaveBeenCalled()
  })
})
