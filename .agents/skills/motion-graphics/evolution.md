# motion-graphics — evolution log

## Purpose
Route motion graphics requests to timeline-native semantic motion, Hyperframes overlays, or both. Scope: routing only — this skill holds no craft rules of its own; it delegates to video-typography, visual-timing, spatial-composition, and video-compositing for timeline-native work, or to the hyperframes-overlay CLI for animated overlays. Good looks like: every request lands on exactly one path (a deliberate "both" becomes separate proposals per path); motion is authored semantically, never as raw keyframes; revisions are edits through proposals; pixel proof via frame-state before done.

## 2026-10-10 — optional controls, audit trail and synthesized sound (experimental)

- **Observation:** The creator wants the model to author motion freely, with an audit trail and a review rating to measure whether exposing controls costs motion quality, and to experiment with code-synthesized sound.
- **Change:** Added the optional controls file, audit flags, the rating handoff, snapshots kept outside the source folder, the `sound-synth` route, and a bounded exception for self-contained motion pieces (mirrored in `dreamcut-proposals`).
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

## 2026-10-22 — One separable object per composition

- **Observation:** Asked for a demo from the logo and the words, the agent built three HyperFrames compositions (logo sting, kinetic line, wordmark decode), each a single clip holding a logo, a name, a tagline, two lines or a stamp. The creator could not select, move or restyle any of them on its own: "It's all one element. It's supposed to get broken up. So that a user can edit it." Declared actors did not help; actor-derived controls are not built. Across 49 local compositions, people changed a dial 20 times against 145 model revisions.
- **Change:**
  - Every separable object (logo, title, tagline, word block, stamp, picture) is its own timeline element; native elements are required for logos, titles, words and labels.
  - A composition draws one object and declares it as `"object": {"label", "native_gap"}`, with the reason repeated in the proposal rationale. At most one actor.
  - `hyperframes-overlay` check refuses new or changed source without that declaration, and renders its default frames to refuse one that shows more than one object at once (`scripts/composition-object-probe.ts`, grouping in `src/lib/hyperframes/composition-objects.ts`). Source that already passed keeps re-rendering for value changes.
  - The packaged Templates still draw several objects; each carries `"template"` and is listed in `MULTI_OBJECT_TEMPLATE_GAPS` until it is split.
- **Evidence:** On disposable project `zz-object-gate-check`, the demo's logo sting with an `object` declared was refused ("At 1.6s this composition shows 2 separable objects (picture, "Dream Cut")"); the decode word alone, without its subline, rendered. The demo's existing logo sting still passes `check` for value changes.
- **Regression protection:** `src/lib/hyperframes/composition-objects.test.ts`, `src/lib/hyperframes/composition-manifest.test.ts`.

## 2026-10-23 — looks supplied per graphic, split gaps recorded

- Each look is its own `looks/<id>.js` + `<id>.json`; `looks.json` holds only the order and the templates they work with.
- DreamCut supplies `looks.js` per graphic (runtime, kit and the chosen look) when it checks, previews and renders, so agents never send look code and a look change does not change the source. The 3.6 MB all-looks bundle is gone; a `looks.js` sent for a looks template is dropped.
- The object check now records a `split_gap` audit entry instead of skipping exempt templates, reads drawn regions inside transparent canvases, and flags canvases painted edge to edge. `pnpm project-health` lists gaps and the graphics panel shows "Not split" / "Pieces unchecked". Evidence: the Illustrated Explainer in the rebuilt looks paints world, headlines and art onto one opaque canvas, so it is flagged; splitting it into layers is the next step.


## 2026-10-23 — split templates into timeline pieces (Glass first)

- **Observation:** Rebuilt looks draw world, panels, headlines and art into one canvas, so every Illustrated Explainer graphic was "Not split". The creator wants each component and sound laid out on the timeline while playback stays the same. The object probe also read the template's fallback values instead of the values that render, and averaged a coarse grid, so thin connectors read as gaps.
- **Change:** The Illustrated Explainer has a fixed `layer` control (`stage`, `front`, `<scene>-<piece>`); a piece layer draws only its piece over the world and keeps what it adds, so stacked layers composite back to the whole. Looks mark pieces with `S.piece(key)` (Glass marks panes, people, chips, orbit dots, card and seal; a connector joins the piece it grows from, because HyperFrames' frozen-timeline check hashes a canvas to 8×8 pixels and cannot see a thin line on its own). The check probes the resolved values with their look bundle; a split layer is held to one object and only the whole graphic keeps the template exemption; `stage` and `front` are world layers. The probe takes each cell's strongest pixel, counts diagonal neighbours and lets faint cells join visible ones (a pane fading in is one object). A looks template's render cache key includes the supplied look code, and its check re-runs every time, so a look edit never reuses an old render or pass.
- **Evidence:** Glass reel rebuilt as `glass-split-rebuild` (55 layers, all passing the object check). Stacking every layer over the world matched the whole graphic within 0.4% of pixels at four sampled times; the residue is a chip behind the closing card that the card does not frost.
- **Next:** Mark pieces in the other looks (two at a time), then let `motion_graphic_prepare` expand a split template into its layers itself instead of one call per layer.
- **Follow-up (same day):** Pieces now render over the world and the earlier pieces, so frosted panes frost what is behind them; stacking matched the whole graphic with no pixels off at seven sampled times. Transparent renders are cropped to a window that moves with the content (`canvas_track` on the receipt, `source_canvas_track` on the clip); preview, GPU and export place each frame back on the canvas. On a disposable copy a chart piece became 806×418 instead of 1920×1080 and matched the uncropped layer in every compared frame (Standard renderer; GPU not checked visually). The glass-split-rebuild renders and cards predate cropping.

## 2026-10-23 — per-piece looks and the piece-type registry

- **Observation:** Split pieces were named by drawing order (`chart-1`, `object-3`), so nothing tied a piece to what it is, and a piece could only be drawn in the look of the whole graphic. The creator wants each piece to choose its own look, with content kept and style reset on a switch, and unsupported pieces refused visibly.
- **Change:** `looks/pieces.json` lists the Illustrated Explainer's piece types: sections (`stage`, `front`) and each scene's pieces, numbered (`#`) or named (`*`). Glass names its panes after those types (`chart-bars`, `object-callout-2`, `people-badge-1`, `compare-bridge`); a widget names its piece through `as(key, …)`. Linocut marks its title and closing art (birds, film, shears, offcut, moon, branch) as pieces instead of world. Looks declare the types they draw in `pieces`; every look draws a `stage`. The check refuses a piece in a look that does not draw it and names the looks that do; a split piece's Look lists only those looks. Controls can declare `resets_with`, and the looks templates reset `palette` and `texture` with the look. Transparent renders made before cropping existed are no longer reused from the cache.
- **Evidence:** On a disposable project, Linocut's title pieces (4 birds, film, shears, offcut) rendered over the Glass `stage` and read correctly in frame-state at 0.5, 1.2, 1.9 and 2.4 s. Linocut on `title-card` was refused ("Linocut has no title card piece. Looks with one: Glass."). Switching a Glass world to Linocut kept its words and scene lengths (8.2 s either way) and reset a Dark palette to Original. All 55 Glass layers re-planned under registry names.
- **Next:** Mark pieces in the other looks two at a time. Whole-scene types (`title`) exist as groups, but no look declares them yet: a scene usually holds several objects, which the object check refuses in one layer.

## 2026-10-25 — Animated Chart draws falls below zero

- **Observation:** A weekly market scoreboard (+2.07%, +0.64%, −0.22%, −0.45%) could not be drawn: the chart clamped every value to zero, its sliders started at 0, and its axis, bars and line assumed a baseline at the bottom. The creator called it a flaw in the template and asked for the real negative values.
- **Change:** The axis runs from a rounded floor below the deepest fall to a rounded ceiling above the largest rise (zero floor when nothing falls). Wide and square bars stand on or hang from a zero line with each value beyond its bar's end; tall bars grow right or left of zero with room for values on both sides; the line shades between itself and zero and puts a fall's value below its point. Value sliders span −1,000 to 1,000. A new Plus sign switch (`show_plus`, off by default) shows `+` on rises.
- **Evidence:** Snapshots in Blueprint at 1.6 s and 4.5 s for wide, tall and square bars, a line, and an all-negative chart: falls hang below the zero line, values sit beyond each bar's end without overlapping labels, and counts run from zero to the signed value. `motion-templates.test.ts` and the other hyperframes tests (46), `check:effects`, `check:tools`. Charts with only positive values keep their earlier layout.

## 2026-10-25 — charts build as the speaker talks, leave room for a presenter, and Blueprint text passes the render check

- **Observation:** Redrawing a talking recap's charts in Blueprint, every render failed the layout check (`text_not_painted` at 0.95 s): the stroke arrival made text fully transparent while its outline drew. Placed full screen, the chart ran under the presenter's corner bubble and the captions. And the chart built in its first 2–3 seconds and then sat still while the creator talked through each number in a different order; the creator asked for visuals that build while they talk.
- **Change:** The stroke arrival starts its fill as an 8% wash of the text's own colour and returns to the inherited fill when settled (Blueprint, Proof). Animated Chart gains Space below (`room_below`, % of height, fixed by placement) and Item 1–6 starts (`start_1..6`, seconds after Chart starts, fixed by placement, never earlier than the even gap); its duration and cues use the latest start, and a line with starts reaches each point at its item's start. Without starts and space the chart is unchanged.
- **Evidence:** Three Week Recap sections rendered through `hyperframes-overlay prepare` with check passing; render lengths matched their sections (17.2, 17.133, 13.1 s). Frame-state at each spoken mention shows each bar landing on its word and the oil line reaching each day in turn, clear of the bubble and captions. Hyperframes tests (46), `check:effects`, `check:looks`.
- **Gap noted:** `hyperframes-overlay prepare` does not prepare the editor preview, so the render must go through `media_readiness` before `proposal_create` accepts it; the editor route does this itself.

## 2026-10-25 — a 3D sketch city splits into world layers

- **Observation:** A sketched Manhattan fly-in (flat plan, streets, about 25,000 buildings, a hand-matched screen tower) landed as one baked clip on one lane, against split-into-pieces. Rendered as separate transparent pieces, the streets and buildings layers were refused: a layer of a city is thousands of separable shapes, not one object.
- **Change:** The 3D Sketch Scene template has its own world layers: with a `layer` control, `plan`, `streets` and `buildings` are world layers, like the Illustrated Explainer's `stage` and `front`; any other layer (a landmark) is still held to one object, and the whole scene in one clip is still one object. Each layer draws only its own part and draws the rest of the scene as depth only, so the stacked clips hide each other as the single scene would.
- **Evidence:** `composition-manifest.test.ts` (19), hyperframes tests (47), `check:tools`, typecheck. The fly-in's plan, buildings and landmark pieces rendered through `hyperframes-overlay prepare`; stacked, they matched the single-scene frames at 1.6, 2.4, 6, 10 and 13 s (mean difference about 2 of 255, under 0.05% of pixels off by more than 40).
- **Limit found:** a world layer that is blank paper for most of its length (streets alone, seen from street level) fails the HyperFrames frozen-timeline check, so the fly-in keeps its streets in the plan layer.

## 2026-10-25 — Sketch sounds follow the drawing
- **Observation:** Sounds placed by eye on a sketch intro missed the drawing; sounds driven by its activity curve lined up within 10 ms.
- **Decision:** Updated — the sketch-3d template points to `visual_activity_prepare` and sound-design for its sounds, noting that the render's measured motion before `camera_moves` is the drawing.
- **Verification:** Documentation pointer only; tool behaviour is recorded in docs/tools/evolution/sound-effects.md.

## 2026-10-25 — motion graphics export at full 2K/4K

- **Observation:** HyperFrames graphics are rendered once at the 1080p canvas, so a 2K/4K export stretched them; thin sketch-3d ink went soft next to 4K footage. The sketch-3d template also pinned WebGL to one pixel per CSS pixel, and the illustrated-explainer canvas was sized in CSS pixels, so even a high-density render would have stretched them.
- **Decision:** a 2K/4K export renders each graphic again at export time at 2x device pixels from its receipt's source and values (`hyperframes-overlay density`, `src/lib/render/export-density-motion.ts`), cached beside the render. Template canvases size their pixels by `devicePixelRatio` and draw through a matching scale. WebGL lines stay one device pixel wide, so sketch-3d ink is finer (thinner relative to the frame) at 4K than at 1080p.
- **Verification:** disposable copies: the sketch plan piece and an explainer graphic rendered at 2160 × 3840 / 3840 × 2160 and are visibly sharper than the stretched 1080 render; the explainer at 2x, scaled back down, matches its 1x render's layout (34 dB). Export swap unit tests pass. A full 4K export of a real project was not run.

## 2026-10-27 — Word Search Trace follows the project's shape
- **Observation:** The owner wanted every Template demo in the landscape shape the Effects cards show; the word-search composition was hard-coded to a 1080×1920 canvas.
- **Decision:** The template gains the fixed `shape` control and `canvas` sizes the explainer templates use (wide 1920×1080, tall 1080×1920, square 1080×1080). The page sizes itself from the root and lays the grid out from the chosen size. It defaults to `tall`, so earlier portrait renders are unchanged; the template page tells agents to set `shape` from the project.
- **Verification:** the manifest validates and resolves both sizes; `src/lib/hyperframes/*.test.ts` pass; demo project `tpl-word-search-bobblehead-demo` rendered on the wide canvas through `motion_graphic_prepare` and its proposal preview places the grid across the full 16:9 frame.

## 2026-10-27 — A Look on a new scene

- **Observation:** In session retro docs/audits/2026-10-27-proof-look-walking-man-retro.md (git-ignored), the owner selected the Proof look and asked for a man
  who walks, sees a rose and looks up at a cloud. The agent first drafted a generated video,
  then copied Proof's colours by hand into a figure with no `look` dial. Nothing documented
  `"looks": true` for a custom composition.
- **Decision:** Updated. [Explainer looks](templates/explainer-looks.md#a-look-on-a-new-scene)
  gains "A look on a new scene": split into native pieces plus one composition, set
  `"looks": true` with a `look` choice, draw with `DreamcutMotion` and `M.kit`, and probe
  draw-ons locally first. SKILL.md links it from the one-object rule.
- **Verification:** Documentation; the API names were checked against `looks/runtime.js`,
  `looks/kit.js` and `src/lib/hyperframes/look-bundle.ts`. Not yet run end to end on a disposable
  project.

## 2026-10-27 — Looks are drawn before they ship

- **Observation:** One session built "Hello, welcome to DreamCut" in Psychedelic Bloom with Kinetic Type. The render failed twice on shipped look bugs: Bloom's bundle lacked the Psychedelic look it builds on (the page threw, HyperFrames said only "Could not determine composition duration"), then its words were dark on its dark light show (contrast 1:1). About 4.5 of the 8 minutes to a card went to finding and fixing them. `pnpm check:looks` only parses each bundle, so both passed it. The session fixed Bloom and the base-look bundling in `2ecda47b`.
- **Decision:** Updated. `pnpm check:looks --render [--palettes] [--look <id>]` (`scripts/check-looks-render.mjs`) draws each look in Kinetic Type in headless Chrome and fails when the page throws, the timeline never builds or a word reads below 3:1 on the look's backdrop. [explainer-looks.md](templates/explainer-looks.md) asks for it before shipping a look. It is on demand (about 75 s for every look and palette), not part of `check:effects`, because it needs Chrome and 14 looks (18 look/palette pairs) fail it today.
- **Verification:** The pre-fix Bloom fails it both ways ("the page throws: Cannot read properties of undefined (reading 'inks')" with the old one-look bundle; "reads 1.00:1" with the old ink). Current Bloom passes. HyperFrames' own `check` agrees on truchet, papercraft and x-ray (fail) and paper (pass).
- **Limits:** One template (Kinetic Type, wide, build arrangement) and only plain words; accent words, panels and the other five templates are not drawn. The 18 failing pairs are listed in the retro and recorded as later work, not fixed.

## 2026-10-27 — A sound on every Kinetic Type word

- **Observation:** In the same session, asked for a pop as each word lands, the agent copied Kinetic Type's controls file to add `third_word` and `fourth_word` cues, searched sounds with `sfx_search` and hand-wrote each `create_audio`, putting them on `audio_1` (refused; sounds take `sound_effect_N`). `sfx_audition_prepare` already returns candidates with a ready `create_audio` on a free sound-effect lane, but the skill did not name it.
- **Decision:** Updated. [kinetic-type.md](templates/kinetic-type.md) gives the interim route (follow `second_word` with Beat offsets) and says not to copy the controls file; the skill names `sfx_audition_prepare` for cue sounds. One cue per word, derived from the phrase, is recorded as later work in the private project status.
- **Verification:** Documentation; offsets checked against `timeOf` in `kinetic-type/index.html` (word n lands at `lead_in + (n−1) × beat`). Not yet run on a fresh session.

## 2026-10-27 — 3D Sketch pieces keep every dial

- **Observation:** The creator could not restyle a 3D fly-in built from 3D Sketch Scene pieces: no Paper fill, Wobble or Camera on most pieces. The shared engine ignored `layer`, so the agent had forked `index.html` per project and trimmed each piece's controls file to a few dials. The Templates gallery also had no 3D Sketch card, though this template said it did.
- **Decision:** Updated. The shared engine draws one `layer` (default `all`) and keeps the rest as depth; the controls file declares the fixed Layer control, so every piece keeps every dial. Only the plan (or the whole scene) is opaque with Paper fill on. Faces now draw before lines, so with Paper fill off the drawing keeps its hidden lines instead of turning see-through. [sketch-3d.md](templates/sketch-3d.md) maps shapes to layers and forbids forking the engine or trimming controls per piece. `FX-MOTION-SKETCH-3D` is now a Templates card.
- **Verification:** `composition-manifest.test.ts` covers layers and the opaque rule; a headless render of a city with streets and a tower landmark, per layer, with Paper fill on and off: the stacked pieces match the whole scene within 0.01% of pixels, and Paper fill off draws the same ink as on.
- **Limits:** Projects already built on a forked engine keep it; moving them onto the shared engine is a per-project proposal.

## 2026-10-27 — Extending a 3D engine without losing renders

- **Observation:** One session extended a project's forked fly-in engine with neon lit windows. About 13 minutes went to failures the template did not warn about: a `ShaderMaterial` without the log-depth chunks never drew under `logarithmicDepthBuffer` (about 2 minutes of probes), one material shared by every window vanished when another piece's code turned its `colorWrite` off (about 3 minutes), a page reading its strokes by XHR timed out the object check (about 1 minute), and moving the timeline registration into a shared script failed lint, then the shared script ran before the page's elements existed (about 2 minutes). Pasting the 25 KB engine into four `motion_graphic_prepare` calls took about 80 s of composing each.
- **Decision:** Updated. [sketch-3d.md](templates/sketch-3d.md) gains "Extending the engine": split large code into a script whose one function the inline script calls, with the timeline registration inline, no fetch or XHR, one material per shape, and the log-depth chunks in custom shaders. `motion_graphic_prepare` now accepts a revision that sends only the changed files (see `docs/tools/evolution/model-authored-motion.md`).
- **Verification:** Documentation, from the session's own failures and fixes; not yet run on a fresh session.
- **Limits:** Sending a file still means pasting its full text; reading one from a local path is recorded as later work.
