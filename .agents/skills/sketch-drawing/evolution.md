# sketch-drawing — evolution log

## Purpose
Draw a hand-drawn sketch that draws itself on screen as separate, editable native pieces. Scope: authoring the SVG, compiling it with `svg_pieces_compile`, staging and auditioning it. Out of scope: choosing when beats land, which belongs to visual-timing (it supplies `starts`). Camera moves use the general camera. Good looks like: each beat is a native path shape with hand-drawn ink, drawn in order, placed where it was drawn and tunable without the agent.

## 2026-10-24 — created

- **Observation:** A reference reel showed a sketch drawing itself beside the speaker while the camera moved over it. DreamCut had native path shapes with draw-on but no hand-drawn ink and no way to split one drawing into pieces.
- **Decision:** Added hand-drawn ink to shape outlines (taper, wobble, seed) and `svg_pieces_compile`; this skill teaches the drawing side.
- **Verification:** Unit tests for ink geometry and the compiler; tool and editor-ui checks. Editor verification on a disposable project is recorded in the capability evolution log ([vector-pieces](../../../docs/tools/evolution/vector-pieces.md)).
- **Next:** Word-timed starts from alignment; a group transform for camera moves.

## 2026-10-24 — Placed over the speaker by default

- **Observation:** The first sketches were placed by a hand-picked "right half" region and a push-in centred the drawing on the speaker's face. The skill suggested `open_space_find` for 16:9 but nothing enforced it, and the compiler defaulted to the whole frame.
- **Decision:** `svg_pieces_compile` now defaults to the largest open region that keeps the speaker's head and shoulders clear across the drawing's time on screen, and reports it in `placement`. The skill forbids guessed regions, warns that push-ins move the drawing toward the centre, and points at the staging refusal. Labels that name the drawing go in the same card.
- **Verification:** Preflight of the earlier cards now reports the face coverage; the compiler's open-space default is exercised through the editor route. Not yet measured on a fresh run.
