# Split-screen product tutorial

Optional look `split-screen-product-tutorial`, version 1, for a narrated software
tutorial in a vertical video: the screen recording fills the top half, the presenter
fills the bottom half, and one-word captions sit on the line between them.

## Entry point

There is no single button. An agent builds it with the existing skills:
[tutorial-screen-recording](../skills/tutorial-screen-recording/SKILL.md) (or
[product-walkthrough](../skills/product-walkthrough/SKILL.md) for a recording the
creator supplied) for the screen half, [caption-craft](../skills/caption-craft/SKILL.md)
for captions and [color-grading](../skills/color-grading/SKILL.md) for the opening.
The settings that define the look:

| Piece | Setting |
| --- | --- |
| Screen recording, top half | `mask_inset: [0, 0, 0.5, 0]`, then `media_scale` and `media_offset_x/y` to frame the app window |
| Presenter, bottom half | the presenter clip masked to the lower half, framed on the face |
| Captions | `timing_mode: "single_word"`, `word_limit: 1`, `font_sizing: "fixed"`, centred on the dividing line; look from My Style |
| Recording skips | dissolve 0.3–0.5 s |

## Reference and rhythm

1. **Opening.** Three graded versions of the same shot stacked on screen while the
   narration introduces them, so the viewer sees the choice before the demo starts.
   Build them as three copies of the shot, each in its own band (`mask_inset`) with
   its own grade.
2. **Demo.** Each screen part opens on the whole screen, then pushes in on the app
   window and stays inside it. One continuous piece of the recording plays per stretch
   of narration; it never jumps back and forth. Every step the narration names
   (opening a drawer, scrolling to a control) is shown, not skipped to the result.
3. **Captions.** One word at a time, one size throughout, on the dividing line so they
   cover neither the app nor the face.

Pace follows the narration and My Style. Push-ins are smooth glides; hold each state
long enough to read (about 2–3 s).

## Handoff to another agent

Use **split-screen-product-tutorial**. Read the skills above, then the project
timeline and applicable preferences (`editing_context.preferences`). Required inputs:
narration with reviewed word alignment, the screen recording, and the presenter clip.
On a working edit, send it in passes: clean-up cuts first (ripple only the presenter
and caption lanes, per [cut-pacing](../skills/cut-pacing/SKILL.md)), then captions,
then the screen framing and the opening. Verify with `pnpm frame-state <id>` at every
segment and key word; a still cannot prove the push-ins or dissolves.

## Evidence and status

Derived from one creator-approved tutorial edit (October 2026). Its framing,
caption and opening cards were approved in the editor; the private project is not
part of this catalog. Status is **candidate** until the look is rebuilt on a second
project and `framing_compile` (being built) replaces hand-worked framing numbers.
