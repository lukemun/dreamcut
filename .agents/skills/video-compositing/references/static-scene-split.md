# Magic Pole / static scene split (draft)

For a stationary pole/occluder hiding a change between two locked-camera takes,
use `static_scene_split@1` in one `proposal_create` option. This is a native draft;
real-footage visual, playback and fresh-input acceptance are pending. A moving pole
or camera needs a separately measured/tracked route, not this static seam.

Import original takes with `media_import` and verify readiness/provenance. Film both
in the same framing with exposure locked, crossing the same pole in the same way.
Use `source_evidence` for navigation, then source-PTS frame inspection to choose
crossing marks. Temporarily comparing at 50% opacity is an alignment aid; the block
compiles final full-opacity pictures. Source starts and timeline start must already
be on the output frame grid. Supply the replacement's aligned source start, with
12 output frames before and after the selected window for its timing dial. The base
needs the complete selected duration. Missing handles are an error, not permission
to freeze or silently clamp the timing dial.

Measure the pole centre as percent of canvas width. The two actors must line up at
foot/body crossing; a static split does not fix different gait, head position or
shadows. All existing lanes must appear in the complete top-first lane order with
replacement above base. Example with replaceable IDs:

```json
{
  "block_id": "pole-change",
  "kind": "static_scene_split",
  "version": 1,
  "inputs": {
    "base": { "source_url": "/api/projects/PROJECT/media/red.mp4", "source_duration_seconds": 10, "source_start_seconds": 1 },
    "replacement": { "source_url": "/api/projects/PROJECT/media/blue.mp4", "source_duration_seconds": 10, "source_start_seconds": 2 },
    "duration_seconds": 4,
    "seam_percent": 50,
    "lane_order_keys": ["visual_1", "visual_0"]
  }
}
```

Main dials: Pole position (25–75% canvas width, measured default), Edge softness
(0–5% canvas height, default0.2%), Second take timing (-12–12 output frames,
default0; positive reads later in the replacement). Advanced: New outfit appears
on (left/right, default right), Second take horizontal/vertical alignment (-5–5%
canvas, default0). The seam stays in canvas space while alignment moves the replacement picture. Supply the actual canvas dimensions (default1080×1920); aspect ratios9:16 through16:9 are supported. A native rotated line mask gives the vertical seam working feather; a left/right rectangular crop has hard horizontal edges and cannot implement that dial. Feather must stay inside the actual occluder
with no visible double actor or carpet line. The base remains continuous and audible;
replacement remains continuous and muted. No synthetic motion or tracking is added.

All dials compile through the shared proposal tuning/reset/preview/approval path.
Changing timing leaves the base source clock and both timeline durations unchanged.
Source selection, duration and lane order are block inputs; update the proposal when
new footage needs a different window. Preserve unrelated clips in `lane_order_keys`
and name only deliberately replaced clips in optional `remove_element_ids`.

Stage on an isolated input-only project. Read `proposal_create` warnings and
`dial_sweep`. Before appearance claims use `pnpm frame-state` and the required
browser surface. Inspect crossing-1/crossing/crossing+1 frames, head/feet/pole edges
and floor shadows; play the entire approach/change/payoff normally and check audio.
A split through a pole must conceal the seam without deleting a head or stretching
the actor. Sweep source slip and seam/feather endpoints, reset, approve/undo in the
disposable project, then check persistence. A real fresh pair of takes and an
independent agent using only this procedure are required for reuse certification.
Contract fixtures or old primitive tests do not prove any of those visual checks.


## Short source handles: supported native fallback

If the block refuses the required final-lesson duration because its fixed symmetric
12frame handles do not fit, record the adapter gap once. Do not shorten the final
scene, freeze a performer, substitute footage, or silently clamp the block dial.
An ordinary native proposal can express the same two continuous clips and static
vertical mask with a supported coupled timing control. Use a `hold` timing control
whose reference and spacing equal the authored replacement source start. Bind the
replacement create operation source-start and source-end with multiplier1 and
offsets equal to their authored clocks; both receive the same spacing delta.
Choose the minimum/maximum from actual available head/tail source handles on the
output frame grid. Keep the base clock, both timeline durations and lane order
fixed. Read the current schema from capability_catalog rather than guessing fields.

Derive each allowed timing position and reset to verify duration preservation and
source bounds. Then inspect the actor's head, hands, feet and shadows independently
at crossing-minus/plus several frames: matching shirt centres can still delete a
face, while matching feet can misalign heads when the takes have different gaits.
Small phase variance alone is tolerable under creator direction; a missing body
part or visible seam remains an actual defect. Keep such a result explicitly
pending validation. The fallback does not certify the block's missing range support.
All proposals remain human approved; never apply or undo on a handed-off project
merely to satisfy a test checklist.
