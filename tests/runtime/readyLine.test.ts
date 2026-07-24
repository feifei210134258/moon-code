import { describe, expect, it } from 'vitest'
import { parseRuntimeReadyOutput, redactRuntimeOutput } from '../../src/main/runtime/readyLine.js'

describe('Kimi runtime ready output', () => {
  it('extracts origin and token without exposing the fragment as an origin', () => {
    expect(parseRuntimeReadyOutput('Kimi server: http://127.0.0.1:54959#token=secret-value\n')).toEqual({
      origin: 'http://127.0.0.1:54959',
      token: 'secret-value'
    })
  })

  it('redacts URL fragments and banner token lines', () => {
    const raw = 'Kimi server: http://127.0.0.1:54959#token=secret-value\n  Token:    another-secret\n'
    const redacted = redactRuntimeOutput(raw)
    expect(redacted).not.toContain('secret-value')
    expect(redacted).not.toContain('another-secret')
    expect(redacted).toContain('#token=[redacted]')
  })
})
