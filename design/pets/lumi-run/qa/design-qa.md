# Lumi Two-State Pet Design QA

- Source visual truth: `design/pets/lumi-run/references/selected-concept.png`
- Multi-direction source strip: `design/pets/lumi-run/decoded/running.png`
- Implementation screenshots:
  - `design/pets/lumi-run/qa/implementation-running-direction-0.jpg`
  - `design/pets/lumi-run/qa/implementation-running-direction-2.jpg`
  - `design/pets/lumi-run/qa/implementation-running-direction-4.jpg`
  - `design/pets/lumi-run/qa/implementation-running-direction-6.jpg`
  - `design/pets/lumi-run/qa/implementation-running-grouped.jpg`
  - `design/pets/lumi-run/qa/implementation-completed-multidirectional-atlas.jpg`
- Combined comparison evidence: `design/pets/lumi-run/qa/source-vs-implementation-multidirectional.jpg`
- Motion timeline evidence: `design/pets/lumi-run/qa/playback-timeline-grouped.png`
- Browser playback trace: `design/pets/lumi-run/qa/playback-sequence-grouped.json`
- Browser route: `http://127.0.0.1:4173/?pet-window=1&pet-fixture=running`
- Browser viewport: `240 × 160` CSS px (the in-app Browser enforces this minimum)
- Production Electron pet window: `112 × 140` CSS px
- Source pixels: selected concept `1536 × 1024`; multi-direction strip `2048 × 768`
- Implementation pixels: `240 × 160` per browser screenshot; sprite slot `96 × 104` CSS px
- Atlas: `1536 × 416` px; `192 × 208` px per cell rendered at `96 × 104` CSS px (2× source density)
- States: running animation and completed/static

The existing project-root `design-qa.md` belongs to the main workspace QA and was deliberately preserved. This pet-specific report is colocated with Lumi's source and browser evidence.

## Findings

No actionable P0, P1, or P2 mismatch remains.

- Running: the implementation preserves the white lunar fox, dark blue eyes, forehead crescent, and oversized moon-phase tail. Eight source poses are choreographed into a 16-step loop: six consecutive right-facing steps, a two-step turn, six consecutive left-facing steps, then a two-step turn back.
- Completed: the implementation preserves the sleeping fox nested inside the circular crescent tail and remains fully static.
- The slightly softer appearance in the comparison board comes from enlarging a `96 × 104` runtime sprite for inspection; the native 2× atlas remains sharp at its intended desktop-pet size.

## Required Fidelity Surfaces

- Fonts and typography: not applicable; Lumi contains no text or typographic asset.
- Spacing and layout rhythm: both poses stay centered within the `96 × 104` display slot, keep safe transparent padding, and show no horizontal or vertical overflow. The larger `112 × 140` Electron window accommodates the expanded character and tooltip area.
- Colors and visual tokens: pearl white, cool blue-gray shading, navy eyes, pale blue crescent marks, and mint moon phases remain consistent with the selected concept. No extra status-color badge alters the two-state language.
- Image quality and asset fidelity: the subject, proportions, crescent-tail silhouette, transparent background, and crop match the selected direction. Atlas validation found no edge contact, extraction warnings, or chroma rejection; alpha was preserved during despill.
- Copy and content: not applicable to the character asset. The surrounding tooltip continues to use live task title and status copy.

## Interaction and State Evidence

- Running fixture maps to atlas row `0`; the 16-step playback sequence groups the direction as right → turn → left → turn instead of alternating left/right on adjacent frames.
- Earlier asset verification advanced from atlas column `5` to column `1` in 610 ms, confirming that all directional source poses load and animate.
- Follow-up browser sampling captured the exact grouped column order `0,1,0,1,0,1,2,3,4,5,4,5,4,5,6,7`: six right-facing steps, two turn steps, six left-facing steps, then two turn-back steps.
- Completed fixture maps to atlas row `1`, column `0`, with one non-looping frame.
- Dragging moves the pet window without introducing a separate character pose.
- `prefers-reduced-motion: reduce` holds the running state on its first frame.
- The atlas loaded at its expected natural size (`1536 × 416`), the fallback class was absent, and no image-load or layout failure appeared.

## Focused Region Evidence

The combined board places the complete generated source strip above four browser-captured checkpoints (right, front, left, front). The motion timeline then lays out all 16 playback steps at runtime size, while the browser trace independently records the observed frame and atlas-column order. Together they show both source fidelity and the requested grouped cadence.

## Comparison History

- Initial multi-direction source: P2 continuity issue—after a screen-left frame, the next two frames flipped back to screen-right, creating a visible direction snap.
- Fix iteration: regenerated only the failing transition so frames `4–6` remain three-quarter-left, left, and three-quarter-left while preserving Lumi's identity, scale, palette, and tail.
- Post-fix evidence: `source-vs-implementation-multidirectional.jpg` shows the repaired right → front → left → front loop in both source and runtime captures, with no remaining P0/P1/P2 mismatch.
- Cadence follow-up: the eight unique poses originally advanced once each, making each direction feel too brief. Playback now reuses the approved right and left gait pairs within a 16-step choreography; `playback-timeline-grouped.png` and the browser trace confirm that directions run in consecutive blocks rather than alternating every frame.

## Implementation Checklist

- [x] Running state uses eight source poses in a grouped 16-step multi-direction loop.
- [x] Completed/ended states use one static frame.
- [x] Public task states collapse to exactly those two pet visuals.
- [x] Transparent edges, cell bounds, crop, and browser overflow pass validation.
- [x] Selected concept identity and moon-tail silhouette remain legible at runtime size.

## Follow-up Polish

No blocking polish remains. A future optional pass could tune individual frame timing after observing Lumi during longer real tasks.

final result: passed
