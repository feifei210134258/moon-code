Create Codex v2 pet look row 10 for `mimo` as exactly 8 full-body frames in this order: 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5.

REPAIR TARGET: the prior coherent row passed identity, scale, left/right, assembly, and continuity checks, but its `180` cardinal was classified as vertically ambiguous by a majority of blind reviewers at normal pet size. Preserve everything that passed. Redraw the complete coherent row so the first `180` pose is unmistakably looking DOWN without labels or context: rotate both complete physical eye globes downward inside their sockets, reshape the upper eyelids consistently, lower the face aim slightly, and keep the head/body identity intact. The downward pose must remain one natural 22.5-degree step after row 9's `157.5`; do not create a scale pop, registration jump, closed-eye expression, or exaggerated whole-head deformation. Keep `270` unmistakably screen-left and keep the final three poses progressing continuously up-left toward `000`.

FRONT-LOCKED REPAIR STRATEGY: the attached previous Row 10 is the authoritative body construction and continuity reference. Keep its nearly front-facing torso, mint belly oval, two planted feet, both paws, head silhouette, and practical body area in all eight frames. Do not turn Mimo into a side-profile or turntable sequence; do not hide the belly, one foot, one paw, or most of the face. The failed repair that yawed the whole body is explicitly rejected. Express the clockwise left-half gaze arc primarily through both complete eye globes, eyelids, a small face-surface shift, and at most a restrained head/upper-body follow-through. Preserve the previous row's scale and registration within a few pixels from frame to frame and at both row boundaries.

Use the canonical base, standard contact sheet, layout guide, approved four-cardinal strip, and `qa/look-mechanics.md`. Draw the complete eight-pose row as one coherent animation family, interpolating even 22.5-degree steps between the cardinal pose families. Keep the same pet identity, face construction, materials, palette, markings, and props. Each direction must read correctly at pet size and join continuously at the 000 and 180 boundaries.

DIRECTION TARGETS — use these to shape the coherent row, not as pixel-level landmark gates:

1. `180`: vertical DOWN; no horizontal requirement.
2. `202.5`: horizontal SCREEN-LEFT and vertical DOWN.
3. `225`: horizontal SCREEN-LEFT and vertical DOWN.
4. `247.5`: horizontal SCREEN-LEFT and vertical DOWN.
5. `270`: horizontal SCREEN-LEFT; no vertical requirement.
6. `292.5`: horizontal SCREEN-LEFT and vertical UP.
7. `315`: horizontal SCREEN-LEFT and vertical UP.
8. `337.5`: horizontal SCREEN-LEFT and vertical UP.

Cardinals must be unmistakable. Intermediate poses should broadly occupy the intended quadrant and advance naturally through the ordered loop. Minor pupil, nose, eyelid, or aiming-feature deviations are acceptable when the overall direction, continuity, identity, and motion remain coherent. Do not deform the character merely to make every intermediate axis independently obvious.

HARD LAYOUT AND CONTINUITY CONTRACT — DETERMINISTIC REGISTRATION: draw exactly eight separated pose groups in left-to-right direction order. Keep enough chroma-only space between neighboring poses that each complete pose can be detected without cutting through foreground. Approximate the guide's equal spacing, but do not distort a pose merely to hit an exact source-canvas coordinate; deterministic assembly will crop the eight ordered groups, then apply one shared scale and baseline.

Use the same body height, head size, baseline, and planted-body position across the generated family. Never overlap neighboring poses, merge two poses into one connected group, crop foreground at the outer canvas edge, or resize one pose independently.

Keep the feet, base, or lower torso planted at the same coordinates across all eight frames. Express direction through the eyes, face, head, upper body, and physically appropriate prop movement, not by moving, rotating, or rescaling the entire sprite.

ROW-BOUNDARY LOCK: 180 must continue directly from row 9's 157.5, matching its body size, baseline, planted anchor, expression, and construction. 337.5 must be one even 22.5-degree step before 000: nearly up-facing while remaining on the overall left-hand arc. Do not distort pupils, nose, or body geometry merely to exaggerate the subtle horizontal component.

PRE-RETURN CHECK: reject this result if it does not contain eight separated pose groups in the required order; neighboring poses overlap; foreground is cropped at the outer canvas edge; any frame changes sprite scale, body or head size, baseline, or planted-body position; the row visibly reverses into the wrong half of the loop; or 180 does not continue from 157.5 or 337.5 does not flow evenly into 000. Minor intermediate pupil or nose deviations are not rejection reasons. Exact cell cropping, resizing, and recentering happen deterministically after generation.

Use a flat pure user-selected #FF00FF background. One complete unclipped pose per invisible slot. No whole-sprite rotation, replacement eyes, labels, guide marks, shadows, glows, scenery, detached effects, or #FF00FF colors in the pet.
