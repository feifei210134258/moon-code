# Mimo look mechanics

## Physical construction

Mimo is a one-piece soft-vinyl cloud cat with a planted pear-shaped lower body, two small attached feet, tiny attached paws, two flexible-but-attached ears, and two large physical dark-navy eye globes set into the face. There are no props, tail, floating parts, text, or logo.

The lower body, feet, belly patch, baseline, practical scale, and horizontal center remain anchored. Gaze is led by the complete physical eye globes—the dark eye surfaces and highlights rotate together—followed by a small head/upper-body pitch or yaw. Eyelids reshape subtly. Ears follow the head with restrained lag; paws remain attached and nearly stable. The whole sprite never rotates, skews, or slides inside the cell.

## Cardinal pose families

- **000 up:** both complete eye globes aim upward; highlights and visible eye surfaces move together. Eyelids open slightly, face pitches up a little, ears become a touch more upright. Feet and belly remain fixed.
- **090 screen-right:** nose/mouth center and both eye aims shift unmistakably toward the image’s right edge. The head yaws slightly right; the screen-left cheek/ear surface becomes a little more visible while the far screen-right side is mildly occluded. Lower body remains centered.
- **180 down:** both complete eyes aim down, upper face pitches down, upper eyelids lower slightly, ears relax outward. Mouth stays small and identity-preserving. Feet and belly remain fixed.
- **270 screen-left:** exact semantic opposite of 090. Nose/mouth center and both eye aims shift toward the image’s left edge; head yaws left, screen-right cheek/ear surface becomes more visible, and the far screen-left side is mildly occluded.

## Interpolation and motion budget

Every 22.5-degree step advances the eyes, eyelids, face yaw/pitch, and small ear follow-through by approximately the same visual amount. Diagonals combine the adjacent cardinal families rather than inventing new poses. The transition across `157.5 → 180`, `337.5 → 000`, and the row boundary must remain one continuous clockwise loop with no reversal, snap, scale change, baseline jump, or eye replacement.

The final cells must read at normal pet size. Cardinals must be unmistakable without labels. Intermediate directions may be subtle, but each must retain the correct horizontal and vertical axes. No pupil-only stickers, googly replacement eyes, whole-body rotation, shadows, detached effects, labels, clocks, arrows, or degree text.
