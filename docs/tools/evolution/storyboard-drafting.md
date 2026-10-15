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
