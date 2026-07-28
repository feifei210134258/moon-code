import { describe, expect, it } from 'vitest'
import { isSupportedKimiVersion, parseKimiVersion } from '../../src/main/runtime/version.js'

describe('Kimi runtime version gate', () => {
  it('parses the CLI version output', () => {
    expect(parseKimiVersion('kimi-code 0.29.2\n')).toBe('0.29.2')
  })

  it('accepts future releases above the minimum and rejects older runtimes', () => {
    expect(isSupportedKimiVersion('0.29.0')).toBe(false)
    expect(isSupportedKimiVersion('0.29.2')).toBe(true)
    expect(isSupportedKimiVersion('0.29.8')).toBe(true)
    expect(isSupportedKimiVersion('0.30.0')).toBe(true)
    expect(isSupportedKimiVersion('1.0.0')).toBe(true)
    expect(isSupportedKimiVersion('0.28.0')).toBe(false)
  })
})
