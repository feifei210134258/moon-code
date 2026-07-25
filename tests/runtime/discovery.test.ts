import { describe, expect, it, vi } from 'vitest'
import {
  selectSystemKimiExecutable,
  systemKimiFallbackPaths
} from '../../src/main/runtime/discovery.js'

describe('Kimi runtime discovery', () => {
  it('checks the standard Kimi Code installation path on macOS', () => {
    expect(systemKimiFallbackPaths('/Users/example', 'darwin')).toEqual([
      '/Users/example/.kimi-code/bin/kimi'
    ])
    expect(systemKimiFallbackPaths('/Users/example', 'linux')).toEqual([])
  })

  it('uses the executable on PATH first, then the first usable macOS fallback', async () => {
    const isExecutable = vi.fn(async (path: string) => path === '/Users/example/.kimi-code/bin/kimi')

    await expect(selectSystemKimiExecutable(
      '/opt/homebrew/bin/kimi',
      ['/Users/example/.kimi-code/bin/kimi'],
      isExecutable
    )).resolves.toBe('/opt/homebrew/bin/kimi')
    expect(isExecutable).not.toHaveBeenCalled()

    await expect(selectSystemKimiExecutable(
      null,
      ['/missing/kimi', '/Users/example/.kimi-code/bin/kimi'],
      isExecutable
    )).resolves.toBe('/Users/example/.kimi-code/bin/kimi')
    expect(isExecutable).toHaveBeenCalledTimes(2)
  })
})
