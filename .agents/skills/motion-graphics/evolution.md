# motion-graphics — evolution log

## Purpose
Route motion graphics requests to timeline-native semantic motion, Hyperframes overlays, or both. Scope: routing only — this skill holds no craft rules of its own; it delegates to video-typography, visual-timing, spatial-composition, and video-compositing for timeline-native work, or to the hyperframes-overlay CLI for animated overlays. Good looks like: every request lands on exactly one path (a deliberate "both" becomes separate proposals per path); motion is authored semantically, never as raw keyframes; revisions are edits through proposals; pixel proof via frame-state before done.

## 2026-10-10 — optional controls, audit trail and synthesized sound (experimental)

- **Observation:** The creator wants the model to author motion freely, with an audit trail and a review rating to measure whether exposing controls costs motion quality, and to experiment with code-synthesized sound.
- **Change:** Added the optional controls file, audit flags, the rating handoff, snapshots kept outside the source folder, the `sound-synth` route, and a bounded exception for self-contained motion pieces (mirrored in `open-edit-proposals`).
- **Evidence:** [Design](../../../docs/architecture/model-authored-motion-graphics.md); [capability evolution](../../../docs/tools/evolution/model-authored-motion.md). Test project `dreamcut-logo-motion-test`.
- **Next:** Compare ratings and person edits across compositions with and without controls before choosing a default.

## 2026-10-10 — chat request to proposal (experimental)

- **Observation:** The creator wants a chat request to produce a proposed, tweakable motion graphic, not a Generate-tab approval step.
- **Change:** The editor agent writes and renders through `motion_graphic_prepare` / `sound_synth_prepare`, then proposes with `create_visual` / `create_audio`. Declared controls are dials on the proposal card; the rating and Add to Library live there too.
- **Evidence:** Test project `dreamcut-logo-motion-test` (sting and sound proposed); a disposable copy exercised a headline change end to end through the card.


## 2026-10-11 — Word Search Trace template

- **Observation:** Three snags while packaging a reusable overlay:
  - The CLI `prepare` does not create the editor preview, so the proposal was refused with a 409.
  - `lane_order_keys` is top-first, which first put the overlay behind the footage.
  - The renderer check fails a composition whose only motion is a stroke dash offset.
- **Decision:**
  - Keep reusable compositions under `templates/` with a recipe page.
  - Register renders through `motion_graphic_prepare` before proposing.
  - Put overlay lanes first in `lane_order_keys`.
  - Give the composition a small visible entrance.
- **Verification:**
  - The overlay renders over footage in the proposal Replay.
  - A second word set and uneven trace times render correctly.

## 2026-10-14 — Explainer templates (Claude Motion use cases)

- **Observation:** The creator wants the kinds of piece Anthropic's Claude Motion makes (explainers, animated charts, plan comparisons, walkthroughs, kinetic type) as Templates. Four snags came up while building them:
  - The renderer reads a composition's canvas size and length from the file before any script runs, so a control could not change either.
  - A full-frame card with its own backdrop failed the alpha check, and the failed render stayed in project media.
  - A top-level `const top` silently blanked a render.
  - A prepare call without values re-rendered the defaults.
- **Change:**
  - Added five templates, one composition each, with shared original looks in `templates/explainer-looks/looks.js`.
  - Controls files may declare `canvas` (a choice picks the render size) and `opaque_control` (a switch marks an opaque render as intended).
  - Templates omit the root `data-duration`, so the timeline sets the length.
  - A rejected render is deleted.
  - Always pass `values` when re-preparing for a proposal.
- **Evidence:** Demo projects `explainer-templates-demo` (16:9) and `explainer-templates-demo-vertical` (9:16, a second content set, other looks, and step pictures). Frame-state entrance, peak and settled frames for all ten proposals. On the card, a Hold change re-rendered and lengthened the clip, and a Look change re-rendered in Keynote.
- **Regression protection:** `src/lib/hyperframes/motion-templates.test.ts`, `src/lib/hyperframes/composition-manifest.test.ts`.

## 2026-10-15 — Word Search Trace follows Overlay length

- **Observation:** A fresh-context first-run test set `length: 8` for four 2 s shots; the card showed 8 s but the render stopped at 6.4 s, cutting the fourth outline and dropping the grid. The template's root and layers hard-code `data-duration`, which the renderer reads before scripts run.
- **Change:**
  - Word Search Trace declares `timing.duration` as `max(length, first_trace + 3 * trace_spacing + trace_speed + 0.3)`, matching its script, so the clip follows the control.
  - When a template keeps an authored root `data-duration`, the render copy now takes the declared length on the root and every layer spanning it (`applyDurationToHtml`). Templates without a root length are untouched.
- **Evidence:** `prepare` with `length: 8, trace_spacing: 2` on a disposable copy rendered 8.000 s; a frame at 7.9 s shows all four words circled with the grid present.
- **Regression protection:** `src/lib/hyperframes/composition-manifest.test.ts`.
