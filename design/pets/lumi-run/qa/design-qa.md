# Lumi Two-State Pet Design QA

- Source visual truth: `design/pets/lumi-run/references/selected-concept.png`
- Implementation screenshots:
  - `design/pets/lumi-run/qa/implementation-running-full.png`
  - `design/pets/lumi-run/qa/implementation-completed-full.png`
- Combined comparison evidence: `design/pets/lumi-run/qa/source-vs-implementation.png`
- Browser route: `http://127.0.0.1:4173/?pet-window=1&pet-fixture=running`
- Browser viewport: `240 × 160` CSS px (the in-app Browser enforces this minimum)
- Production Electron pet window: `112 × 140` CSS px
- Source pixels: `1536 × 1024`, containing both selected poses
- Implementation pixels: `240 × 160` per browser screenshot; sprite slot `96 × 104` CSS px
- Atlas density: `192 × 208` px per cell rendered at `96 × 104` CSS px (2× source density)
- States: running animation and completed/static

The existing project-root `design-qa.md` belongs to the main workspace QA and was deliberately preserved. This pet-specific report is colocated with Lumi's source and browser evidence.

## Findings

No actionable P0, P1, or P2 mismatch remains.

- Running: the implementation preserves the white lunar fox, forward working pose, dark blue eyes, forehead crescent, and oversized moon-phase tail. Six frames provide visible motion without adding a third visual state.
- Completed: the implementation preserves the sleeping fox nested inside the circular crescent tail and remains fully static.
- The slightly softer appearance in the comparison board comes from enlarging a `96 × 104` runtime sprite for inspection; the native 2× atlas remains sharp at its intended desktop-pet size.

## Required Fidelity Surfaces

- Fonts and typography: not applicable; Lumi contains no text or typographic asset.
- Spacing and layout rhythm: both poses stay centered within the `96 × 104` display slot, keep safe transparent padding, and show no horizontal or vertical overflow. The larger `112 × 140` Electron window accommodates the expanded character and tooltip area.
- Colors and visual tokens: pearl white, cool blue-gray shading, navy eyes, pale blue crescent marks, and mint moon phases remain consistent with the selected concept. No extra status-color badge alters the two-state language.
- Image quality and asset fidelity: the subject, proportions, crescent-tail silhouette, transparent background, and crop match the selected direction. Atlas validation found no edge contact, extraction warnings, or chroma rejection; alpha was preserved during despill.
- Copy and content: not applicable to the character asset. The surrounding tooltip continues to use live task title and status copy.

## Interaction and State Evidence

- Running fixture maps to atlas row `0`; the observed frame advanced from column `0` to column `3` after 420 ms.
- Completed fixture maps to atlas row `1`, column `0`, with one non-looping frame.
- Dragging moves the pet window without introducing a separate character pose.
- `prefers-reduced-motion: reduce` holds the running state on its first frame.
- Browser console: 0 warnings, 0 errors.

## Focused Region Evidence

No additional crop was required because the character is the only visible design surface and fills the combined comparison board at a readable inspection size. The board shows both source poses directly above their corresponding implementation states.

## Comparison History

- Initial comparison: no actionable P0/P1/P2 issue identified.
- Fix iteration: none required.
- Post-fix evidence: not applicable.

## Implementation Checklist

- [x] Running state is animated with six looping frames.
- [x] Completed/ended states use one static frame.
- [x] Public task states collapse to exactly those two pet visuals.
- [x] Transparent edges, cell bounds, crop, and browser overflow pass validation.
- [x] Selected concept identity and moon-tail silhouette remain legible at runtime size.

## Follow-up Polish

No blocking polish remains. A future optional pass could tune individual frame timing after observing Lumi during longer real tasks.

final result: passed
