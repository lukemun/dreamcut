# Split a drawing into native, separately editable shape pieces — evolution

Capability: `vector-pieces`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Turn one agent-authored SVG drawing into native path shapes, one per top-level element,
that draw themselves on. Each piece stays a timeline element the creator can retime,
restyle, move, edit point by point or delete without the agent. Compiles operations only;
`proposal_create` and human review remain required.

## 2026-10-24 — initial implementation

- **Observation:** Recreating a "sketch draws itself while I explain" reel had no native
  route. `motion_graphic_prepare` bakes HTML into one clip and refuses multi-object
  compositions, so a sketch could not be split into pieces the creator tunes.
- **Existing owners:** native `path` shapes (`src/lib/timeline/shapes.ts`) already accept SVG
  path data, keyframe a 0–1 draw-on, edit points and render on the GPU.
- **Decision:** Add hand-drawn ink to every shape outline (`shape_taper`, `shape_wobble`,
  `shape_seed`; pen outline from perfect-freehand, MIT) and one compile tool,
  `svg_pieces_compile`, that splits, places and staggers pieces into `create_shape`
  operations. Word- and beat-timed starts come from visual-timing; this tool takes explicit
  `starts`.
- **Version:** Tool v1.
- **Verification:** `src/lib/timeline/shape-ink.test.ts` (width, taper, draw-on, seeded
  wobble) and `src/lib/agent/svg-pieces.test.ts` (piece split, exact placement, schema
  validity, timing, transforms, region fit, errors). GPU parity inventory admits the new
  fields.
- **Limits:** SVG subset (no `<use>`, CSS stylesheets, gradients or clip paths). Labels are
  returned for native text, not drawn.

## 2026-10-24 — camera moves

- **Decision:** `camera_moves` adds one camera (the general camera in
  `src/lib/timeline/camera.ts`) that every piece follows, so a push-in or pan moves the whole
  sketch. The camera is not sketch-specific; any shape can follow it with `camera_id`.
- **Verification:** `src/lib/timeline/camera.test.ts` and `svg-pieces.test.ts`; previewed a
  push-in on the skyline in the editor on a disposable project.
- **Limits:** only shapes follow cameras; no card dials for the move yet.

## 2026-10-24 — camera phase 1

- **Decision:** stills, video clips (motion graphics included) and native text also follow a
  camera, as their outermost transform in both renderers. One shared Camera section in
  Properties picks what each element follows.
- **Verification:** `src/lib/frame-runtime/gpu-camera.test.ts`; previewed footage and a label
  pushed in together in the editor. Export through the Standard renderer was not checked by eye.
- **Limits:** admission refuses a camera on clips with transitions or subject windows and on
  surface-tracked text; spatial checks do not see the camera's view.

## 2026-10-24 — open-space placement by default

- **Observation:** Without a region the compiler filled the whole frame, and a hand-picked region put the drawing over the speaker.
- **Decision:** With no `region`, the editor route samples the speaker's head and shoulders across the drawing's time on screen and places it in the largest open region (`placement.chosen_by: open_space`), falling back to the whole frame with a warning when no speaker is found.
- **Verification:** Exercised through the editor route; staging refuses face coverage regardless of placement.

## 2026-10-24 — label slot

- **Decision:** the result carries `label_slot` (`place` with every piece as one anchor, below the drawing when there is room, `max_width`, and three label dials) and `option_fields.coordinate_fallback_reason` for the pieces' measured positions; piece dials stop at 12 to leave room for the label's. `reserve_label_space` keeps a band of the region free under the drawing.
- **Verification:** compiled and staged on the disposable `sketch-pieces-relation-check`; the label stayed under the drawing through the push-in in the editor preview.
