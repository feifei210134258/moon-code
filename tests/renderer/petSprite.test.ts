import { describe, expect, it } from 'vitest'
import { petAnimationFor, petAnimationStateFor } from '../../src/renderer/src/utils/petSprite.js'

describe('pet sprite projection', () => {
  it('collapses every public pet fact into only running or completed visuals', () => {
    expect(petAnimationFor('running')).toMatchObject({ row: 0, frames: 8, loop: true })
    for (const status of ['idle', 'waiting', 'completed', 'failed', 'review', 'disconnected'] as const) {
      expect(petAnimationStateFor(status)).toBe('completed')
      expect(petAnimationFor(status)).toMatchObject({ row: 1, frames: 1, loop: false })
    }
  })
})
