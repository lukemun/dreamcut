---
name: surface-text-tracking
description: Attach editable text to a moving flat surface, such as a note or sign, and diagnose drift, wobble, disappearing text or playback-only misalignment. Use rotoscope for subject masks and video-typography for text fixed to the screen.
---

# Track text on a surface

Deliver native editable text that follows the visible surface through its useful motion.
Read [dreamcut-proposals](../dreamcut-proposals/SKILL.md) before timeline work and
refresh applicable preferences. Use [video-typography](../video-typography/SKILL.md)
for lettering; use [rotoscope](../rotoscope/SKILL.md) for masks. A planar attachment
is not a deformable mesh or an automatic occluder mask.

## Establish the source and visibility

Read the current timeline and identify the active local video parent, original source,
source window, speed changes, holds and any foreground copy. Establish the intended
words and when the surface is physically visible. Inspect source frames before choosing
corners; do not guess a quadrilateral from the object center or reuse another shot's values.
If footage or a readable surface frame is unavailable, report that input gap before tracking.
Keep accepted picture timing, effects and wording fixed unless the correction requires them.

Choose a clear reference frame with four physical corners ordered top-left, top-right,
bottom-right, bottom-left. Coordinates are normalized to the original source dimensions;
start, end and reference are original-video seconds, not timeline seconds. Include the
entrance, turn and departure, not only the easiest face-on interval. For an edge-on or
hidden surface, distinguish legitimate invisibility from a failed detection.

## Prepare once, then inspect

Use `surface_track_prepare(project_id, parentId, start, end, reference, quad)` for a
bounded interval of at most 15 seconds, then `surface_track_status` with its returned
job identity. Inspect the returned track, source fingerprint, samples and visibility.
Preparation does not place text. Use the actual returned `surface_track` snapshot in
`create_text` through `proposal_create`; use supported proposal property updates for
revisions. Never modify the working timeline or immutable preparation receipts directly.

Words, font, size and colour remain ordinary editable caption values. Changing them
does not require tracking again. The attachment follows the parent's source clock,
including speed segments; do not retime samples onto timeline seconds. Check the visible
foreground copy when compositing duplicates of the source. Current implementation rejects
orientation/mirroring and manual wall-perspective parents; report unsupported combinations
instead of inventing placement support. See the [surface tracking owner](../../../docs/tools/evolution/surface-tracking.md)
and [source-clock implementation](../../../src/lib/timeline/surface-track.ts).

The user can tune a selected text actor under **Text → Attach text to a surface**:
source frame, four corners and visibility are available; corners save as one draft with
Discard and Undo. Keep these controls discoverable when handing off. Lost samples are
hidden and gaps over 0.15 seconds are not interpolated. Extending the visibility window
alone cannot repair missing samples. Reprepare a bounded interval with a better seed or
propose supported corner/sample corrections; preserve the successful intervals. Never hide
visible text early merely to conceal bad tracking. Do not globally smooth all motion to
fix one turn: valid perspective change must remain intact.

## Diagnose before another iteration

Compare the same source instant across these layers:

- Corners drift relative to the paper in settled source frames: tracking or corner identity.
- Correct corners but wrong placement after a trim, ramp, hold or foreground handoff:
  source-clock mapping, parent identity or composition transform.
- Text vanishes while paper remains readable: inspect visibility bounds, sample gaps and
  active parent before shortening the text clip.
- Paused frames agree but playback separates layers or shows two objects: inspect presented
  frame synchronization and prepared preview readiness; changing the track may not help.

Choose one cause supported by evidence, change only the responsible input, and compare
before/after on that interval plus adjacent boundaries. A successful job or high confidence
score is not proof that lettering is visually attached.

## Verify the entire useful motion

Run frame-state and read its report before appearance judgments: `pnpm frame-state <project-id>`, or in the editor `run_instrument` (frame-state) then `timeline_evidence`.
Inspect all relevant entrance/turn/peak/departure frames for the current question, including
first and last visible text and every parent handoff. Check perspective, corner ordering,
text containment, jitter and unintended disappearance. Then play continuously and replay
across those same boundaries: settled seeks cannot establish playback correctness.
Use the existing prepared composition preview where eligible, wait for readiness, and
verify that edits invalidate stale media. Follow the [playback architecture](../../../docs/architecture/playback-rendering.md)
for current limits; a prepared preview is not a requested delivery export.

Verify wording remains editable without rerunning analysis and explain where corrections
live. Report separately: preparation, sampled-frame inspection, motion inspection, user
acceptance and any unverified export parity. Keep receipts private and hash-bound to the
source/track/timeline used. On new footage, repeat the relevant motion coverage rather
than assuming one accepted shot validates the general method.
