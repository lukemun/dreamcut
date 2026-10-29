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
  - Review rating: optional 1–5 passed to `render --rating` and stored as a `review` event.
    (Generate → Motion graphics was removed on 2026-10-26; motion graphics arrive only as
    proposals on the timeline.)
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


## 2026-10-22 — a composition draws one separable object

- **Observation:** A logo sting, a two-line kinetic phrase and a wordmark with a subline each
  rendered as one clip, so the creator could not edit the logo, name, lines or stamp
  separately. The 2026-10-10 stance (let the model choose, never gate coverage) allowed it.
- **Change:**
  - New or changed composition source must declare `"object": {"label", "native_gap"}` and at
    most one actor (`singleObjectProblems` in `composition-manifest.ts`).
  - The check renders default frames every 0.2 s in headless Chrome and refuses a frame
    showing more than one separable object: text with a picture, or two text blocks
    (`scripts/composition-object-probe.ts`, `composition-objects.ts`).
  - Source that already passed keeps re-rendering for value changes; packaged Templates are a
    recorded gap (`MULTI_OBJECT_TEMPLATE_GAPS`).
  - The `motion_graphic_prepare` description says so.
- **Evidence:** Disposable project `zz-object-gate-check`: the demo logo sting was refused at
  1.6 s (picture and "Dream Cut"); the decode word alone rendered; the demo's existing logo
  sting still passes for value changes.
- **Limits:** The probe samples default values only and reads DOM text and picture elements;
  text drawn on a canvas counts as a picture. Template splitting is not started.

## 2026-10-27 — Draw-ons pass the object check; clean refusals

- **Observation:** In session retro docs/audits/2026-10-27-proof-look-walking-man-retro.md (git-ignored), a single walking figure was refused at 0.2 s as "2
  separable objects (picture, picture)": its first strokes started apart. The refusal also
  carried a Node stack trace with terminal colour codes.
- **Decision:** Fixed. A frame whose pieces are all pictures lying inside one picture of a
  later frame counts as one object (`src/lib/hyperframes/composition-objects.ts`). Pictures
  that stay apart, and text beside a drawing, are still refused. The refusal says how a
  draw-on passes. `motion-script-runner` strips colour codes before dropping stack lines.
- **Verification:** `composition-objects.test.ts` (draw-on, apart, text cases),
  `motion-script-runner.test.ts`.

## 2026-10-27 — failed renders stay in the audit trail

- **Observation:** `preprocess/motion-jobs/<composition>.json` holds only the latest job, so the
  object-probe refusal at 16:37 in the Proof-look retro was overwritten by the 16:40 success.
- **Decision (owner-approved freeze exception C):** `startMotionJob` appends a `job_failed` event
  (error text capped at 4000 characters, started and finished times, the value-change job key or
  null, the agent or person who asked) to `audit/motion/compositions/<id>.jsonl` before writing the
  failed job file. `summarizeMotionAudit` reports `failed_renders`. The prepare route passes the
  requesting agent's name and model.
- **Verification:** `motion-proposal-flow.test.ts` ("a failed render is kept in the composition's audit
  trail before a retry overwrites its job file").
- **Limits:** A job whose owner process died is reported as failed on read but not appended, since no
  settle ran. The error text is kept as the job reported it, stack trace included; stripping it is the
  separate probe fix.


## 2026-10-27 — A check that cannot find the duration says why

- **Observation:** In one session `motion_graphic_prepare` failed with only "Could not determine composition duration — no layout samples run". HyperFrames' check does not report page errors, even with `--json`. The agent spent about a minute rerunning the check by hand and writing a Playwright probe to find the real error, `Cannot read properties of undefined (reading 'inks')` from the look bundle.
- **Decision:** When the check fails that way, `hyperframes-overlay` loads the page once with `scripts/composition-object-probe.ts --errors` and appends the script errors it threw, or says the page threw none but never registered `window.__timelines.main` (`src/lib/hyperframes/check-failure.ts`). A failed probe leaves the original message.
- **Verification:** `src/lib/hyperframes/check-failure.test.ts`; a disposable project whose page reads an unloaded look now fails with "The page threw before its "main" timeline was registered … reading 'LOOKS'".
- **Limits:** Adds one page load (about 2 s) to that failure only. Errors after the timeline registers are still not reported.

## 2026-10-27 — A revision sends only the files that changed

- **Observation:** In one session the agent revised two fly-in pieces by sending only their changed controls files. Both `motion_graphic_prepare` calls were refused with "files must include index.html", though the tool says index.html is needed on first creation and files not listed are kept. The agent resent the unchanged page (about 40 s). Earlier it had pasted a 25 KB engine into four calls (about 80 s each) before moving the engine into a separate file.
- **Decision:** `parseCompositionSourceSpec` no longer requires index.html; `missingEntryProblem` refuses a spec only when the composition has no index.html yet, in the prepare route (400) and in `writeCompositionSource`. An assets-only revision is accepted too; an empty spec is refused.
- **Verification:** `src/lib/local-store/motion-proposal-flow.test.ts` ("a new composition needs index.html; a revision sends only the files that changed") fails on the old code and passes now.
- **Limits:** A file's full text is still sent in the call; reading it from a local path is recorded as later work in the private project status.

## 2026-10-27 — An object check that times out says why

- **Observation:** In the same session a page that read its strokes with a synchronous XHR failed `motion_graphic_prepare` with only "Object check could not run: page.waitForFunction: Timeout 15000ms exceeded." The agent read the probe's source to learn that it opens the page from disk, where the request fails (about 1 minute).
- **Decision:** `explainObjectProbeFailure` (`src/lib/hyperframes/check-failure.ts`) adds that the page did not register `main` within 15 s from disk and to load data with `<script src>`; `hyperframes-overlay` uses it for object-check failures.
- **Verification:** `src/lib/hyperframes/check-failure.test.ts`.
- **Limits:** It recognises Playwright's timeout text only; other probe failures keep their message.

## 2026-10-28 — Dial changes show at once and re-render without a repeat check

- **Observation:** Recording the DreamCut 101 tutorial, each Look, Palette or Landing change on a motion-graphic card took 20–31 s. Replay played the old version, and only a small grey "Updating" label said anything was pending. Measured on a disposable copy: `hyperframes check` 5.3 s, object probe 2.4 s, render 15.8 s, preview preparation 2–3 s and up to 1.5 s polling. The instant draft preview (`LiveMotionOverlay`) showed nothing new: the live route never created `window.__timelines`, so the looks template threw on `window.__timelines["main"]`. It skipped the canvas-size and length steps, so a tall graphic laid out wide. And the sandboxed frame's own request for `looks.js` was refused in the desktop app's browser.
- **Decision:** The live route creates the timeline registry, applies the canvas size and length a render copy gets, and writes the look bundle into the page. The page tells the editor when no timeline was built (`dreamcut-live-failed`). The draft stays loaded while the playhead is elsewhere, so Replay shows it from the clip's first frame. A looks template's passed check is reused when the source and the look code (`look_sha256` on the validation event) are unchanged: a palette, timing or wording change skips the two browser launches, while a new look is still checked. One amber `UpdatingStatus` marks the card and the viewer ("showing a preview" or "showing the previous version"). Status polling went from 1.5 s to 0.5 s.
- **Verification:** On the stable build, a palette change on an already-checked look took 14.3–16.8 s instead of 24–27 s. On a dev server, the draft drew 0.6 s after a Palette change and Replay showed it from the clip's start, checked in headless Chrome against the landed render. `pnpm typecheck`, `pnpm check:editor-ui`, motion audit and proposal-flow tests.
- **Limits:** A new look still takes the full ~24 s. Graphics on a multi-card group and in Properties have no draft preview window, so only their card status changes. The draft runs in the browser: its colours can differ slightly from the encoded render.

## 2026-10-28 — Motion blur by sub-frame averaging

- **Observation:** Fast type moves in motion graphics read as sharp, strobing copies; HyperFrames renders one instant per frame and has no motion blur. Faking it with a CSS blur on the page would blur still pixels too and never follow the actual path.
- **Decision:** A controls file may name a 0–100 number control as `motion_blur_control`. When its value is above 0, `hyperframes-overlay` renders at up to 8× the frame rate (240 fps cap), averages the sub-frames in that share of each frame interval ending at the frame's time with alpha premultiplied (ffmpeg `premultiply`, `tmix`, `unpremultiply`, `select`), and encodes VP9 with alpha. Off, the render path is unchanged. The density render applies the same blur. The page never reads the control, so validation does not ask it to. Kinetic Type is the first user.
- **Verification:** A 240 fps ramp confirmed `tmix` averages the window ending at each kept frame. `composition-manifest.test.ts` covers parsing, the plan and the filter; a 9:16 Kinetic Type render on a disposable project passed `prepare` with blur at 60% (alpha kept, 3.7 s, 30 fps).
- **Limits:** Render time grows with the sub-frame count (164 s against 27 s for that render). The editor's instant draft preview runs in the browser and shows no blur.
