# Model-authored motion graphics and sound — evolution

Capability: `model-authored-motion`. Registry: [registry.json](../registry.json).
Design: [model-authored motion graphics and sound](../../architecture/model-authored-motion-graphics.md).

## Purpose and boundary

The agent writes motion graphics (HyperFrames HTML/GSAP) and sounds (JavaScript
synthesis) as code, in the medium it is already good at. It may declare creator
controls, actors and stretchable holds in an optional `dreamcut.controls.json`, or none.
Every check and render appends to an audit trail so the effect of controls on motion
quality can be measured before any default is chosen. Rendering a composition still
needs human preview approval; nothing here edits a timeline or approves a proposal.

## 2026-10-10 — experimental implementation, slice 1

- **Observation:** HyperFrames overlays rendered as one opaque clip with no record of who
  wrote which revision, what was exposed to the creator or how the creator judged it. The
  creator asked to let the model work freely, experiment with code-synthesized sound, and
  audit everything, with a rating captured in review.
- **Change:**
  - Optional controls file: parsed and validated by `composition-manifest.ts`. Values are
    injected at render into a temporary copy (`window.__dreamcut`), so the source
    fingerprint never changes. Receipts record manifest hash, values and segment durations.
  - Validation gates correctness only: malformed file, declared control or hold never read,
    declared actor with no `data-actor` element. Remote resources and untagged actors are
    warnings. The HyperFrames runtime check output is captured into the audit.
  - Audit trail: append-only JSONL under `audit/motion/{compositions,sounds}/<id>.jsonl`
    (outside the source so appends never change fingerprints). Events: revision,
    coverage, validation, render, value_change, placement, model_request, review.
    Agent identity comes from `--agent/--model/--effort`; without it, the action is
    recorded as a person in the editor.
  - Review rating: optional 1–5 in Generate → Motion graphics before Approve and render,
    passed to `render --rating` and stored as a `review` event.
  - Sound: `pnpm sound-synth scaffold|check|render`. Programs run in an isolated VM context
    with seeded `Math.random`, no Node globals or string code generation, 10 s timeout and
    30 s output cap; output is 16-bit 48 kHz WAV with a receipt.
  - `pnpm project-health` summarizes revisions, renders, coverage, person edits, missed
    controls and ratings per composition and sound.
- **Verification:** Unit tests for manifest parsing/validation/injection, audit
  append/read/summary, rating parsing, synth determinism and isolation. A test project
  (`dreamcut-logo-motion-test`) built a logo sting with five controls, six actors and one
  hold, and a synthesized soundtrack; checks and renders appended the expected events, and
  re-rendering the sound produced the identical file. The rating control was exercised in
  the running editor (pressed state set and cleared). The composition render itself awaits
  the creator's approval, so the parameterized render path and review event from the UI
  are not yet exercised end to end.
- **Limits:** `value_change`, `placement` and `model_request` events have schemas and
  summaries but no automatic writers yet; inspector controls, actor-derived controls, hold
  retiming and sound anchoring to markers are not implemented. The synth VM is a
  determinism boundary, not a security sandbox. No MCP tool exposes these CLIs.

## 2026-10-10 — chat request to proposal, slice 2

- **Observation:** The creator wants motion graphics to come from an ordinary chat request
  and be proposed and tuned like any edit, not approved in Generate; synthesized audio
  should be proposed too, with an option to add it to the Library through media intake.
- **Change:**
  - MCP tools `motion_graphic_prepare`, `motion_graphic_status` and `sound_synth_prepare`
    (family `model-authored-motion`, added to the desktop editing session and operator
    allowlist). Composition renders wait up to 20 s inline, under the editor agent's 30 s
    tool timeout, then continue as a durable job.
  - Candidate renders are keyed by (source fingerprint, values) and reused.
  - Proposal review exposes `motion_items` with the composition's controls and the values
    of every render of the same source. A creator's control change re-renders and swaps
    the clip through the `motion_render_source_url` override (same composition, same
    project only); Apply waits while it renders.
  - Approve, batch approve and reject record `review` (with optional rating) and
    `placement` audit events.
  - Add to Library copies the exact WAV into the SFX catalog under
    `owned/synthesized/`, measures it with `scripts/sfx-analyze.py` when the music venv is
    present, dedupes by SHA-256 and records `library_add`.
  - The Generate panel rating from slice 1 was removed; the panel is back to its prior form.
- **Verification:** Unit tests for spec safety, render jobs, override validation, review
  recording and library intake. In the running editor the agent API rendered the sting
  (17 s) and the sound, and both proposals rendered on cards with controls, rating and
  Add to Library. On a disposable copy, a headline change re-rendered, swapped the
  preview, saved the tuning and logged a person `value_change`; the copy was then deleted.
  A first attempt exposed a development-mode remount bug and an Enter-plus-blur double
  render; both were fixed and re-verified. Apply was not clicked (no self-approval), so the
  approve route's audit write and Add to Library in the UI are unit-tested only.
- **Limits:** Render cache eviction is not implemented. Catalog writes have no cross-process
  lock. The in-editor MCP server must restart to offer the new tools.


## 2026-10-12 — linked sounds

- **Observation:** An opener built as a composition needed its synthesized sounds placed
  as separate clips so each could be tuned or swapped later, but nothing tied them to the picture:
  moving the opener left its whooshes and hits behind.
- **Change:** `create_audio.follows_visual {element_id, offset_seconds}` links a sound to a picture
  clip. One reconcile rule (`reconcileSoundLinks`) runs in proposal derivation and after every clip
  edit: a moved picture carries its sounds; a sound moved alone keeps its link at the new offset. A
  first proposal links the sounds and exposes one linked level dial; a follow-up unlinks with
  `clear_props: ["follows_visual"]` or Properties → Timing → Unlink, then swaps individual sounds.
- **Gap:** offsets are fixed; sounds do not yet retime with the composition's own timing controls.
- **Regression protection:** `src/lib/timeline/sound-link.test.ts`.

## 2026-10-12 — timing knobs and cue-anchored sounds

- **Observation:** Linked sounds kept fixed offsets, and an opener's length could only change by
  trimming, which cut its animation. The creator's direction: timing relationships are knobs; the
  architecture makes them tunable and the agent picks which dials to surface.
- **Change:** controls files may declare `timing` (length and cues as formulas over number controls);
  renders record the resolved timing; `refreshMotionTiming` gives a re-rendered clip its new length and
  cue times (and ripples the edit after an `ripple_after` clip); `follows_visual.cue` anchors a sound to a
  cue. The Trades Decoded opener gained Build length and Title hold; on its proposal card a longer hold
  lengthens the opener, pushes the edit and moves the out whoosh, while the impact stays put.
- **Gap:** a sound's internal rhythm (tick spacing) does not yet follow composition controls.
- **Regression protection:** `src/lib/hyperframes/composition-timing.test.ts`, `src/lib/timeline/sound-link.test.ts`.

## 2026-10-12 — personal Library tools

- **Observation:** A creator reuses some graphics in every project (an opener) and wanted the agent,
  not new UI, to save and reuse them. They are personal Library items, not Templates.
- **Change:** `motion_library_save`, `motion_library_list` and `motion_library_use`. Save keeps the
  composition source (not scaffold files), the placed render's values and each linked synthesized sound
  (source, controls, values, seed, cue, offset, lane, level). Use re-renders both in the target project
  and returns what one proposal needs; it never edits a timeline.
- **Gap:** compositions that copy binary assets (images, fonts) into `assets/` are refused for now.
- **Regression protection:** `src/lib/local-store/motion-library.test.ts`.

## 2026-10-13 — Value changes re-render in a fraction of the time

- **Problem:** switching a section header's Entrance on a card took 40 s or more. Each value change re-ran the composition's runtime check (a browser launch, about 5 s) before rendering, even when the code had not changed and even when the values had been rendered before. The three headers on the card then rendered one after another, since there was one render job per graphic.
- **Change:** the runtime check is skipped when the audit already records a passing validation for the same source fingerprint. Editor value changes get a job per set of values, so copies of one graphic render side by side; the card swaps each copy in as soon as it is ready.
- **Evidence:** render time per header 10.4–12.3 s → 5.2–5.5 s (audit `elapsed_ms`); returning to an already-rendered value no longer spends 5 s on the check; three headers with a new Writing time finished in 13.5 s from the click (each render 5.9–6.8 s, in parallel), against about 33 s before. Unit test for value-keyed jobs.
- **Not yet:** the render itself (headless Chrome capture plus VP9 encode, about 5 s for 45 frames) is unchanged. Not a model call: the whole path is deterministic.

## 2026-10-14 — Canvas choice and full-frame graphics

- **Observation:** While building the explainer Templates, three limits of the render path
  came up:
  - The HyperFrames renderer takes the canvas size and length from the file before any
    script runs. A control could not switch 16:9 and 9:16, and a script-set
    `data-duration` was ignored.
  - The alpha probe rejected any render without a transparent pixel, which ruled out
    full-screen cards.
  - A rejected render left its `.pending.webm` file in project media.
- **Change:**
  - Controls files may declare `canvas` (a choice control picks the render size, written
    into the render copy's root) and `opaque_control` (a switch whose on state makes an
    opaque render expected).
  - A render that fails its probe is deleted.
  - Compositions that need a variable length omit the root `data-duration`. HyperFrames
    then uses the timeline length.
- **Evidence:** Both demo projects render at 1920×1080 and 1080×1920 from the same source
  (ffprobe). Each length follows its timing knobs: the explainer is the sum of its five
  scene times, and a card Hold change on Kinetic Type moved the clip from 4.633 s to
  11.633 s.
- **Regression protection:** `src/lib/hyperframes/composition-manifest.test.ts` (canvas,
  opaque switch) and `src/lib/hyperframes/motion-templates.test.ts`.

