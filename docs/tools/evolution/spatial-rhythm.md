# Inspect spatial evidence and prepare rhythm annotations — evolution

Capability: `spatial-rhythm`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Inspect spatial evidence and prepare rhythm annotations. Assessment/annotation preparation; preserve evidence limits.

## 2026-09-30 — initial capability registration

- **Observation:** Repository script/catalog audit found this capability family. This
  is code/discovery evidence, not measured editing frequency or a new runtime trial.
- **Decision:** Register existing implementation; audit remaining authoring-contract gaps incrementally.
- **Version:** Initial registry record; existing tool/recipe versions are unchanged.
- **Verification:** Catalog membership and owner/evolution paths checked by `check:tools`.
  Runtime behavior was not re-certified by this inventory.
- **Acceptance for next change:** Preserve existing authority tests; migrate recovery and accounting contracts with representative success/failure cases.
- **Evidence:** [Script audit and priorities](../script-audit.md). Private session
  traces remain outside this public log.

## 2026-10-12 — open space for emphasis text (`open_space_find`)

- **Observation:** A pull quote proposed beside a talking head was sized by guesswork (36% of the
  frame, 80–92px). The creator: it "isn't taking up enough space in the open area". No tool
  measured open space; `spatial_assess` only reports collisions and skips animated text, and this
  project's footage had no face tracks.
- **Decision:** `open_space_find` detects the face in the requested frame (Apple Vision, allowed by
  the benchmark's face, position, false-positive and determinism gates; body recall and tracking are
  not required), models the speaker as head plus shoulders, sets aside other on-screen pictures and
  text, and finds the largest clear rectangles in the safe area. It measures the real font in a
  headless browser at fixed sizes and returns, for fill levels medium 70%, large 85% (default) and
  full 95% of the region, the font size and props (fontSizePx, maxWidth, absX, absY) that centre the
  text in the region, plus a too-small/fills/spills verdict for existing text.
- **Verification:** `src/lib/media-analysis/open-space.test.ts` (regions beside a head, avoidance,
  sizing). On the real project at 22.8 s it found a 648×702 region left of the speaker.
- **Not yet:** the level is chosen at proposal time; the editor does not re-fit text when the
  creator changes it. Body detection is a face-based estimate.

## 2026-10-12 — Speaker clearance at staging

- **Problem:** middle-centre captions over a centred talking head were staged with no warning. The element overlap check cannot see a face inside footage, and the talking clips play a prepared copy with no face-track analysis, so face coverage came back "unknown" (145 unknowns) and unknowns raise no warning.
- **Change:** proposal staging runs `reviewSpeakerClearance`. For options that add or change text, or re-frame footage under text, it samples up to ten moments, finds the face in each frame with Apple Vision (one batched call, 640 px frames, through the clip's zoom and offset) and returns `speaker_clearance` plus a warning naming the covered times. `speakerHeadsAt` in `local-store/open-space.ts` and `captionRectangle` in `visual-overlap.ts` are the shared pieces.
- **Evidence:** the superseded middle-centre card is flagged at 10 of 10 moments for both placements; the replacement below-face card is 0 of 10. Ten frames take about 2 s.
- **Not yet:** clearance is sampled, not continuous; the head region is a face-based estimate.
