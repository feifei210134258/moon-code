import { describe, expect, it } from 'vitest'
import { petAnimationFor, petLookCell, petLookDirectionIndex } from '../../src/renderer/src/utils/petSprite.js'

describe('pet sprite projection', () => {
  it('maps runtime states and drag direction to the v2 atlas contract', () => {
    expect(petAnimationFor('idle')).toMatchObject({ row: 0, frames: 6 })
    expect(petAnimationFor('waiting')).toMatchObject({ row: 6, frames: 6 })
    expect(petAnimationFor('running')).toMatchObject({ row: 7, frames: 6 })
    expect(petAnimationFor('review')).toMatchObject({ row: 8, frames: 6 })
    expect(petAnimationFor('failed')).toMatchObject({ row: 5, frames: 8 })
    expect(petAnimationFor('completed')).toMatchObject({ row: 4, frames: 5, loop: false })
    expect(petAnimationFor('running', true, 'right')).toMatchObject({ row: 1, frames: 8 })
    expect(petAnimationFor('running', true, 'left')).toMatchObject({ row: 2, frames: 8 })
  })

  it('quantizes pointer gaze clockwise from up and preserves a center deadzone', () => {
    expect(petLookDirectionIndex(0, 0)).toBeNull()
    expect(petLookDirectionIndex(0, -40)).toBe(0)
    expect(petLookDirectionIndex(40, 0)).toBe(4)
    expect(petLookDirectionIndex(0, 40)).toBe(8)
    expect(petLookDirectionIndex(-40, 0)).toBe(12)
    expect(petLookCell(0)).toEqual({ row: 9, column: 0 })
    expect(petLookCell(7)).toEqual({ row: 9, column: 7 })
    expect(petLookCell(8)).toEqual({ row: 10, column: 0 })
    expect(petLookCell(15)).toEqual({ row: 10, column: 7 })
  })
})
