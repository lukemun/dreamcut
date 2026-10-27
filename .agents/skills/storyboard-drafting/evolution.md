# Storyboard drafting — evolution

## Purpose

A creator gives loose direction over supplied footage and gets a storyboard they can
scan and tune without AI: beats of source-window shots grounded in words and pictures,
with treatments they asked for written where they apply. Success is a board the creator
keeps with small edits, saved as one Undo step and never touching the timeline.

## 2026-10-11 — initial procedure

- **Observation:** The creator asked to drop in long talking takes, describe the parts
  ("this part has this animation"), and have the agent break it up, show frames and
  write what happens. No tool could write the storyboard before this date.
- **Decision:** Route through `storyboard_get` / `storyboard_draft`, grounded in
  `speech_prepare` word boundaries and `source_evidence` frames; record direction first.
- **Verification:** Tool behaviour is covered by unit and route checks recorded in the
  [storyboard-drafting tool log](../../../docs/tools/evolution/storyboard-drafting.md).
  A full real-footage agent run has not yet been measured.

## 2026-10-12 — notes are creator text, not provenance

- **Observation:** Independent visual QA found shot notes on a drafted board reading
  "Recorded 2026-09-29T18:30… (embedded camera metadata)" and "Existing generated
  derivative of sources/…", shown as body text under each shot.
- **Decision:** Notes describe what is said and seen; provenance goes in the agent's
  report. The Strip view now shows shot names only; notes stay in Script and Shot details.
- **Verification:** UI change checked visually; agent drafting behaviour not yet re-measured.

## 2026-10-26 — Read and write the planning canvas

- **Observation:** The creator plans by marking stops, describing each, and joining them to an
  effect and a line to say; agents could not see marks or how they connect.
- **Decision:** The skill reads `storyboard_get` canvas, writes it only when asked with
  `storyboard_canvas_write`, and assembles from connected effect + moments through the effect's
  template skill and proposals, never a canvas-to-timeline write.
- **Verification:** Tool and route tests pass; agent assembly from a canvas not yet measured
  (`storyboard-canvas-connect` feature case).
