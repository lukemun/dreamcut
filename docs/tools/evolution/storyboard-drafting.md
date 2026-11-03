# Break footage into a planned storyboard — evolution

Capability: `storyboard-drafting`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Let a creator say what they want ("split my talking take into beats; this part gets the
glitch animation") and get a reviewable storyboard: named beats of shots that point at
original source windows, each with what happens, an on-screen text idea and the
transition into it. The agent writes only the freeform storyboard, on request, as one
revision-checked Undo step. It never cuts media, writes the timeline, generates or
approves; Build timeline remains the creator's step toward an edit.

## 2026-10-11 — initial tools

- **Observation:** The Storyboard page gave chat a read-only text summary, and no tool
  could write shots, beats or notes. Creators asked to storyboard long talking takes by
  direction instead of placing every shot by hand.
- **Existing owners:** `updateStoryboard` already enforced revision checks, asset validity
  and a 50-step Undo history; `speech_prepare` and `source_evidence` already supply words,
  pauses and frames for grounding boundaries.
- **Decision:** Add `storyboard_get` (compact read) and `storyboard_draft` (replace or
  append beats) over a shared pure `applyStoryboardDraft`, saved through the ordinary
  storyboard save. Direct write was chosen by the creator over an accept/discard step
  because the storyboard is planning, one Undo removes a draft, and the timeline approval
  boundary is unchanged. Feedback links are timeline-history records, so the agent marks
  answered direction with `editing_feedback_disposition` citing the saved revision.
- **Version:** Draft schema 1 (`revision`, `mode`, `beats[].name`, `beats[].shots[]`).
- **Verification:** Unit tests cover beat grouping, replace/append, photo holds and
  refusals (unknown, audio, unprepared or out-of-range sources, sub-frame shots). Route
  check confirmed a stale revision is refused without changing the board, and an open
  Storyboard page adopted an agent write within one poll.
- **Discovery fixes found by eval:** the family was not in the desktop editing allowlist
  (`EDITING_FAMILIES`), so the catalog answered `allowed: false` and models correctly
  declined; `speech-preparation` was added beside it because talking-take drafts need words.
  The feature eval only graded proposal tools; it now grades a case's own tool. The case
  expects the transcript boundary (a shot starting at 4.2s) rather than exact note wording.
- **Model evidence (2026-10-11, `storyboard-draft-beats`, simulated tools):** Codex
  gpt-6.1-sol 3/3 (0/3 before the fixes), Claude Opus 5.5 3/3, local ministral 2/3; the
  local miss read the board and stopped, recorded as a model limit. Receipts are private
  under `private/eval-features/`.
- **Acceptance for next change:** Keep one Undo per draft and no timeline effect; measure
  a real talking-take draft end to end on recorded footage, which the simulated eval does not cover.

## 2026-10-12 — visuals over a shot

- **Observation:** A creator planning a talking-head video talks the whole time and wants a
  screenshot, mockup or motion graphic on screen for each point. The board was one sequence
  of source windows, so a photo shot replaced the talking picture and cut the speech.
- **Existing owners:** The shot schema, `validateStoryboardAssets`, `compileStoryboard` (shared
  by Play sequence and Build edit proposal) and `applyStoryboardDraft` already owned shots.
- **Decision:** Each shot carries optional `visuals[]` (`source`, `at` on the shot clock,
  `duration`, video in-point `start`, `label`, `note`), time-ordered, non-overlapping and inside
  the shot. The out-point is derived (`start + duration`), not stored. Compile keeps each
  talking window one continuous clip on `visual_0` and places visuals on `visual_1`, video
  muted, so speech is never interrupted. `storyboard_draft` accepts visuals per shot;
  `storyboard_get` returns them. Additive and optional, so saved boards (record
  `schema_version` 1) read unchanged and need no migration. The Storyboard page shows visuals
  as labelled thumbnails under each shot (Strip and Script) and edits them in Shot details.
- **Version:** Draft schema 1 plus optional `beats[].shots[].visuals[]`.
- **Fix found on the way:** A named beat compiled to `beat_label`, which Browser GPU
  admission refused, so Build edit proposal failed for any board with named beats (every
  agent draft). `beat_label` is a name no renderer draws; it is now a non-rendering prop.
- **Verification:** Unit tests cover containment, overlap, identity, source checks, legacy
  boards, compile lanes and timing, reorder, draft refusals, and a route round trip (draft,
  read, Build edit proposal with the overlay lane, timeline unchanged, one Undo). An MCP test
  checks the listed schema and forwarding. The page was exercised on a disposable project.
- **Acceptance for next change:** Run `pnpm eval:features --case storyboard-visuals-over-talk`
  with frontier models; measure a real talking-take draft with visuals end to end.

## 2026-10-12 — Build timeline replaces Build edit proposal

- **Observation:** Proposals suit one-off, reviewable tweaks; a whole storyboard is a
  first assembly, too large to review as one card. The Storyboard page is for planning, so
  sequence playback belongs in the editor.
- **Change:** Build timeline (`/storyboard/timeline`) writes the compiled sequence directly
  as the creator's own action, one Undo step in editor history; a timeline with clips asks
  before appending. Play sequence was removed. Visuals carry a placement (float/full);
  photos and videos float in beside the speaker as ordinary clip fields.
- **Gap:** placed motion-graphic clips have no Properties controls yet (design doc:
  "inspector controls after approval" not started), so tuning their declared controls after
  a build needs a new render.
- **Regression protection:** `storyboard.test.ts` and `visuals.test.ts` cover stale refusal,
  confirm-then-append and the lane layout of the built timeline.

## 2026-10-24 — Agent writes the Script panel

- **Observation:** A creator selects a video in Storyboard → Media and asks their agent to
  "transcribe this and put it in the script". Selection already reached `editor_context_get`
  and `speech_prepare` already transcribed, but no tool could write the Script document, so
  the transcript had to be pasted by hand.
- **Change:** `storyboard_script_write` (`/storyboard/script`) adds paragraph blocks to the
  Script document (append by default, replace on request); a block with `section` is also
  marked. It is one revision-checked storyboard Undo step and never touches shots, media or
  the timeline. `storyboard_get` now returns `script {text, sections}` so the agent reads the
  current text before writing.
- **Gap:** `speech_prepare` transcribe returns plain text without word timings, so script
  paragraphs are not yet linked to source seconds; that waits on reviewed text plus MFA alignment.
- **Regression protection:** `script.test.ts` covers fill, append without moving existing
  marks, replace and the size limit.
- **Acceptance for next change:** `pnpm eval:features --case storyboard-script-write` with
  frontier models.

## 2026-10-24 — Link visuals to script sections

- **Observation:** The creator plans by highlighting parts of the script and picking visuals, then
  either clicking Link or asking the agent to pair several sections with several visuals.
- **Change:** Script sections carry `visuals` (storyboard source paths). `storyboard_script_link`
  links visuals to a section by id, or to highlighted text by offsets plus its exact quote (which
  becomes a section); it adds by default, `replace` swaps. Linked visuals join Storyboard Media.
  One revision-checked Undo step. `storyboard_get` script sections now include id, offsets and
  visuals. Script highlights are selection items (section id, offsets, quote) in `editor_context_get`.
- **Regression protection:** `script.test.ts` covers linking, range-to-section, replace, unlink,
  links surviving text edits, quote checks and audio refusal.
- **Acceptance for next change:** `pnpm eval:features --case storyboard-script-link`.

## 2026-10-26 — Planning canvas: moments, effects and text, connected

- **Observation:** The creator plans by marking stops in a clip, describing what should happen at
  each, and joining them to an effect ("speed entrance, zoom from each stop until I'm at the camera,
  then I say my line"). Agents could not read or write marks, and nothing held the connections.
- **Change:** Marks carry a `note`. The storyboard gains an optional `canvas` of cards (moment, one
  per mark; effect, naming a template; text) and lines between them. `storyboard_get` returns it as a
  resolved graph (moment number, clip, seconds and note; effect template and note; text; connections).
  `storyboard_canvas_write` (`/storyboard/canvas`) adds, updates, places, connects, disconnects and
  removes cards in order as one revision-checked Undo step; removing a moment removes its mark.
- **Gap:** Assembling from the canvas is agent work with existing proposal and assembly tools; there
  is no direct canvas-to-timeline compile.
- **Regression protection:** `canvas.test.ts` covers one card per mark, connections, the graph,
  cascading removal, moves, schema refusals and legacy mark names.
- **Acceptance for next change:** `pnpm eval:features --case storyboard-canvas-connect`.
