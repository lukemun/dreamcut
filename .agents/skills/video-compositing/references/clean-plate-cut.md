# Person Appear — clean-plate hard cut

Draft native `clean_plate_cut@1`; archive prototype and fresh-input acceptance pending.
One locked take can supply both the landing performance and later empty set. Preserve
originals and exact source windows. The Appear demo is a hard cut to a whole actor
landing; the mislabeled shared jacket tutorial is not this effect.

Use media-intake `media_import` / `source_evidence` to identify a clean empty-scene
window and the first fully visible jump/landing frame. The creator or agent must
inspect every frame around the cut; no automatic landing detector is claimed.
Verify fixed camera, exposure, focus and background alignment; retain normal landing
motion and speech after the appearance. Do not substitute a fade or a scale flight.

Example block in one normal proposal option, `operations: []`:

```json
{
  "block_id": "appear",
  "kind": "clean_plate_cut",
  "version": 1,
  "inputs": {
    "plate": {"source_url":"/api/projects/PROJECT/media/take.mp4","source_duration_seconds":20,"source_start_seconds":15},
    "performance": {"source_url":"/api/projects/PROJECT/media/take.mp4","source_duration_seconds":20,"source_start_seconds":2},
    "performance_duration_seconds":4,
    "empty_seconds":0.6666666666666666,
    "timeline_start":0,
    "lane":{"lane_key":"visual_0","lane_index":0}
  }
}
```

Replace example paths, durations and marks. Empty plate needs three real seconds of
handles to support the full advertised Empty scene dial0.1–3s (default measured
input, otherwise2/3s). The displayed hold snaps to whole project frames; landing
slides with it and its selected source in/out remain fixed. Source trims, performance
duration and timeline placement must already align to the project grid. Current
project rates approximate the23.976fps reference (frame16≈0.6673s) at24fps
(frame16≈0.6667s); do not claim identical fractional-rate timing.

Original sound0–200% (default100), Advanced Empty scene sound Silent/Original
(default Silent). Performance and optional plate sound remain1× at original pitch.
No sound effect is invented. Source clips are adjacent on one visual lane, editable
and at normal speed; no compositing-mask/segmentation is needed. No automatic ripple
or existing-element removal is performed. Use a free lane or explicitly replace
existing material through the normal proposal contract.

Preflight/create for review; only the human applies. Review last empty frame/first
landing frame and all landing motion, matching background, audio and normal-speed
playback. Exercise hold/audio, reset, Apply/Undo and reopen on a disposable project.
Derived filming/tutorial windows can establish an archive prototype when their PTS,
crop and limitations are recorded; flattened demo reuse is not fresh reconstruction.
A different untreated take and fresh-session build remain required for certification.
