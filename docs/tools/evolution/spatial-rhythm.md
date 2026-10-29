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

## 2026-10-27 — framing_compile push-ins glide instead of snapping

- **Observation:** On the DreamCut tutorial every screen-recording zoom built with `framing_compile` played as a jump cut. The renderer applies a keyframe's ease to the move toward the next keyframe (`resolveSegment` uses the left key's ease), but the tool put each region's ease ("how the camera moves into this framing") on that region's own key, so a hold region froze the picture until the next key and then snapped, while the eased segment sat between two equal framings.
- **Decision:** Fixed. Each region's ease now goes on the keyframe before it, so it shapes the move into that framing; the last key carries no ease.
- **Verification:** `src/lib/agent/framing-compile.test.ts` (ease order, and the scale sits between the two framings mid-move and mid-pull-back); typecheck.
- **Limits:** Cards staged before this fix keep their snapping keyframes until restaged.

## 2026-10-27 — framing_compile can follow the mouse pointer

- **Observation:** On the DreamCut tutorial the creator asked for screen-recording zooms with "some gravity", following the mouse. Static push-ins had to guess one region per click, and the camera could not drift as the pointer moved across the app.
- **Decision:** `framing_compile` takes `follow_cursor` ({follow, smoothing, dead_zone}). `src/lib/media-analysis/cursor-track.ts` decodes the clip's source window at 10 fps, half size, gray (lanczos keeps the one-pixel outline), and matches masked templates of the macOS arrow and pointing hand (bright outline/fill share plus dark fill/ring share; the hand also needs dark either side of its raised finger, which rejects lit tile corners). The tip must be bright, which skips almost every position in one read. Search runs near the last position first; a jump elsewhere must score higher. Frames without a match (I-beam, typing) hold the last position. A critically damped spring with a dead zone moves the view centre toward the pointer, clamped inside the source frame (so a whole-frame region never moves), and the dense track is simplified to at most 120 linear keys per property. The regions still set zoom amount and timing; follow 0 is the plain framing.
- **Verification:** `src/lib/media-analysis/cursor-track.test.ts` (arrow tip found, lit tile ignored, spring settles without overshoot and stays in frame, follow 0 and whole-frame views stay put, dead zone, simplification), `framing-compile.test.ts`, typecheck. On the tutorial recording (188–216 s) the pointer was found in 74% of frames, every hit checked against a contact sheet, in 4 s for 28 s of footage.
- **Follow-up (same day, first real use on 12 tutorial zooms):** With timed regions the widest region (the app-window framing) now bounds the view and the lean fades in with the push-in, so the unzoomed framing never drifts onto what it leaves out; the spring moves only the lean, so the regions' own push-in timing is kept. The zoom keeps the regions' few eased media_scale keys and only the offsets are dense, because dense zoom keys made the card's Ramp in / Hold / Ramp out dials read the wrong spans. Key times are clamped to the clip's end. On the tutorial the pointer stayed inside the zoomed view in 255 of 257 sampled moments where it was found; the two misses are catch-ups after a fast jump (up to 3.8% of the frame for half a second).
- **Limits:** Templates fit the standard macOS pointer at Retina scale; other pointer sizes, themes, Windows cursors and the text I-beam are not tracked (the camera holds). Follow strength, smoothing and dead zone are compile-time inputs, not card dials: the card gets ordinary scale and offset keyframes, so retuning the follow means recompiling, and the dense offset keys are recorded control gaps. Clips split from one zoom are compiled separately; the agent continues the next clip from where the previous one ends.

## 2026-10-28 — rhythm maps record bars, drops and a fit to a stated tempo

- **Observation:** Cutting on the bar or landing a reveal on the drop had nothing to read: rhythm maps saved `downbeats: "unknown"` and no drops, and the tracker reports tempo in coarse steps (123.05 BPM for a house track that fits 122.0, about 0.8 s adrift by its end). The owner asked to bring these beat-grid ideas over from an external kinetic-type film skill (`beat_grid.py` in Scenario's Kinetic Film); it ships without a licence, so nothing was copied.
- **Decision:** `scripts/beat-grid.py` adds a fixed-tempo grid fit within 4% of an optional `--bpm`, kept only when its grid strength is at least the tracker's less 0.05; downbeats from the 4/4 bar phase with the strongest kick within 60 ms of the beat plus harmony change; and drops from per-bar bass and overall loudness. The kick band uses librosa's onset envelope so it shares the hits' clock (a raw centred STFT difference fired about 25 ms early). Schema 3 stores them with `tempo_hint_bpm`, `beat_source` and `grid_strength`; `beat_annotation_prepare` takes `expected_bpm`, and `beat_grid_get` and the route return `downbeats` and `drops` projected through the clip clock. The beat-aligned-cuts skill uses them when no hits are marked.
- **Verification:** `src/lib/local-store/beat-annotations.test.ts` on a 120 BPM fixture with a kick on every fourth beat from beat 1 and a drop at 32.5 s (tracked, then hinted at 118: grid fitted to 120 ± 0.05 across the whole track, bars and drop within 60 ms); `src/lib/timeline/beat-annotations.test.ts` (projection through trim and speed, ordering validation, older maps); typecheck. Manual runs on catalog tracks: four drops on "Bass Heavy Deep Drop" at the bass returns (17–18 dB), none on two steady house tracks, and the constant fit rejected on that same track, whose tempo moves between about 132 and 134 BPM.
- **Limits:** Not yet exercised through the running editor or a real proposal. Grid timing and hits share librosa's onset clock, about 15–20 ms after the attack on the fixture. Bars and drops are not drawn on the ruler or offered as snap targets. The catalog's `music-analyze.py` still takes every fourth beat from the first as its downbeats.
