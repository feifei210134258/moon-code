import type { PetVisualState } from '@shared/contracts'

export type PetDragDirection = 'left' | 'right'

export interface PetSpriteCell {
  row: number
  column: number
}

export interface PetSpriteAnimation {
  row: number
  frames: number
  durations: readonly number[]
  loop: boolean
}

const STANDARD_ANIMATIONS: Record<PetVisualState, PetSpriteAnimation> = {
  idle: { row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320], loop: true },
  running: { row: 7, frames: 6, durations: [120, 120, 120, 120, 120, 220], loop: true },
  waiting: { row: 6, frames: 6, durations: [150, 150, 150, 150, 150, 260], loop: true },
  completed: { row: 4, frames: 5, durations: [140, 140, 140, 140, 280], loop: false },
  failed: { row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240], loop: true },
  review: { row: 8, frames: 6, durations: [150, 150, 150, 150, 150, 280], loop: true },
  disconnected: { row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320], loop: true }
}

const DRAG_ANIMATIONS: Record<PetDragDirection, PetSpriteAnimation> = {
  right: { row: 1, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
  left: { row: 2, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220], loop: true }
}

export function petAnimationFor(
  status: PetVisualState,
  dragging = false,
  dragDirection: PetDragDirection = 'right'
): PetSpriteAnimation {
  return dragging ? DRAG_ANIMATIONS[dragDirection] : STANDARD_ANIMATIONS[status]
}

export function petLookDirectionIndex(dx: number, dy: number, deadzone = 12): number | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < deadzone) return null
  const clockwiseFromUp = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360
  return Math.round(clockwiseFromUp / 22.5) % 16
}

export function petLookCell(directionIndex: number): PetSpriteCell {
  const normalized = ((Math.round(directionIndex) % 16) + 16) % 16
  return normalized < 8
    ? { row: 9, column: normalized }
    : { row: 10, column: normalized - 8 }
}

