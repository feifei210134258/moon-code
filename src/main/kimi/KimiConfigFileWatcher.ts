import { EventEmitter } from 'node:events'
import { watch, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

export function defaultKimiConfigFilePath(homeDirectory: string = homedir()): string {
  return join(homeDirectory, '.kimi-code', 'config.toml')
}

interface KimiConfigFileWatcherOptions {
  configFilePath?: string
  debounceMs?: number
  watchImpl?: typeof watch
}

/**
 * 只读监听 Kimi 的 config.toml，任何写入方（kimi code web、CLI、手工编辑，
 * 以及本应用自身的 REST 变更）落盘后发出一次去抖动的 'change'。
 *
 * 背景：Kimi 0.36 的 WS 不再向连接转发 event.config.changed /
 * event.model_catalog.changed，而跨进程写入本就不会产生事件；没有打开
 * Session 时更是连 WS 订阅都不存在。设置面板与会话模型列表因此只能
 * 在重新打开或手动刷新时才能看到外部新增的 Provider。监听目录而非文件
 * 本身，是为了在原子替换（写临时文件再 rename）后继续存活。
 *
 * 该监听只是失效信号：所有数据仍经官方 REST 重新读取，客户端不解析、
 * 不修改 config.toml。
 */
export class KimiConfigFileWatcher extends EventEmitter {
  readonly #configFilePath: string
  readonly #debounceMs: number
  readonly #watchImpl: typeof watch
  #watcher: FSWatcher | null = null
  #timer: NodeJS.Timeout | null = null

  constructor(options: KimiConfigFileWatcherOptions = {}) {
    super()
    this.#configFilePath = options.configFilePath ?? defaultKimiConfigFilePath()
    this.#debounceMs = options.debounceMs ?? 300
    this.#watchImpl = options.watchImpl ?? watch
  }

  /** 幂等；配置目录不存在（尚未安装过 Runtime）时静默跳过，可稍后重试。 */
  start(): void {
    if (this.#watcher !== null) return
    let watcher: FSWatcher
    try {
      watcher = this.#watchImpl(dirname(this.#configFilePath), (_eventType, filename) => {
        // 个别平台 filename 可能为 null；此时保守地视为一次变更。
        if (filename !== null && filename !== basename(this.#configFilePath)) return
        this.#schedule()
      })
    } catch {
      return
    }
    watcher.once('error', () => this.#teardown())
    this.#watcher = watcher
  }

  close(): void {
    this.#teardown()
  }

  #schedule(): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.emit('change')
    }, this.#debounceMs)
    this.#timer.unref?.()
  }

  #teardown(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    const watcher = this.#watcher
    this.#watcher = null
    watcher?.close()
  }
}
