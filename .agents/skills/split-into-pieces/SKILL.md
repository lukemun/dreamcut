---
name: split-into-pieces
description: Lay a graphic out as separate timeline pieces the creator can tune one by one (a drawing, a motion-graphic look, a layered title), keeping playback the same. Use when a request asks to break up, split, layer or unbake a graphic, or when new graphic work would otherwise land as one baked clip. Drawing a sketch itself is sketch-drawing; choosing between alternatives is timeline-auditions.
---

# Split a graphic into pieces

The outcome is a graphic whose parts are each their own timeline element: the creator can
retime, restyle, move, hide or delete one part without the agent, and the stacked pieces
play back the same as the whole.

## Decide the pieces

- One piece per thing the creator would want to change on its own: a drawn object, a
  label, a background panel, a sound. Not one piece per stroke, and not one piece for the
  whole graphic.
- Keep together what only makes sense together (a box and the arrow that grows out of it
  as one gesture). A piece the creator cannot tune separately is a seam, not a feature.
- Prefer native elements: path shapes for drawn lines and outlines, text elements for
  words, sound elements for sounds. Use a rendered clip only for motion no native element
  makes, one object per clip.
- Pieces are independent. Do not link siblings so a change to one re-renders the others;
  a change across pieces is one proposal that touches each of them.

## Choose the route

| Source | Route |
| --- | --- |
| A drawing, diagram or doodle (SVG) | [sketch-drawing](../sketch-drawing/SKILL.md), which compiles it with `svg_pieces_compile` into native path shapes |
| An Illustrated Explainer look | its `layer` control renders one piece per composition (`stage`, `front`, `<scene>-<piece>`); render each through `motion_graphic_prepare` |
| Words in a graphic | native `create_text`, one element per block that changes on its own |
| Anything else | [recreate-effect](../recreate-effect/SKILL.md): splitting it is a capability gap, not a reason to bake it |

## Propose and review

- Stage the pieces with `proposal_create` following
  [dreamcut-proposals](../dreamcut-proposals/SKILL.md). Pieces that only work together go
  in one card; a large graphic goes in waves, one card per independently reviewable part.
- Give each piece a plain title naming what it shows; it becomes the clip name.
- To compare treatments (two inks, two drawings, two layouts), put each in its own
  mutually exclusive option on one card, per [timeline-auditions](../timeline-auditions/SKILL.md).
  The creator picks one, then tunes it.

## Verify

Run `pnpm frame-state <id>` (in the editor: `run_instrument` frame-state, then `timeline_evidence`) on the proposal preview and compare the stacked pieces with the
reference or the previous whole graphic at the same moments. Check that each piece
appears, starts and holds where intended, and that nothing a piece used to cover now shows
through. A still cannot prove the draw-on motion; use the card's Replay.
