---
name: spatial-composition
description: Arrange and verify multiple visual actors, captions, cutouts, cards, and overlays on a DreamCut canvas. Use for layout, hierarchy, alignment, spacing, layer order, safe areas, overlap, occlusion, or any scene where independently placed assets must read as one composition.
---

# Spatial composition

Read `../open-edit-proposals/SKILL.md` before timeline work. Use `../video-compositing/SKILL.md` for masks, keys, and effect mechanics. When the actor set changes with narration, establish its spoken beat boundaries before spatial placement.

## Design the scene, not the elements

Before proposing placement, describe one scene plan with:

- canvas and delivery safe rectangle;
- background and negative-space strategy;
- one primary focal actor;
- secondary actors and their relationship to the primary;
- text region;
- layer order;
- intentional overlaps; and
- the scene states at which that plan changes.

Assign each actor a named region or relationship such as left column, upper-right callout, centered hero, aligned row, or orbit around the hero. Avoid defaulting multiple assets to canvas center. Repetition needs a shared baseline, spacing rule, and scale family.

Use named regions and relationships by default; deterministic code owns their geometry. Follow the [spatial authoring standard](../../../docs/standards/spatial-authoring.md) for a measured, explicit coordinate fallback when the semantic vocabulary cannot express the needed placement or the user requests precision. State the gap, coordinate frame and anchor; use only supported proposal fields, keep one placement authority, and verify the combined result. Human precision controls remain available without making numeric placement the agent default.

Keep semantic actors as separate elements, but author their transforms as a coordinated set. A white outline belongs to the actor's appearance; position, scale, timing, and overlap belong to the scene instance.

## Preserve lane locality

Layer order and editability are one contract. Represent each coordinated visual idea as a contiguous top-first block in `lane_order_keys`: hero, supporting actors, paired context actors, then plate/background. Do not scatter related actors between unrelated lanes merely because automatic lane allocation found the next free numeric suffix. Lane numbers are identities, not the desired presentation order.

Keep a paired person and device, callout and target, or frame and contents adjacent in the lane stack even when their clips appear sequentially. When reorganizing an existing scene, preserve the relative order of every unrelated lane and move only the related lanes into a stable block. Required compositing order wins over adjacency; record any such exception instead of silently producing a hard-to-edit stack.

## Treat overlap as a decision

For every pair of simultaneous foreground actors, classify the relationship as disjoint, touching, intentionally overlapping, or unknown. If overlap is intentional, state which actor is in front and what part of the rear actor may be covered. Faces, essential object features, text, and speech-bubble tails are protected regions unless the user directs otherwise.

Bounding boxes are conservative. Transparent corners do not prove visible occlusion, while a full-frame source may contain a small visible subject. Use alpha or mask bounds when available and rendered pixels when the distinction affects the edit.

## Use the spatial engine honestly

`proposal_create` runs the scoped spatial check on every visual proposal and returns `spatial_review`; use `proposal_spatial_preflight` to run the same check as a dry run while iterating on a layout. It assesses only the changed actors and their before/after timeline spans, and reports introduced, resolved, and remaining issues. This is the proposal-review default because unrelated historical warnings from the rest of a long edit are not actionable in that card. Use full-timeline `spatial_assess` only for an explicit whole-video audit or when investigating context outside the proposed edit.

`spatial_assess` projects sampled face/person boxes through supported timeline geometry and reports caption-box intersections, layer order, evidence revisions, and unknowns.

Read `visual_overlap` even when the outer caption assessment is `not_applicable`. It compares stills, videos (including moving cutouts and graphics), and captions across all lanes at pair-local entrances, exits, keyframes and midpoints. Each warning represents one pair across its sampled interval; `sample_count` is supporting evidence rather than additional issues. It returns element types and IDs, layer order, peak rectangle intersection, expected/minor-overlap suppression counts, unknowns and truncation. Captions use loaded-font measurements when supplied and estimates otherwise; unsupported caption animation is unknown. Review each warning in the combined preview and repair unintended conflicts through semantic layout. Transparent margins can intersect intentionally; the warning is not proof of visible occlusion. See `../../../docs/visual-overlap-contract.md` for the versioned contract.

Today it is advisory evidence, not an auto-layout engine. Source assets carrying a preprocessed `binary-alpha-footprint-v1` annotation expose sampled output-pixel support, including the configured scratchpad outline. Read `alpha_relations` for disjoint, touching, and overlapping alpha/alpha pairs; distinguish `subject_overlap_pixels` from `border_involved_pixels`. Unannotated actors remain conservative rectangles. The engine still does not establish prop-to-person or speech-bubble-to-face semantics, scene density, fractional-opacity area, or continuous between-frame clearance. Caption footprints may be estimated; transitions, active unsupported animations, and unexamined intervals can return unknown. Never translate an empty or not-applicable result into “layout is clear.”

Use proposal preview to inspect the combined option at every entrance, exit, replacement, and representative hold before approval. After the composition is current, use `frame-state` to render those states and read every required `new` or `changed` frame. When there are no captions, pass explicit `--at` times. The green safe rectangle and ruler help locate the problem, but visual inspection remains the authority for hierarchy, pixel occlusion, balance, and style. Do not claim `frame-state` validated an unapproved proposal: the current instrument reads the working timeline.

## Review as a combined option

Place or adjust all actors in one scene through one proposal option so its preview represents the real composition. Do not distribute a coordinated layout across independently approvable proposals.

Before reporting a layout ready, verify:

- the primary actor reads first at phone size;
- protected regions remain readable;
- supporting actors share alignment, spacing, and scale logic;
- intentional overlaps have the correct front/back order;
- related actors form a contiguous lane block unless compositing requires a documented exception;
- no actor crosses the platform-safe rectangle without a stated reason;
- every scene state has been rendered, not only the easiest midpoint; and
- spatial unknowns and intentional collisions are disclosed rather than described as clear.
