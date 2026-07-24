import { describe, expect, it } from 'vitest'
import { isSupportedKimiVersion, parseKimiVersion } from '../../src/main/runtime/version.js'

describe('Kimi runtime version gate', () => {
  it('parses the CLI version output', () => {
    expect(parseKimiVersion('kimi-code 0.29.0\n')).toBe('0.29.0')
  })

  it('accepts the supported 0.29 minor and rejects 0.28', () => {
    expect(isSupportedKimiVersion('0.29.0')).toBe(true)
    expect(isSupportedKimiVersion('0.29.8')).toBe(true)
    expect(isSupportedKimiVersion('0.28.0')).toBe(false)
  })
})
