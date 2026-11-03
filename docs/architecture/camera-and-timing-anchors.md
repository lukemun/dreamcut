# Shared camera and timing anchors — initiative (proposed)

Status: proposed 2026-10-24. Camera phases 0 and 1 are implemented; later phases are not.

## Why

Effects keep needing the same two things: something that moves many elements together, and
a way to say when something happens relative to something else. Each effect built so far
has solved them locally (a template's own timing cues, a sound linked to one graphic, a
sketch's own stagger). This initiative makes both into basic building blocks that any element
can use, so a new effect is mostly a matter of choosing anchors and followers, not inventing
a mechanism.

Rule for this work: every piece is general. Nothing here may only work for sketches,
templates or one effect.

## Camera

A camera is a view of the canvas that elements follow. Moving the camera moves every
follower together, while each follower stays its own element with its own timing and
settings. It is a timeline clip the creator can see, retime, keyframe and delete.

| Phase | Scope | Acceptance |
| --- | --- | --- |
| 0 (done) | `src/lib/timeline/camera.ts`: view math, `camera_id` on followers, the camera stored as a shape of kind `camera`. Followers: shapes, in both renderers. `svg_pieces_compile` can add camera moves. | `camera.test.ts`; a push-in previewed in the editor |
| 1 (done) | Followers: stills, video clips, motion-graphic clips and native text, drawn through `cameraMatrix` as their outermost transform (GPU: composed outside the spiral group; Standard: `CameraFrame`). A shared Camera section picks what each element follows. | `gpu-camera.test.ts`; footage and a label pushed in together in GPU preview. Not yet allowed (admission refuses): clips with transitions, subject windows, surface-tracked text. Export through Standard not checked by eye |
| 2 | Camera dials on proposal cards: move timing as timing controls, zoom and focus as linked dials. | First-proposal tuning without keyframe editing |
| 3 | A visible camera lane and a "Follow camera" action for any selection; cameras become their own element type if the shape storage limits it. | A creator adds, retimes and detaches a camera without the agent |

Open questions: whether a camera may follow a camera (nesting); depth (followers that move
less, for parallax); whether captions bound to speech should ever follow one; and making the
spatial checks (speaker clearance, overlap) see the camera's view.

## Timing anchors

A timing anchor says where an element, keyframe or sound starts: at a spoken word, a music
beat, another element's moment, or a fixed time, plus an offset. The anchor is stored, so
retiming the source re-times everything anchored to it.

Existing pieces to unify:

- Spoken words: forced-alignment words and the speech bindings captions and
  `sync_speech_visual` use.
- Beats: `beat_grid_get` and beat annotations.
- Element moments: motion-graphic `timing.cues`, sounds with `follows_visual` (cue and offset),
  and now sketch piece draw-on starts and camera moves.
- Card timing controls (spacing and hold) on proposals.

| Phase | Scope | Acceptance |
| --- | --- | --- |
| 1 | One anchor contract: `{kind: word \| beat \| element_cue \| time, ref, offset}` resolved by a shared resolver, read by any start time or keyframe. | Sketch beats, a graphic and a sound all anchored to words, re-timed by a speech trim |
| 2 | Named moments on every element: draw-on start and end, camera move start and end, motion-graphic cues. Sounds can follow any of them. | A pen-scratch sound follows a sketch piece's draw-on; a whoosh follows a camera move |
| 3 | The `visual-timing` skill plans anchors for any visual (sketch, graphic, overlay, sound), and the agent passes anchors instead of seconds. | Proposals carry anchors; no hand-copied word times |

## Ownership

- Renderer and data model: [playback architecture](playback-rendering.md) and the
  [project model](project-model.md).
- Planning when things land: [visual-timing](../../.agents/skills/visual-timing/SKILL.md).
- Splitting graphics into followers: [split-into-pieces](../../.agents/skills/split-into-pieces/SKILL.md).
