---
name: product-walkthrough
description: Edit a clear software or product walkthrough in DreamCut with readable screen action and explanatory pacing, including a supplied screen recording cut together with a separate presenter take.
---

# Product walkthrough

Read `../dreamcut-proposals/SKILL.md` before timeline work. For a new project, follow
[editorial-assembly](../editorial-assembly/SKILL.md) as well.

Keep the demonstrated action synchronized with narration. Crop and zoom only to clarify, preserve enough interface context for orientation, and allow time to read important states. Use annotations sparingly and ensure they never obscure the control being discussed. Frame the app window, not whatever surrounds it: open on the whole screen, push in on the app, keep one continuous piece of the recording per stretch, and dissolve 0.3–0.5 s where it must skip.

Make screen framing, annotations, timing, and supporting media previewable proposals.

To record DreamCut's own interface for a tutorial, use [tutorial-screen-recording](../tutorial-screen-recording/SKILL.md).

## Sync a screen recording with a separate presenter take

When the presenter was filmed on another device, find one offset between the two clocks and
use it for every clip. Match a visible event to the word that names it (a click and "click A",
a panel and "here's the Library"), using `source_evidence` frames around the event and word
timings from the transcript. Check a second pair far away in the recording for drift. Record the
offset and both pairs with the layout.

## Cut dead air without cutting the demo

- A pause in the narration is not dead air while the screen is doing what the narration points
  at: an animation playing, a preview loading, a page sliding in. Before cutting a pause, look at
  the screen over it (`source_evidence` frames across the gap, or the `frames` curve from
  `visual_activity_prepare`). Keep that stretch, or speed it up, rather than cutting it.
- A phone next to the computer records the computer's sounds. Where the screen plays a sound,
  find it in the presenter audio, silence it there, and offer the clean sound on the screen
  moment. Once you find the pattern, scan the whole recording for it, not one spot.
- Cut anything that shows a secret: an API key, token, password or private prompt typed or
  pasted on screen. Check every paste and sign-in step, and propose the cut before the creator
  has to find it.

## Zoom in on the action

- Build push-ins with `framing_compile`. Pass `follow_cursor` so the view follows the pointer
  and keeps it in frame. Ease in and out slowly (about 2–3 s each) and keep the push gentle
  (about 1.2–1.5×) unless asked otherwise.
- When a zoom spans several clips, start each clip from the framing the previous clip ended on,
  and ease back out before the last clip ends, so no join jumps.
- Do not zoom while the presenter changes a control whose result shows elsewhere on screen, such
  as a dial and the preview it changes. Frame both, or leave that stretch unzoomed.
- A still cannot show a jump. Before posting a zoom card, render it at the start, middle and
  end of each ease:
  `pnpm frame-state <id> --proposal-file proposals/<file>.json --at <times>`.
  The middle frame must be framed partway between the other two; a middle frame that matches
  either end means the zoom holds and then snaps.
