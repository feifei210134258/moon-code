import { describe, expect, it } from 'vitest'
import { isTrustedRendererUrl } from '../../src/main/security/trustedRenderer.js'

describe('trusted renderer URL policy', () => {
  it('accepts routes from the exact development origin', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/settings', 'http://localhost:5173/')).toBe(true)
  })

  it('rejects origins that only share a string prefix', () => {
    expect(isTrustedRendererUrl('http://localhost:5173.evil.test/', 'http://localhost:5173/')).toBe(false)
  })

  it('only accepts the packaged renderer entry file', () => {
    const trusted = 'file:///Applications/Kimi%20Agent.app/Contents/Resources/app.asar/out/renderer/index.html'
    expect(isTrustedRendererUrl(`${trusted}#session=1`, trusted)).toBe(true)
    expect(
      isTrustedRendererUrl(
        'file:///Applications/Kimi%20Agent.app/Contents/Resources/app.asar/secret.html',
        trusted
      )
    ).toBe(false)
  })

  it('fails closed for malformed URLs', () => {
    expect(isTrustedRendererUrl('not a URL', 'http://localhost:5173/')).toBe(false)
  })
})
