# tutorial-screen-recording — evolution log

## Purpose
Turn a creator's narration into a tutorial that shows DreamCut doing what the narration says: a
screen take of the editor, captured by the coding agent and cut to the spoken words. Scope:
staging the editor, recording one continuous take, and assembling it against the narration. It
excludes editing screen recordings the creator supplies (product-walkthrough) and export.
Good looks like this: every narrated action appears on screen as the words are spoken, the
states a viewer needs (drawer, ticked option, the control and its effect) are readable, and the
creator reviews a handed-off project without asking for a retake.

## 2026-10-25
- **Observation:** We made the first colour-grading tutorial: the creator full frame, then
  presenter bottom and screen top, over the Lofoten choose-one card.
  - Takes failed four times. Twice a hidden pane or a fresh server left the editor on
    "Opening project…".
  - Preview requests stalled because editor tabs had used every browser connection to
    127.0.0.1.
  - The options were switched with Preview buttons, so the green tick never moved.
  - Curve drags missed their points and added new ones, or pushed midtones to 100 % and blew
    out the picture.
  - Creator direction: pause the video before making adjustments.
- **Decision:** Created this skill from those lessons. It covers staging, one continuous take
  from a clean start state, checkbox switching, pausing before tuning, moderate multi-point
  curve moves, and segment placement with `mask_inset`, `media_scale`, `media_offset_y` and
  `playback_rate`. Screen capture needs a shell, so it is a coding-agent skill. We logged that
  rather than adding a recording tool.
- **Verification:**
  - The full take was recorded with the drawer, tick switching and curve moves.
  - Five segments were placed in `colorgrade-tutorial`, and `frame-state` showed each
    segment's band and states at its narration words.
  - The project was handed off.
  - Pausing before tuning comes from the creator's direction. It has not been exercised in a
    take yet.

## 2026-10-25 — Frame the app, open wide, one continuous piece per stretch

- **Observation:** A learning review of `colorgrade-tutorial` found the screen half of the split drifted onto the chat beside DreamCut, jumped back and forth inside the recording, cut hard where it skipped, and cut to results the narration described step by step (opening the drawer, scrolling to the curve). The skill said the chat "is part of the tutorial", which read as permission to frame it. The creator's approved fix (proposal `20261025T184750-fc0ed619`) opened each part on the whole screen, pushed in on DreamCut, kept one unbroken shot per stretch and dissolved over half a second at the two skips.
- **Decision:** Updated. The stage step keeps recording the whole screen but says to frame the app window. Assemble now asks for: the app window framed, never the chat; each recording opening on the whole screen, then pushing in; one continuous piece of the recording per stretch, never jumping back and forth; a 0.3–0.5 s dissolve where it must skip; and every on-screen step the narration names shown rather than cut to the result. It names `framing_compile`, a tool being built that returns scale and offsets for a source rectangle. `product-walkthrough` got one matching line. The split-screen treatment itself is the optional recipe `.agents/style-recipes/split-screen-product-tutorial.md`, not a rule here.
- **Verification:** Matches the approved card above. Skill-discovery tests and agent-parity check run after the edit; `framing_compile` is not available yet. Not yet measured on fresh agent runs.
