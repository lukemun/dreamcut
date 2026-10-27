# Surface tracking

## 2026-10-03 — initial implementation

Owner: source-time planar preparation and native text attachment. Existing manual surface tilt cannot express tracked four-corner geometry. Reuse normal caption editing, source-clock resolution, proposal creation, and inspector controls.

`surface_track_prepare` queues bounded local OpenCV analysis; `surface_track_status` returns the saved job and track snapshot. Jobs cannot write timelines. The snapshot records source identity, clock, dimensions, confidence and visibility. Changing words does not rerun analysis. Local corner correction remains available. No installation, generation, approval or export authority is added.

Validation receipts and footage-specific assessment remain private. Current boundaries: flat surfaces, short local video intervals, no deformable mesh or automatic occluder masks. Uncertain intervals require review and manual correction. Source orientation and manual 3D perspective are not supported attachment parents. This entry does not claim benchmarked tracking accuracy.

The canonical control home is a selected native text actor → Text → Attach text to a surface. Source frame and visibility values use original-video seconds; the renderer derives placement from the parent’s source clock, including speed steps. Four corners are a structured attachment, edited as a local draft and saved atomically through normal props history. Discard restores the saved attachment; Undo restores the preceding save. Words, font, size and colour remain native caption values. Ordinary position/effect controls are hidden when attached. Visibility edits reuse the prepared samples. Tracking preparation validates source bytes and records the worker/runtime identity in its cache key; variable timing is rejected rather than silently drifting.

Validation: source-clock, visibility, convexity and homography tests; synthetic preview/render parity, repeated seeking, text changes and visibility; a local real-video run and corner-save/Undo exercised. Full independent UI acceptance remains incomplete because the second visual reviewer could not get past editor loading. The broad repository and renderer suites have unresolved failures; do not infer PR readiness from scoped checks. Ordinary caption box/ink metrics explicitly exclude tracked surfaces rather than reporting false geometry.

2026-10-16 — Tracking runs on the subject-tracing environment (`requireMattingPython`, honoring
`TIMELINE_MATTING_DIR`; `DREAMCUT_TRACKING_PYTHON` still overrides), which now ships OpenCV. An
npx-installed DreamCut gets it through `cutout_setup`; an environment from before OpenCV was added
reports `needs_update`, and tracking says to run `cutout_setup install` rather than crash.

2026-10-25 — Pictures on a surface. A `video_clip` or `still` can carry the same `surface_track` plus
`surface_region` ([left, top, right, bottom] as fractions of the surface, -1..2) through `create_visual`.
`timeline/surface-placement.ts` maps the picture's whole canvas frame onto that part of the surface
with a homography and composes the camera the footage follows; GPU preview applies it as the clip's
outer projective transform and Standard uses CSS `matrix3d`. GPU admission refuses an invalid track
or region, a missing parent, and `camera_id`, spiral, transitions or subject windows on an attached
picture. Control home: the picture's inspector → On a screen (attachment plus Left/Right/Top/Bottom
insets). Procedure: [screen-replacement](../../../.agents/skills/screen-replacement/SKILL.md). Validation:
surface-placement unit tests and an in-editor preview of a tracked billboard with a camera zoom;
continuous playback and export parity were not separately measured.
Fix: the prepared (flattened) proposal preview swaps footage to its preview proxy, which hid every
attached picture; `isSurfaceSource` now also accepts the tracked parent playing its own preview proxy
(regression test in surface-placement.test.ts; re-rendered flattened preview shows the pictures attached).
