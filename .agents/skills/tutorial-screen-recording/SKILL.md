---
name: tutorial-screen-recording
description: Record DreamCut's own interface as a screen take and cut it into a narrated tutorial, such as a talking head with the screen in a split. Use when the creator asks to show how a DreamCut feature works on screen. For editing a screen recording the creator already supplied, use product-walkthrough.
---

# Tutorial screen recording

The outcome is a reviewable tutorial project: the creator's narration plays over screen takes
of DreamCut doing what the narration says, in sync and readable. This is a coding-agent
procedure. It needs a shell to capture the screen and the built-in browser to drive the editor.
Read [product-walkthrough](../product-walkthrough/SKILL.md) for framing and pacing, and
[editorial-assembly](../editorial-assembly/SKILL.md) before building the project.

## Inputs

- The creator's narration clip, transcribed with word timestamps. Each action in the take is
  keyed to a spoken word ("a proposal drawer should slide out" → open the drawer).
- A demo project that already shows the feature, such as a handed-off project with a pending
  choose-one card. Build it first with the feature's own skill.
- The layout the creator asked for, such as presenter on the bottom half and screen on the top.
  Ask if it is missing. It decides how much of the screen fits and which band to crop to.

## Prepare the stage

1. Warm the editor before recording. After a server restart, the first project load and the
   first preview take up to about 30 seconds. Open the demo project in the built-in browser
   and wait until the preview shows a picture.
2. Keep the browser pane visible. A hidden pane does not draw, so clicks and screenshots
   hang and the page stays on "Opening project…".
3. If requests stall while the server answers `curl` quickly, the browser has run out of its
   six connections to that host. Every editor tab open in the app counts, including other
   sessions' tabs. Close the extra tabs, or load the editor on the other loopback name
   (`localhost` instead of `127.0.0.1`), which gets its own connections.
4. Reset to a clean start state:
   - Proposals drawer closed.
   - Proposal preview stopped (the ✕ on the Preview pill).
   - Playhead at the start.
   - The recommended option ticked.
   - Every tuned control back at its default (each dial's reset button).
5. Ask the creator to turn on Do Not Disturb. The whole screen is captured, including this
   chat. Keep recording it, but frame the app window when you assemble, never the chat
   around it.

## Record one continuous take

Start the capture in the background, then drive the editor:

```bash
screencapture -v -V <seconds> -x <scratchpad>/take.mov
```

Plan each action against the narration, and allow 2–3 seconds per visible state.

- Use real clicks (the browser `computer` tool on element refs) for anything the viewer
  should see. A scripted `element.click()` can skip the UI's own behaviour; the Proposals
  drawer did not open that way.
- Switch choose-one options with their checkboxes (or number keys) so the green tick moves
  with the preview. The Preview buttons change the picture but leave the tick behind.
- To show tuning, expand the option by its name, scroll to the control, and **pause the video
  first**. Then make the change on a still frame, where the difference is easy to see.
- On the brightness curve, move several points by moderate amounts (shadows down,
  midtones and highlights up). Do not move one point to an extreme: midtones at 100 % blows
  out the picture. Drag existing points. A press that misses a point adds a new one, so take
  each point's position from its `Brightness curve point at …` element's box, scaled to the
  screenshot frame.
- Never click Choose, Apply or Reject. After the take, reset any tuning you changed.

Check the take before using it. Sample frames every 2 seconds into a contact sheet with
timestamps, and confirm each planned state appears. Look especially for:

- The drawer opening.
- The tick moving to each option.
- The control and the picture changing together.

Retake from the clean start state rather than patching around a missed action.

## Assemble

Follow [editorial-assembly](../editorial-assembly/SKILL.md) for the project, and keep these
specifics:

- Import takes with `media_import` (managed copy) and wait for `media_readiness` to report ready.
- Place each segment with `element_create_from_source_window` on a lane above the presenter.
  For a top-half split, set `mask_inset: [0, 0, 0.5, 0]`. A screen take is first fitted inside
  the canvas. Raise `media_scale` until it fills the visible region. Then position it with
  `media_offset_x` and `media_offset_y`, which are fractions of half the canvas width or height
  (1 moves the picture by half the canvas, and negative values move it left or up). In a
  vertical video, the top half is nearly square, so a scaled take can show the whole screen
  height. In a horizontal one, give each segment its own band so the control being discussed
  and the preview are both in view.
- Frame the app window, never the surrounding chat. Open each recording on the whole screen,
  then push in on the app window and keep every later push-in inside it. `framing_compile`
  (being built) returns `media_scale` and offsets for a source rectangle; use it once it is
  available rather than working the numbers out by hand.
- Keep one continuous piece of the recording per stretch of narration. Never jump back and
  forth in the recording. Where it must skip ahead, dissolve over 0.3–0.5 s instead of cutting.
- Show every on-screen step the narration names, such as opening a control or scrolling to
  it, rather than cutting straight to the result.
- Fit segments to the narration with `playback_rate`. Slow a still stretch to hold it, or speed
  a long interaction up to about 3×, so each state still reads. Start each segment where its
  narration starts, and do not end on a frame that undercuts the point (an unflattering scene
  change, a blown-out grade).
- Verify with `pnpm frame-state <id> --at …` at every segment and key word. Build the contact
  sheet from `frame-state.json`. Then call `assembly_handoff` before presenting the layout.

## Report

Name the project and link it, list the segments with the words they cover, and state
what was verified from frames. A still frame cannot prove motion, sync or sound. Keep the takes
in the scratchpad until the creator approves the cut.
