import { describe, expect, it } from 'vitest'
import {
  MAX_PICKED_ELEMENTS,
  sanitizePickedElements
} from '../../src/main/browser/elementPickSanitize.js'
import type { BrowserPickedElement, BrowserPickedElementStyle } from '../../src/shared/contracts.js'

const identity = (value: string): string => value

function sampleElement(overrides: Partial<BrowserPickedElement> = {}): BrowserPickedElement {
  return {
    selector: 'button.save',
    xpath: '/html/body/button[1]',
    tag: 'button',
    ariaLabel: '保存',
    textSnippet: '保存并退出',
    rect: { x: 10, y: 20, width: 90, height: 36 },
    pageUrl: 'https://example.com/forms',
    pageTitle: '表单页',
    ...overrides
  }
}

const sampleStyles: BrowserPickedElementStyle = {
  display: 'inline-block',
  position: 'relative',
  fontFamily: 'PingFang SC',
  fontSize: '13px',
  fontWeight: '600',
  lineHeight: '1.5',
  color: '#fff',
  background: '#1d4ed8',
  padding: '8px 18px',
  margin: '0px',
  border: '1px solid rgb(29, 78, 216)',
  borderRadius: '6px'
}

describe('sanitizePickedElements', () => {
  it('passes well-formed elements through with URL/text redaction applied', () => {
    const [sanitized] = sanitizePickedElements(
      [sampleElement()],
      (value) => `redacted:${value}`,
      (value) => value.toUpperCase()
    )
    expect(sanitized).toEqual({
      selector: 'button.save',
      xpath: '/html/body/button[1]',
      tag: 'button',
      ariaLabel: '保存',
      textSnippet: '保存并退出',
      rect: { x: 10, y: 20, width: 90, height: 36 },
      pageUrl: 'redacted:https://example.com/forms',
      pageTitle: '表单页'.toUpperCase()
    })
  })

  it('normalizes missing or empty aria labels to null for the ??-fallback formatting', () => {
    const withNull = sanitizePickedElements([sampleElement({ ariaLabel: null })], identity, identity)
    const withEmpty = sanitizePickedElements([sampleElement({ ariaLabel: '' })], identity, identity)
    expect(withNull[0]!.ariaLabel).toBeNull()
    expect(withEmpty[0]!.ariaLabel).toBeNull()
  })

  it('bounds every string field and caps the element list at 20', () => {
    const oversized = Array.from({ length: 25 }, (_value, index) => sampleElement({
      selector: `s${index}-${'a'.repeat(600)}`,
      xpath: 'x'.repeat(600),
      tag: 't'.repeat(80),
      ariaLabel: 'l'.repeat(300),
      textSnippet: 'q'.repeat(400),
      pageUrl: 'https://example.com/' + 'p'.repeat(4_600),
      pageTitle: 'T'.repeat(600)
    }))
    const sanitized = sanitizePickedElements(oversized, identity, identity)
    expect(sanitized).toHaveLength(MAX_PICKED_ELEMENTS)
    const [first] = sanitized
    expect(first!.selector).toHaveLength(500)
    expect(first!.selector.endsWith('…')).toBe(true)
    expect(first!.xpath).toHaveLength(500)
    expect(first!.tag).toHaveLength(50)
    expect(first!.ariaLabel).toHaveLength(200)
    expect(first!.textSnippet).toHaveLength(300)
    expect(first!.pageUrl.length).toBeLessThanOrEqual(4_000)
    expect(first!.pageTitle.length).toBeLessThanOrEqual(512)
    expect(sanitized[19]!.selector.startsWith('s19-')).toBe(true)
  })

  it('rejects structurally invalid entries instead of guessing', () => {
    expect(() => sanitizePickedElements('nope', identity, identity)).toThrow('Invalid picked elements')
    expect(() => sanitizePickedElements([null], identity, identity)).toThrow('Invalid picked element')
    expect(() => sanitizePickedElements([{ ...sampleElement(), rect: { x: 0, y: 0, width: NaN, height: 5 } }],
      identity, identity)).toThrow('Invalid')
    expect(() => sanitizePickedElements([{ ...sampleElement(), selector: 42 }], identity, identity)).toThrow(
      'Invalid picked element selector'
    )
  })

  it('accepts viewport-scale rect values and rejects absurd ones', () => {
    const ok = sanitizePickedElements([sampleElement({ rect: { x: -1_000, y: 5_000, width: 4_000, height: 9_000 } })],
      identity, identity)
    expect(ok[0]!.rect).toEqual({ x: -1_000, y: 5_000, width: 4_000, height: 9_000 })
    expect(() => sanitizePickedElements([sampleElement({ rect: { x: 0, y: 0, width: 100_000_001, height: 5 } })],
      identity, identity)).toThrow('Invalid picked element rect width')
  })

  it('returns an empty list for an empty input array', () => {
    expect(sanitizePickedElements([], identity, identity)).toEqual([])
  })

  it('passes well-formed computed styles through', () => {
    const [sanitized] = sanitizePickedElements([sampleElement({ styles: sampleStyles })], identity, identity)
    expect(sanitized!.styles).toEqual(sampleStyles)
  })

  it('bounds style values to 120 characters', () => {
    const oversized = Object.fromEntries(
      Object.keys(sampleStyles).map((key) => [key, 'x'.repeat(300)])
    ) as unknown as BrowserPickedElementStyle
    const [sanitized] = sanitizePickedElements([sampleElement({ styles: oversized })], identity, identity)
    for (const value of Object.values(sanitized!.styles!)) {
      expect(value).toHaveLength(120)
      expect(value.endsWith('…')).toBe(true)
    }
  })

  it('drops structurally invalid style summaries instead of rejecting the element', () => {
    const invalid: unknown[] = [
      null,
      'nope',
      42,
      {},
      { ...sampleStyles, display: 42 },
      { ...sampleStyles, fontFamily: undefined }
    ]
    for (const styles of invalid) {
      const [sanitized] = sanitizePickedElements(
        [sampleElement({ styles: styles as BrowserPickedElementStyle })],
        identity,
        identity
      )
      expect(sanitized!.styles).toBeUndefined()
      expect(sanitized!.selector).toBe('button.save')
    }
  })
})