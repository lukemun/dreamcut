# product-walkthrough — evolution log

## Purpose
Edit clear software or product walkthroughs with readable screen action and explanatory pacing. Scope: action synchronized with narration, crops and zooms that clarify while preserving enough interface context for orientation, sparing annotations that never obscure the control being discussed. Good looks like: the viewer can follow the demonstrated action and read important states without pausing; every framing, annotation, timing, and media choice is a previewable proposal.

## 2026-10-27 — Supplied screen recording plus presenter take

- **Observation:** A tutorial-editing session built a horizontal tutorial
  from a screen recording and a phone take. AGENTS.md had no route to this skill, so it was never
  read. The creator then found: dead air cut by voice silence alone, which cut off the preview
  animations the narration pointed at ("I clicked preview, and then it just like appears"); the
  computer's sound effects leaking into the phone audio; push-ins that jumped and lost the
  pointer ("These are all jump cuts"); a zoom that hid the preview while a dial was being tuned;
  and a pasted secret left on screen.
- **Decision:** Updated. Added syncing two recordings by a matched event and word, a screen check
  before cutting a pause, silencing leaked computer sounds, cutting on-screen secrets, and zoom
  rules (`framing_compile` with `follow_cursor`, slow eases, continuous framing across clip
  joins, no zoom that hides a control's result, mid-ease `frame-state --proposal-file` frames
  before posting). AGENTS.md now routes supplied screen recordings here.
- **Verification:** Written from the cited session evidence; not yet run by a fresh agent.
