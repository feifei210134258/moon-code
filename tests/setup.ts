/**
 * Node 26 内置了实验性 Web Storage 全局对象：未传 --localstorage-file 时
 * `globalThis.localStorage` 是一个返回 undefined 的 getter，会在 vitest 填充
 * happy-dom 全局时遮蔽 happy-dom 自己的 localStorage 实现，导致 happy-dom
 * 环境下 `window.localStorage` 为 undefined。
 * happy-dom 20.x 尚未适配该行为，这里在测试启动后补一个内存版 Storage。
 * happy-dom 升级支持 Node 26 后可删除本文件及 vitest.config.ts 里的 setupFiles。
 */

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>()

  get length(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.entries.delete(key)
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value))
  }
}

/* 仅 happy-dom 环境（有 window）且 localStorage 被遮蔽时才安装。
   happy-dom 环境下 window === globalThis，经 globalThis 访问以避免依赖 DOM lib 类型。 */
const scope = globalThis as { window?: unknown; localStorage?: Storage }
if (typeof scope.window !== 'undefined' && typeof scope.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: false
  })
}
