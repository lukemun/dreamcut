---
name: rotoscope
description: Prepare, correct, and verify source-synchronized moving masks for people or objects. Use for rotoscoping, subject isolation, foreground occlusion, selective effects, or silhouette fills; route presenter-specific edge work to talking-head-cutout and still extraction to video-compositing.
---

# Rotoscope a moving subject

Produce a reusable moving matte tied to the original source clock, with enough
handles for editing and evidence of silhouette accuracy through motion. A matte
preparation result is separate from applying it to a timeline or filling it with imagery.

## Reusable preparation and corrections

Use `source_evidence` to deliver source samples for prompt-point selection. It returns
an image and source-time manifest; it does not prove motion or a timeline composite.
Use `cutout_prepare` for requested moving masks: supply the source window, observed
normalized points and `subject` naming included body/object parts. Poll `cutout_status`
until preparation completes; inspect its separate preview readiness before adoption.
Repeated identical requests reuse verified outputs. A failed attempt needs `retry: true`.
Do not read unfinished mask directories or start another SAM process while a job runs.

A re-prompt uses `cutout_prepare` with `parent_cutout_id` and the same source window.
`cutout_correct` supports union/intersection of two prepared masks with matching source,
clock and geometry. Declare a half-open zero-based frame range and normalized
`roi: [left, top, right, bottom]`. It creates a new receipt and leaves parents intact.
Union adds coverage; intersection restricts it. Neither establishes anatomical correctness.
Legacy masks without verified manifests must be prepared through this tool before correction.
See [cutout preparation architecture](../../../docs/architecture/cutout-preparation.md)
for cache invalidation, readiness, failure and current limits.

## Establish the mask contract

Read [media preprocessing](../editor-media-preprocessing/SKILL.md) and the
[media preparation implementation](../../../docs/architecture/editing-implementation-reference.md#media-preparation-details).
For people, also read [talking-head cutout](../talking-head-cutout/SKILL.md); it owns
hair, skin, hands, hole cleanup, and presenter acceptance. For composition, use
[video compositing](../video-compositing/SKILL.md). Existing edits use
[proposals](../open-edit-proposals/SKILL.md); new edits use
[assembly](../editorial-assembly/SKILL.md). Preparation alone grants no timeline write.

Resolve the source asset and fingerprint, selected subject, absolute source interval,
intended use, and output geometry. Inspect actual frames before choosing points.
Ask for the subject or interval only when ambiguous. State whether the mask includes
held objects, cast shadows, reflections, loose hair, and camera-cropped body parts.
Default to the visible selected subject; do not include a reflected copy or nearby
prop merely because it touches the subject.

Record separately:
- **Keep mask:** white/alpha 1 keeps the subject; black/alpha 0 removes background.
- **Holdout:** the inverse mask removes the subject region from a covering layer.
- **RGB cutout:** original source pixels multiplied by the keep mask.

The consumer determines which artifact is needed. Retain the canonical keep mask
rather than substituting a black-background preview for alpha. Tracking-only work
can stop at masks; it need not encode an RGB cutout.

## Inspect and choose a method

Inspect interval endpoints and poses where limbs overlap, hands separate, the subject
turns, exits the frame, or crosses another object. Track visible surfaces: an occluded
hand must disappear and reappear at the observed source times. Do not reconstruct
hidden anatomy. Distinguish intentional holes between limbs from segmentation defects.

| Source | Route |
| --- | --- |
| Existing source-matched alpha or verified masks | Reuse after checking fingerprint, mapping, geometry, cadence and coverage. |
| Person or distinguishable object in a real scene | Local SAM 2 point-prompted tracking, then corrective passes and verification below. |
| Genuine evenly lit green/blue screen | Use the existing chroma-key workflow and inspect spill/edges. |
| Single still | Use [object cutouts](../video-compositing/references/object-cutouts.md). |
| Transparent objects, heavy blur, or tracking that repeatedly loses identity | Report the failed interval and use a supplied external matte or a supported correction method. Do not call an approximate hard mask a verified soft matte. |

## Current execution paths

The preparation-only `POST /api/projects/<id>/analysis/custom-cutout` route is
implemented in [custom-cutout.ts](../../../src/lib/media-analysis/custom-cutout.ts).
It accepts a project-media-relative video source and one point-prompt frame:

```json
{
  "source_relative_path": "sources/subject.mov",
  "start_seconds": 2,
  "end_seconds": 10,
  "prompt_seconds": 4,
  "positive_points": [{"x": 0.5, "y": 0.4}],
  "negative_points": [{"x": 0.1, "y": 0.1}]
}
```

These values illustrate the schema, not useful prompts for an unseen subject.
Coordinates are normalized 0–1 in the displayed, rotation-corrected source frame.
The current route permits at most 16 points per kind and intervals up to 180 seconds;
request a whole take as one interval rather than splitting it by hand.
It extracts tracking images at a maximum 960-pixel long edge, propagates masks,
and reconstructs RGB from the full-resolution source. Its receipt records the
source hash/window, prompt, dimensions, cadence, frame count, and evidence directory.
A full-resolution output raster does not make the tracking mask full-resolution.
Inspect thin features at intended viewing size and disclose this limitation.

For masks without an RGB cutout, the repository runner is:

```sh
node scripts/run-sam2-cutout.mjs --frames <tracking-frame-directory> \
  --out <mask-directory> --prompt-frame <zero-based-index> \
  --points "<x,y;x,y>" --negatives "<x,y;x,y>"
```

This lower-level path uses pixel coordinates in the extracted tracking frames,
not normalized points. Read [the local setup](../../../scripts/matting/README.md) and
[runner](../../../scripts/run-sam2-cutout.mjs) before using it. It requires an optional
local Python environment, SAM 2 dependencies and checkpoint; `TIMELINE_MATTING_DIR`
selects its root. Detect missing dependencies and report them. Do not silently
upload footage to a hosted segmentation service. Lower-level extraction must retain
an explicit source-PTS/frame mapping and receive the same provenance and QA as the
API path. Verify the current runner's arguments before using box prompts.

The current HTTP route does **not** expose boxes, multiple correction prompt frames,
manual animated Bezier paths, or live track-matte image fills. Do not invent request
fields for them. A written skill does not implement those controls. Route missing
composition capabilities through [recreate-effect](../recreate-effect/SKILL.md).

## Prompt, propagate, and correct

Choose a clear prompt frame within a continuous shot. Distribute positive points
across the selected subject's visible parts; for people follow the companion skill's
whole-person prompt coverage. Put negatives on confirmed background, especially
near competing objects, while keeping them off soft subject edges.

Preserve practical two-second handles before and after the visible interval when
available. Record original PTS, extraction cadence, prompt index, orientation, and
any scale transform. For variable-rate sources, document resampling and its mapping;
never assume source frame N means N/30 seconds. Prepare HDR colour handling through
the existing SDR-authority path before reconstructing appearance; preserve the
archival original and derivative lineage. Mask geometry and colour conversion have
separate responsibilities.

Review propagation in both temporal directions from the prompt. If identity drifts
or a hand/hair region vanishes, record the exact first bad source frame, add or move
prompts on verified pixels, and rerun the affected interval into a new output path.
The single-prompt API requires another bounded run for a changed prompt frame.
Split preparation at an occlusion or major pose change only when needed, with
source-matched overlap for comparing the boundary. Processing chunks are not
permission to cut the performance editorially. Preserve a gap-free clock when
combining corrected mask sequences; inspect every chunk join and its adjacent frames.

Use the smallest justified edge cleanup. Area-bounded enclosed-hole filling must
preserve real arm/leg gaps. Erosion fixes proven background fringes, not missing
subject pixels. Feathering cannot repair lost tracking. Keep raw masks and record
cleanup parameters so a later correction remains reversible.

## Using a matte for an image-filled silhouette

A black-background silhouette fill can use a prepared **inverse-alpha holdout**:
black RGB with alpha equal to one minus the subject matte, above independently
editable fill images. The fill is visible through the transparent subject-shaped
window. Keep the holdout on one continuous source clock and switch the underlying
images natively. This preparation bakes only mask shape, not the image sequence.

State the limitation: a full-canvas holdout must cover the entire fill plate.
Shrinking or translating it can reveal rectangular image edges, and stacking
several opaque holdouts does not create several independent masked subjects.
Arbitrary backgrounds, independently movable filled copies, or a live mask-source
binding may require a native compositing extension. Do not present this bounded
black-background construction as a general track-matte control. Verify its combined
preview and its transform limits before recommending it.

## Verify and deliver

Check mask count/order, dimensions, alpha polarity, duration and source mapping.
An `alpha_mode` tag alone is not pixel validation; decode VP9 alpha with the libvpx
path as described in the setup guide. Review black, white and checkerboard composites.
Use the [person-cutout contact-sheet procedure](../talking-head-cutout/SKILL.md#per-second-audit)
for baseline coverage, plus endpoints, motion extremes and all correction boundaries.
For short dense effect intervals, inspect every frame. Then inspect moving playback
for edge chatter, identity switches and frozen frames; stills cannot establish this.

Before adoption, prepare the derivative's matching preview under the
[proxy contract](../../../docs/standards/preview-proxy-contract.md). Keep independent
fills, backgrounds and actor transforms editable. Preserve one continuous subject
clock under the [continuous-source gate](../../../docs/standards/effect-capabilities.md#continuous-source-effect-gate).
A corrected mask is not a reason to bake the complete scene. For speech-bound picture,
use the existing source binding rather than manually nudging it against audio.

Retain a project analysis receipt with source and output hashes, source/derived
mapping, subject inclusion decisions, prompt points and frame, raw masks, cleanup,
prepared-media receipt, inspected frames and playback ranges, defects, and status.
Use `prepared`, `verified`, or `blocked` precisely; mark unchecked motion or edge
quality pending. Record which changes need reprocessing (subject/mask corrections)
and which can remain native (fill choice/timing and supported transforms).

Deliver the artifact location, usable source window and handles, preparation state,
remaining limits, and linked proposal/assembly when requested. Missing source means
requesting the asset; missing mask consumer means a capability gap; neither is a
successful effect. No export is implied by mask preparation.
