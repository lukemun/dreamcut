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

## 2026-10-24 — one screen read for placement and checks

- **Observation:** Four overlap checks and two placers each rebuilt "what is on screen" (open space had its own caption-box copy and only one moment; sketch placement only avoided the face), so a placement could land on another graphic and be rejected afterwards.
- **Decision:** `readScreenSpace` (`src/lib/local-store/screen-space.ts`) is the one read: for a moment or span it returns occupants (speaker head and shoulders, every picture, text and shape through any camera) and regions free for the whole span. Element boxes come from `elementRectAt`, shared with the overlap check. `open_space_find` (now with `end_seconds` and `exclude_element_ids`), sketch placement and the proposal face check all use it.
- **Verification:** see the 2026-10-24 test and editor checks in this change.

## 2026-10-25 — framing_compile frames a region of a picture

- **Observation:** Framing a tutorial's screen recording on the app window took hand-computed scale and offsets (a 1.54:1 recording contained in the top half of a 9:16 canvas), and zooms with a fixed horizontal offset drifted onto the chat beside the app. `tutorialCameraPoseForSourceWindow` assumes the source matches the canvas shape and has no crop.
- **Decision:** `transformForSourceRect` in `src/lib/timeline/framing-geometry.ts` solves the renderer's contain → scale about the canvas centre → half-canvas offset for a source region shown in the visible (cropped) part of the canvas, with fit or fill. The `framing_compile` tool reads the clip's source size (or its prepared preview probe), the project canvas and the clip's crop, and returns still props or `transition_keyframes` for timed regions. It writes nothing.
- **Verification:** `framing-geometry.test.ts` (the tutorial's app window: scale 1.387, offsets −0.387 and −0.5; whole screen at scale 1; a zoom past 3× is reported as clamped), `check:tools`, typecheck.
- **Limits:** Regions are rectangles in source fractions; the agent still finds the app window by looking at frames. Rotation and mirrored sources are not handled.
