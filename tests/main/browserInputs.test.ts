import { describe, expect, it } from 'vitest'
import {
  isAllowedBrowserNavigation,
  validateBrowserBounds,
  validateBrowserRequestId,
  validateBrowserUrl,
  validateBrowserViewport,
  validateBrowserWorkspaceScope
} from '../../src/main/security/browserInputs.js'

describe('browser IPC input validation', () => {
  it('normalizes explicit and localhost HTTP URLs', () => {
    expect(validateBrowserUrl('localhost:5173')).toBe('http://localhost:5173/')
    expect(validateBrowserUrl('https://example.com/app')).toBe('https://example.com/app')
    expect(isAllowedBrowserNavigation('http://token.root.localhost:1234/index.html')).toBe(true)
  })

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,bad', 'https://user:pass@example.com'])
  ('rejects unsafe navigation: %s', (url) => {
    expect(() => validateBrowserUrl(url)).toThrow('Invalid browser URL')
    expect(isAllowedBrowserNavigation(url)).toBe(false)
  })

  it('bounds view geometry and emulation settings', () => {
    expect(validateBrowserBounds({ x: 10, y: 20, width: 400, height: 500 })).toEqual({
      x: 10, y: 20, width: 400, height: 500
    })
    expect(validateBrowserViewport({ mode: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 })).toEqual({
      mode: 'mobile', width: 390, height: 844, deviceScaleFactor: 2
    })
    expect(validateBrowserViewport({ mode: 'auto' })).toEqual({
      mode: 'auto', width: null, height: null, deviceScaleFactor: 1
    })
    expect(() => validateBrowserBounds({ x: -1, y: 0, width: 0, height: 1 })).toThrow()
    expect(() => validateBrowserViewport({ mode: 'custom', width: 100, height: 100, deviceScaleFactor: 10 })).toThrow()
  })

  it('accepts only bounded opaque CDP request ids', () => {
    expect(validateBrowserRequestId('12345.67')).toBe('12345.67')
    expect(() => validateBrowserRequestId('bad\nrequest')).toThrow()
  })

  it('accepts a bounded workspace scope or an explicit unscoped state', () => {
    expect(validateBrowserWorkspaceScope('workspace-1')).toBe('workspace-1')
    expect(validateBrowserWorkspaceScope(null)).toBeNull()
    expect(() => validateBrowserWorkspaceScope('bad\0scope')).toThrow()
  })
})
