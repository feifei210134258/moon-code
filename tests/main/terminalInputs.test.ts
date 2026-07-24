import { describe, expect, it } from 'vitest'
import {
  assertTerminalId,
  validateTerminalInput,
  validateTerminalSinceSeq,
  validateTerminalSize,
  validateTerminalSizeInput
} from '../../src/main/security/terminalInputs.js'

describe('terminal IPC input validation', () => {
  it('accepts terminal control bytes while enforcing a bounded input chunk', () => {
    expect(validateTerminalInput('\u0003')).toBe('\u0003')
    expect(() => validateTerminalInput('')).toThrow('Invalid Kimi terminal input')
    expect(() => validateTerminalInput('界'.repeat(30_000))).toThrow('Invalid Kimi terminal input')
  })

  it('bounds terminal dimensions and replay sequences', () => {
    expect(validateTerminalSizeInput(undefined)).toEqual({ cols: 120, rows: 32 })
    expect(validateTerminalSize(80, 24)).toEqual({ cols: 80, rows: 24 })
    expect(validateTerminalSinceSeq(0)).toBe(0)
    expect(() => validateTerminalSize(1, 24)).toThrow('Invalid Kimi terminal size')
    expect(() => validateTerminalSize(80, 201)).toThrow('Invalid Kimi terminal size')
    expect(() => validateTerminalSinceSeq(-1)).toThrow('Invalid Kimi terminal sequence')
  })

  it('rejects unsafe terminal identifiers', () => {
    expect(() => assertTerminalId('terminal-1')).not.toThrow()
    expect(() => assertTerminalId('bad\0id')).toThrow('Invalid Kimi terminal id')
  })
})
