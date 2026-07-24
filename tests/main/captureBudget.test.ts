import { describe, expect, it } from 'vitest'
import { captureSizeWithinBudget } from '../../src/main/browser/captureBudget.js'

describe('captureSizeWithinBudget', () => {
  it('accounts for device scale in full-page and viewport captures', () => {
    expect(captureSizeWithinBudget(1_000, 1_000, 4, false)).toEqual({ width: 1_000, height: 1_000 })
    expect(() => captureSizeWithinBudget(2_000, 1_000, 4, false)).toThrow('Viewport is too large')
    expect(() => captureSizeWithinBudget(2_000, 1_000, 4, true)).toThrow('Page is too large')
  })

  it('rejects unknown, zero and non-finite capture sizes before CDP allocation', () => {
    expect(() => captureSizeWithinBudget(null, 800, 1, false)).toThrow()
    expect(() => captureSizeWithinBudget(800, 0, 1, false)).toThrow()
    expect(() => captureSizeWithinBudget(Number.POSITIVE_INFINITY, 800, 1, false)).toThrow()
  })
})
