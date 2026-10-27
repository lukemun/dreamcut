---
name: sketch-drawing
description: Draw a hand-drawn sketch that draws itself on screen, beat by beat, as separate editable native pieces (a skyline, a diagram, a doodle beside the speaker). Use for "draw this as I explain it", whiteboard or pen-sketch explainers and line-drawing reveals on an existing timeline or assembly. Choosing when beats land (words, beats, other cues) is visual-timing; captions and kinetic type are video-typography.
---

# Sketch drawing

The outcome is a line drawing that appears stroke by stroke, split into pieces the creator
can tune: each beat (the skyline, the red dot, the arrow) is a native path shape with
hand-drawn ink and its own draw-on. The agent draws the SVG; DreamCut does the rest.

Read [split-into-pieces](../split-into-pieces/SKILL.md) for how pieces are chosen and staged,
and [dreamcut-proposals](../dreamcut-proposals/SKILL.md) before proposing on an existing cut.

## Inputs

| Input | Required | When missing |
| --- | --- | --- |
| What to draw, per beat | Yes | Derive it from the script or the creator's request; ask only if the subject is unclear. |
| Where it goes | No | Omit `region`: `svg_pieces_compile` places the drawing in the largest region the shared screen read finds free for its whole time on screen (clear of the speaker and of every other picture, text and shape), and says so in `placement`. Pass `region` only from a measured source (`open_space_find`) or the creator's words, never a guessed half of the frame. |
| When each beat starts | No | Stagger automatically from `timeline_start`. For word or beat timing, take `starts` from [visual-timing](../visual-timing/SKILL.md). |

## Draw the SVG

- One top-level `<g>` per beat, in the order it should draw, named with `data-piece`
  ("skyline", "red-dot"). Each becomes one piece. Keep to about 3–8 beats per idea.
- Draw like a pen: open paths in the direction the hand moves, few points, simple shapes.
  Each path traces from its first point, so start where a person would start the stroke.
- `fill="none"` and one stroke colour for line art; fill only a deliberate accent (a dot).
  Set `stroke-width` on the `<svg>` or the group, in viewBox units.
- Words belong to native text. A `<text>` comes back as a label to place with `create_text`;
  it is not drawn.
- Stay within 64 contours and 2000 points per beat; split a busy beat into two groups.

Use any viewBox; it is fitted into the region keeping its proportions. Supported elements:
`path`, `line`, `polyline`, `polygon`, `rect`, `circle`, `ellipse`, `g` with transforms.

## Compile and propose

1. Read the timeline (`timeline_get`) for the start time and current revision.
2. Call `svg_pieces_compile` with `svg`, `timeline_start`, and as needed `region`, `starts`,
   `hold_until`, `stroke`, `stroke_width`, `taper` (default 0.55), `wobble` (default 0.3)
   and `pen_speed`. For push-ins and pans add `camera_moves` (each looks at a piece title,
   `"drawing"` or `"frame"` for the plain view, with a zoom); the camera comes first in the
   operations and every piece follows it. A push-in moves the whole drawing toward the centre of
   the frame, where a talking head usually is: keep zooms modest, end on `"frame"`, and let the
   staging check prove the pieces stay off the face. It returns one `create_shape` operation per piece on free lanes above
   every existing visual, plus `labels` and `warnings`. It writes nothing.
3. Add `create_text` for any labels, then `proposal_create`: pieces of one drawing go in one
   card. To audition, compile each variant (another ink, wobble or drawing) and give each
   its own option, with one recommended.
4. Main dials: Drawn timing per piece, Outline colour, Outline width, Taper, Wobble,
   Variation. Every piece keeps Placement and Edit points.

## Verify

Staging refuses an option whose pieces cover the speaker's face at any sampled moment,
including after a camera move; fix the placement or the move and stage again. Read
`spatial_review` for overlaps and `pending_card_overlaps`: a label and the drawing it names
belong in one card, so they are checked together.

Run `pnpm frame-state <id>` (in the editor: `run_instrument` frame-state, then `timeline_evidence`) at the start, middle and end of each beat: pieces land where
drawn, draw in order, and stay clear of the speaker's face unless overlap is intended. Use
the card's Replay for the motion. Report what was not checked.

## Limits

- Labels follow the camera when their `create_text` sets the same `camera_id`. Clips with
  transitions or subject windows cannot follow a camera yet. Moves are tuned on the Camera clip
  after applying, not from card dials.
- The SVG reader is a subset: no `<use>`, stylesheets, gradients or clip paths.
