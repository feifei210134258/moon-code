import type { PetVisualState } from '@shared/contracts'

/* Legacy Mimo helpers stay exported while its unused component remains in-tree.
 * Lumi deliberately ignores them and exposes only the two animation states below. */
export type PetDragDirection = 'left' | 'right'

export interface PetSpriteCell {
  row: number
  column: number
}

export interface PetSpriteAnimation {
  row: number
  frames: number
  durations: readonly number[]
  columns?: readonly number[]
  loop: boolean
}

const RUNNING_COLUMNS = [
  0, 1, 0, 1, 0, 1,
  2, 3,
  4, 5, 4, 5, 4, 5,
  6, 7
] as const

const TWO_STATE_ANIMATIONS = {
  running: {
    row: 0,
    frames: RUNNING_COLUMNS.length,
    durations: [120, 120, 120, 120, 120, 120, 160, 160, 120, 120, 120, 120, 120, 120, 160, 160],
    columns: RUNNING_COLUMNS,
    loop: true
  },
  completed: { row: 1, frames: 1, durations: [0], loop: false }
} as const satisfies Record<'running' | 'completed', PetSpriteAnimation>

export function petAnimationStateFor(status: PetVisualState): 'running' | 'completed' {
  return status === 'running' ? 'running' : 'completed'
}

export function petAnimationFor(
  status: PetVisualState,
  _dragging = false,
  _dragDirection: PetDragDirection = 'right'
): PetSpriteAnimation {
  return TWO_STATE_ANIMATIONS[petAnimationStateFor(status)]
}

export function petLookCell(directionIndex: number): PetSpriteCell {
  const normalized = ((Math.round(directionIndex) % 16) + 16) % 16
  return normalized < 8
    ? { row: 9, column: normalized }
    : { row: 10, column: normalized - 8 }
}
