import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { Session, WebContents } from 'electron'
import { registerGuestSessionGuards } from '../../src/main/browser/guestSessionGuards.js'

class FakeSession extends EventEmitter {
  permissionHandler: ((...args: unknown[]) => void) | null = null
  permissionCheckHandler: ((...args: unknown[]) => boolean) | null = null
  beforeSendHeadersHandler: ((...args: unknown[]) => void) | null = null
  webRequest = {
    onBeforeSendHeaders: (...args: unknown[]): void => {
      const handler = args.length === 1 ? args[0] : args[1]
      this.beforeSendHeadersHandler = handler as ((...args: unknown[]) => void) | null
    }
  }

  setPermissionRequestHandler(handler: ((...args: unknown[]) => void) | null): void {
    this.permissionHandler = handler
  }

  setPermissionCheckHandler(handler: ((...args: unknown[]) => boolean) | null): void {
    this.permissionCheckHandler = handler
  }
}

describe('registerGuestSessionGuards', () => {
  it('denies permissions, blocks only the owning guest download and cleans up exactly once', () => {
    const session = new FakeSession()
    const contents = { id: 42, session: session as unknown as Session }
    const blocked = vi.fn()
    const cleanup = registerGuestSessionGuards(
      contents as Pick<WebContents, 'id' | 'session'>,
      blocked,
      (url) => url.includes('preview.localhost') ? { 'x-preview-capability': 'secret' } : null
    )

    const permissionCallback = vi.fn()
    session.permissionHandler?.({ id: 42 }, 'camera', permissionCallback, {})
    expect(permissionCallback).toHaveBeenCalledWith(false)
    expect(session.permissionCheckHandler?.({ id: 42 }, 'geolocation', 'https://example.com', {})).toBe(false)
    expect(session.listenerCount('will-download')).toBe(1)

    const authorized = vi.fn()
    session.beforeSendHeadersHandler?.({
      url: 'http://preview.localhost/index.html',
      requestHeaders: { 'X-Preview-Capability': 'attacker', accept: 'text/html' }
    }, authorized)
    expect(authorized).toHaveBeenCalledWith({
      requestHeaders: { accept: 'text/html', 'x-preview-capability': 'secret' }
    })

    const unrelatedEvent = { preventDefault: vi.fn() }
    session.emit('will-download', unrelatedEvent, {}, { id: 7 })
    expect(unrelatedEvent.preventDefault).not.toHaveBeenCalled()
    expect(blocked).not.toHaveBeenCalled()

    const event = { preventDefault: vi.fn() }
    session.emit('will-download', event, {}, { id: 42 })
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(blocked).toHaveBeenCalledOnce()

    cleanup()
    cleanup()
    expect(session.permissionHandler).toBeNull()
    expect(session.permissionCheckHandler).toBeNull()
    expect(session.listenerCount('will-download')).toBe(0)
    expect(session.beforeSendHeadersHandler).toBeNull()
  })

  it('does not accumulate download listeners across repeated guest scopes', () => {
    const firstSession = new FakeSession()
    const secondSession = new FakeSession()
    const firstCleanup = registerGuestSessionGuards(
      { id: 1, session: firstSession as unknown as Session } as Pick<WebContents, 'id' | 'session'>,
      vi.fn(),
      () => null
    )

    firstCleanup()
    registerGuestSessionGuards(
      { id: 2, session: secondSession as unknown as Session } as Pick<WebContents, 'id' | 'session'>,
      vi.fn(),
      () => null
    )

    expect(firstSession.listenerCount('will-download')).toBe(0)
    expect(secondSession.listenerCount('will-download')).toBe(1)
  })
})
