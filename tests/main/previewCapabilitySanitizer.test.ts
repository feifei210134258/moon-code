import { describe, expect, it } from 'vitest'
import { PreviewCapabilitySanitizer } from '../../src/main/browser/PreviewCapabilitySanitizer.js'

describe('PreviewCapabilitySanitizer', () => {
  it('removes preview origins, hostnames and bare capabilities from renderer-bound text', () => {
    const sanitizer = new PreviewCapabilitySanitizer()
    const token = 'a'.repeat(48)
    const origin = `http://${token}.0123456789abcdef.localhost:43123`
    sanitizer.register(origin, 'workspace/one')

    expect(sanitizer.sanitize(`${origin}/index.html`)).toBe('preview://workspace%2Fone/index.html')
    expect(sanitizer.sanitize(`${token}.0123456789abcdef.localhost`)).toBe('workspace%2Fone.preview')
    expect(sanitizer.sanitize(`token=${token}`)).toBe('token=[preview-capability]')
    expect(sanitizer.workspaceForOrigin(origin)).toBe('workspace/one')
  })
})
