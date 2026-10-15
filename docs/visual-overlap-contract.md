# Visual overlap evidence, version 5

Implemented as `visual_overlap` on spatial assessment. Current timeline,
individual proposal preview, batch preview, and MCP `spatial_assess` all share the assessor.
The outer assessment status still describes caption evidence; consumers must read
`visual_overlap.status` independently, including when there are no captions.

## Proposal-scoped preflight

`proposal_spatial_preflight` accepts the exact unsaved proposal body and applies each option to an
in-memory timeline. It does not create a proposal or change the working timeline. For ordinary actor
edits, the assessor samples only the union of that actor's before/after timeline spans; overlap pairs
must include at least one changed visual or caption, and safe-area checks inspect only changed actors.
The result separates introduced, resolved, and remaining issues. This is the default agent check before
`proposal_create`, avoiding unrelated warnings elsewhere in a long video.

Lane-order and output-format operations are global composition changes, so their preflight scope expands
to the complete active visual span. Audio-only proposals return `not_applicable`. Full-timeline
`spatial_assess` remains the deliberate whole-project audit surface.

All rendered timeline types participate: `still`, `video_clip`, and `caption_text`,
regardless of lane name. Cutouts and graphics use their underlying still/video type.
Audio is excluded. The contract has one public result, `visual_overlap`.

## Minimal contract

`version: visual-overlap-v6`, `status: sampled | unknown | not_applicable`,
`evidence: conservative_rectangles`, `examined_relationships`, `examined_samples`,
`observed_intersections`, `suppressed_expected_overlaps`, `suppressed_minor_overlaps`,
`suppressed_transparent_overlaps`, `examined_alpha_samples`, `alpha_relations`,
`examined_safe_area_samples`, `safe_area_warnings`, `truncated`, `warnings`, `unknowns`,
and `limitations`. The parent `snapshot_id` binds evidence to the timeline, metadata,
source evidence and assessor version. This adds no timeline writes or approval gate.

Each `possible_visual_overlap` warning represents one element pair, rather than one row per
sample. It contains the sampled start/end, representative peak time, sample count, two element
IDs and types, projected boxes at the peak, intersection, maximum fraction of the smaller box,
front element (null for unresolved ordering), unknown editorial intent, and a factual message.
It also exposes a footprint for each element and an area-contact record. A footprint includes
the conservative bounds, their centroid, a four-corner rectangular outline, the evidence basis,
and `visible_shape: unknown`. Contact includes the intersection bounds, intersection centroid,
area, and the fraction of each footprint occupied by the intersection. These make position and
span explicit to an agent without misrepresenting a rectangular broad phase as an alpha silhouette.

When an asset has a source-addressed `binary-alpha-footprint-v1` annotation, the footprint instead
uses decoded alpha at the source frame and rasterizes it through the same contain, translation,
scale, crop, and ordered eight-pass sticker-outline support model at output-pixel centers.
`visible_shape` becomes `binary_alpha`. `alpha_relations` reports every sampled alpha/alpha pair,
including disjoint pairs that do not produce warnings. Each state classifies the pair as disjoint,
touching, or overlapping and reports subject-overlap pixels separately from pixels involving a
sticker border, plus contact bounds and centroid. Source rectangles that intersect while decoded
alpha does not are counted under `suppressed_transparent_overlaps`.
Sampling is pair-local: overlap boundaries, the pair's keyframes and animation boundaries, and
interval midpoints. Unrelated element changes do not multiply observations. Intervals are half-open.
Muted and removed elements are excluded. The shared media scene resolver computes
scale, translation and mask clipping. Dimensions come from source width/height props.
Missing dimensions use the transformed canvas envelope and emit explicit unknown records;
this encloses any contain-fitted source. Settled entrance/exit animations and pure opacity
fades permit conservative bounds; active movement remains unknown. Unsupported effects return unknown records. Transitions
conservatively return unknown. Analysis caps at 10,000 pair samples and 200 unique-pair warnings
with truncation; these are safety limits rather than expected normal output.

When the caller supplies the delivery-safe rectangle, every foreground visual is also sampled at
its own entrances, exits, animation boundaries, keyframes, and interval midpoints. One
`visual_outside_safe_area` warning aggregates the sampled violations for one element and reports
the representative footprint, safe rectangle, per-edge excess, and maximum outside distance.
Explicit backgrounds and near-full-canvas plates are excluded. Transparent unannotated margins
remain conservative evidence, so the warning proves the sampled footprint crosses the safe
rectangle, not that opaque subject pixels do.

Videos contribute their frame bounds, not a tracked subject silhouette. Static captions use
the caption anchor/content-rectangle resolver with supplied loaded-font heights or explicit
estimates. Animated or otherwise unsupported captions return unknown. Caption pairs are
included as well as caption/media pairs. Explicit background/container roles and full-canvas
actors behind another visual are expected container overlaps: they remain counted as observations
but do not become warnings. Intersections under 8% of the smaller box are also retained only as
measurements. A full-frame actor in front is not suppressed.

Unannotated actors still use a broad-phase rectangle test. Transparent margins can create false positives.
The footprint outline is the rectangle used by that test, not the visible subject outline. Exact
visible outlines require alpha/mask or rendered-pixel evidence and are not fabricated. Annotated
binary-alpha pairs detect eight-neighbour pixel touching; unannotated zero-area edge tangency is not emitted.
Heuristic background suppression is reported separately because roles are not yet authoritative. It does not certify
pixel occlusion, continuous motion clearance, protected regions, or excessive density.
An empty warnings list is never a visual-quality verdict. Sample times are evidence
points, not proof of a whole interval. No detector, generation, or render is triggered.

## Harness behavior

After constructing an option, inspect its preview assessment. Review every reported pair
in the combined preview, including unknowns and truncation. Resolve unintended conflicts
with semantic layout directions; retain intended layering with an editorial explanation.
Do not treat a bounds intersection as proof that the artwork is wrong. Do not suppress
warnings merely because the LLM calls them intentional. A future intent contract can
record pair-specific relationships and compare them with measured evidence.

Next extensions should keep this shape: reliable roles for density checks; protected regions;
fractional-alpha measurements; bounded intent; richer motion sampling.
Version changes must affect snapshot identity. See [spatial evidence architecture](spatial-evidence-architecture.md).

## Alpha preprocessing contract

`pnpm alpha-footprints <project-id> --after <seconds>` decodes every selected still frame and every
video frame through ffmpeg RGBA, records run-length source-alpha rows, bounds, centroids, occupied
pixel counts and source times, and writes an immutable gzip artifact. The project index lives at
`instruments/media-index/alpha-footprints.json`; the same source-addressed artifact is published as
an L1 `alpha_footprint` media-context dataset. Originals are never changed. The active dataset
revision, recipe, threshold, dimensions, frame count and checksum bind the evidence consumed by
the spatial snapshot.

The v1 recipe treats alpha byte values >= 1 as occupied. Its composition statements are exact for
that binary model at sampled output-pixel centers. It does not claim fractional-opacity area,
subpixel antialias coverage, or clearance between decoded video frames. Active legacy entrance
animations remain unknown until their geometry is compiled into the shared scene resolver.

## Learning from manual corrections

Committed editor mutations already create immutable timeline history snapshots and memory
events (`store.ts`). `editChapters` reconstructs before/after element properties. The privacy
projection sent to the retro preserves timing plus bounded layout evidence: media scale/offset,
caption position/width, semantic and group layout names, outline/alpha flags, and spatial-keyframe
counts. It excludes media URLs, paths and transcript text. `createRetroCheckpoint` freezes these
chapters, proposal records, and events, so a newly run retro can compare the preserved manual
layout states even when the edits predate this contract.

History snapshot events currently identify the actor as `unknown`. A movement alone does
not prove a human correction, its motivation, or a reusable preference. Retrospective
findings remain evidence-backed candidates; history capture does not itself rewrite skills.
Undo, temporary experimentation and conflicting later edits are counterevidence.

A later correction contract should add trusted actor attribution at the safe-write boundary,
before/after snapshot references, affected element IDs, and optional user rationale. It can
attach assessments of both states, allowing a retro to observe that an intersection reduced.
Do not retrospectively invent actor attribution or infer a permanent style rule from one drag.
