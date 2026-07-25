import { describe, expect, it } from 'vitest'
import { petAnimationFor, petAnimationStateFor } from '../../src/renderer/src/utils/petSprite.js'

describe('pet sprite projection', () => {
  it('collapses every public pet fact into only running or completed visuals', () => {
    const running = petAnimationFor('running')
    expect(running).toMatchObject({
      row: 0,
      frames: 16,
      columns: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      loop: true
    })
    expect(running.durations).toHaveLength(running.frames)
    expect(running.columns).toHaveLength(running.frames)
    for (const status of ['idle', 'waiting', 'completed', 'failed', 'review', 'disconnected'] as const) {
      expect(petAnimationStateFor(status)).toBe('completed')
      expect(petAnimationFor(status)).toMatchObject({ row: 1, frames: 1, loop: false })
    }
  })
})
