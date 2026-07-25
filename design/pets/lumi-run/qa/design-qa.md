# Lumi Two-State Pet Design QA

- Source visual truth: `design/pets/lumi-run/references/selected-concept.png`
- Right running source strip: `design/pets/lumi-run/decoded/running-right-full-cycle.png`
- Left running source strip: `design/pets/lumi-run/decoded/running-left-full-cycle.png`
- Turn source strip: `design/pets/lumi-run/decoded/running.png`
- Implementation screenshots:
  - `design/pets/lumi-run/qa/implementation-running-full-cycle-0.jpg`
  - `design/pets/lumi-run/qa/implementation-running-full-cycle-2.jpg`
  - `design/pets/lumi-run/qa/implementation-running-full-cycle-8.jpg`
  - `design/pets/lumi-run/qa/implementation-running-full-cycle-10.jpg`
  - `design/pets/lumi-run/qa/implementation-completed-full-run-cycle.jpg`
- Combined comparison evidence: `design/pets/lumi-run/qa/source-vs-implementation-full-run-cycle.jpg`
- Motion timeline evidence: `design/pets/lumi-run/qa/playback-timeline-full-run-cycle.png`
- Animated motion preview: `design/pets/lumi-run/qa/previews/running-full-cycle.gif`
- Browser playback trace: `design/pets/lumi-run/qa/playback-sequence-full-run-cycle.json`
- Extraction comparison: `design/pets/lumi-run/qa/right-extraction-auto-vs-stable.png`
- Browser route: `http://127.0.0.1:4173/?pet-window=1&pet-fixture=running`
- Browser viewport: `240 × 160` CSS px (the in-app Browser enforces this minimum)
- Production Electron pet window: `112 × 140` CSS px
- Source pixels: selected concept `1536 × 1024`; right/left running strips `2048 × 768` each
- Implementation pixels: `240 × 160` per browser screenshot; sprite slot `96 × 104` CSS px
- Atlas: `3072 × 416` px; `192 × 208` px per cell rendered at `96 × 104` CSS px (2× source density)
- States: running animation and completed/static

The existing project-root `design-qa.md` belongs to the main workspace QA and was deliberately preserved. This pet-specific report is colocated with Lumi's source and browser evidence.

## Findings

No actionable P0, P1, or P2 mismatch remains.

- Running: the implementation preserves the white lunar fox, dark blue eyes, forehead crescent, and oversized moon-phase tail. The 16 unique poses contain a complete six-frame right bound, two-frame turn, complete six-frame left bound, and two-frame turn back.
- Completed: the implementation preserves the sleeping fox nested inside the circular crescent tail and remains fully static.
- The slightly softer appearance in the comparison board comes from enlarging a `96 × 104` runtime sprite for inspection; the native 2× atlas remains sharp at its intended desktop-pet size.

## Required Fidelity Surfaces

- Fonts and typography: not applicable; Lumi contains no text or typographic asset.
- Spacing and layout rhythm: both poses stay centered within the `96 × 104` display slot, keep safe transparent padding, and show no horizontal or vertical overflow. The larger `112 × 140` Electron window accommodates the expanded character and tooltip area.
- Colors and visual tokens: pearl white, cool blue-gray shading, navy eyes, pale blue crescent marks, and mint moon phases remain consistent with the selected concept. No extra status-color badge alters the two-state language.
- Image quality and asset fidelity: the subject, proportions, crescent-tail silhouette, transparent background, and crop match the selected direction. Component-fit extraction was retained after side-by-side review because stable-slot extraction visibly shrank the later landing poses. Final atlas validation found no edge contact, extraction warnings, or chroma rejection; alpha was preserved during despill.
- Copy and content: not applicable to the character asset. The surrounding tooltip continues to use live task title and status copy.

## Interaction and State Evidence

- Running fixture maps to atlas row `0`; browser sampling captured every column in the exact order `0…15` and then returned to `0`.
- Columns `0–5` show six distinct right-facing gait poses, `6–7` turn left, `8–13` show six distinct left-facing gait poses, and `14–15` turn back.
- Gait frames play at `170 ms` and turn frames at `230 ms`, for a `3240 ms` loop—slower than the prior `2080 ms` repeated-pose loop.
- Completed fixture maps to atlas row `1`, column `0`, with one non-looping frame.
- Dragging moves the pet window without introducing a separate character pose.
- `prefers-reduced-motion: reduce` holds the running state on its first frame.
- The atlas loaded at its expected natural size (`3072 × 416`), the fallback class was absent, and no image-load or layout failure appeared.

## Focused Region Evidence

The combined board places both complete generated gait strips above four browser-captured checkpoints (right crouch, right airborne stretch, left crouch, left airborne stretch). The motion timeline lays out all 16 unique playback poses at runtime size, and the browser trace independently records the observed frame/column order and slower timing.

## Comparison History

- Initial multi-direction source: P2 continuity issue—after a screen-left frame, the next two frames flipped back to screen-right, creating a visible direction snap.
- Fix iteration: regenerated only the failing transition so frames `4–6` remain three-quarter-left, left, and three-quarter-left while preserving Lumi's identity, scale, palette, and tail.
- Post-fix evidence: `source-vs-implementation-multidirectional.jpg` shows the repaired right → front → left → front loop in both source and runtime captures, with no remaining P0/P1/P2 mismatch.
- Cadence follow-up: the eight unique poses originally advanced once each, making each direction feel too brief. Playback now reuses the approved right and left gait pairs within a 16-step choreography; `playback-timeline-grouped.png` and the browser trace confirm that directions run in consecutive blocks rather than alternating every frame.
- Running-feel follow-up: repeating two right-facing poses still read as a bob instead of a run, and the prior `120 ms` timing hid the motion phases. The replacement uses six newly generated gait poses per direction—crouch, push-off, airborne stretch, gather, landing, recoil—and slows playback to `170/230 ms`. `playback-timeline-full-run-cycle.png`, the animated preview, and the browser trace show the corrected result.
- Extraction check: compared component-fit and stable-slot normalization. Stable slots reduced scale enough to make later poses visibly recede, so the component-fit result was retained; the final loop remains unclipped and readable at runtime size.

## Implementation Checklist

- [x] Running state uses 16 unique poses with full six-frame right and left gait cycles.
- [x] Completed/ended states use one static frame.
- [x] Public task states collapse to exactly those two pet visuals.
- [x] Transparent edges, cell bounds, crop, and browser overflow pass validation.
- [x] Selected concept identity and moon-tail silhouette remain legible at runtime size.

## Follow-up Polish

No blocking polish remains. A future optional pass could tune individual frame timing after observing Lumi during longer real tasks.

final result: passed
