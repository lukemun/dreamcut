# Video recast — evolution

## Purpose

A creator supplies a reference video and photos of who should appear instead, and gets a
storyboard where each beat is recast with those people and ready for Build timeline. The
agent plans and prices; the creator generates, chooses takes and builds. Success is a
recreated video whose beats match the reference's framing, motion and timing with the new
people, without the agent spending credits or writing the timeline.

## 2026-10-14 — initial procedure

- **Observation:** The creator studied a viral parody that recreated a concert's opening
  shot for shot with different people and a new song, and asked for it as a reusable
  workflow that breaks out into a storyboard because it needs more inputs and references.
- **Decision:** Plan on the Follow-reference storyboard (`storyboard_reference_draft`,
  `storyboard_recast_quote`); generation and choosing takes stay creator clicks.
- **Verification:** Unit tests cover window padding, per-model requests, plan validation and
  trimming a take to its beat; a browser walkthrough on a disposable project placed a
  planted take as a beat's footage. No live recast generation has been run.
