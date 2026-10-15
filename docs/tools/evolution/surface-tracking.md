# Surface tracking

## 2026-10-03 — initial implementation

Owner: source-time planar preparation and native text attachment. Existing manual surface tilt cannot express tracked four-corner geometry. Reuse normal caption editing, source-clock resolution, proposal creation, and inspector controls.

`surface_track_prepare` queues bounded local OpenCV analysis; `surface_track_status` returns the saved job and track snapshot. Jobs cannot write timelines. The snapshot records source identity, clock, dimensions, confidence and visibility. Changing words does not rerun analysis. Local corner correction remains available. No installation, generation, approval or export authority is added.

Validation receipts and footage-specific assessment remain private. Current boundaries: flat surfaces, short local video intervals, no deformable mesh or automatic occluder masks. Uncertain intervals require review and manual correction. Source orientation and manual 3D perspective are not supported attachment parents. This entry does not claim benchmarked tracking accuracy.

The canonical control home is a selected native text actor → Text → Attach text to a surface. Source frame and visibility values use original-video seconds; the renderer derives placement from the parent’s source clock, including speed steps. Four corners are a structured attachment, edited as a local draft and saved atomically through normal props history. Discard restores the saved attachment; Undo restores the preceding save. Words, font, size and colour remain native caption values. Ordinary position/effect controls are hidden when attached. Visibility edits reuse the prepared samples. Tracking preparation validates source bytes and records the worker/runtime identity in its cache key; variable timing is rejected rather than silently drifting.

Validation: source-clock, visibility, convexity and homography tests; synthetic preview/render parity, repeated seeking, text changes and visibility; a local real-video run and corner-save/Undo exercised. Full independent UI acceptance remains incomplete because the second visual reviewer could not get past editor loading. The broad repository and renderer suites have unresolved failures; do not infer PR readiness from scoped checks. Ordinary caption box/ink metrics explicitly exclude tracked surfaces rather than reporting false geometry.
