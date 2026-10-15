# Spatial authoring: semantic first, explicit coordinate fallback

Status: current contributor policy, clarified by the creator on 2026-09-28. This supersedes older design prose that treats all agent-authored coordinates as categorically forbidden. It changes the default authoring policy, not the supported fields of any runtime schema.

## Default path

Agents read measured spatial facts and choose named slots, relationships, sizes, layouts, and motion endpoints. Deterministic code resolves geometry. Use the supported semantic contract whenever it expresses the requested result; never choose raw coordinates merely because they are familiar or readily available.

Emphasis text (a pull quote, a stat, a headline beside the speaker) is sized to the open space, not guessed: call `open_space_find` at a moment the text is on screen and use the props it returns for the chosen fill level (large, 85% of the open region, by default; medium 70%, full 95%). These are measured coordinates from the tool, so they satisfy the measured-fact rule below. Spoken captions keep their caption style rules.

Text never covers the speaker's face unless the creator asks for it. The element overlap check cannot see a face inside footage, so proposal staging also runs a speaker-clearance check: whenever an option adds or changes text, or re-frames footage that has text over it, it samples up to ten of those moments, finds the face in each frame (through the clip's zoom and offset) and returns `speaker_clearance` in `spatial_review`, plus a warning naming the times the text covers the head. Treat that warning as a blocker: move the text and stage a superseding card before presenting it. A literal request such as "middle centre" over a centred talking head still gets placed clear of the face, with the X and Y dials to move it.

Every captions card carries Size, X and Y dials (`font_size_px`, `offsetX`, `offsetY` on `replace_captions`); X and Y nudge the rail from its preset spot while each caption stays centred. `caption_proposal_compile` includes them. One word at a time is `timing_mode: "single_word"`. Spoken numbers and names read as written through each cue's `caption_display_substitutions` (for example "eighty k" → "$80K"), which also time a substituted phrase as one word.

The [spatial engine architecture](../architecture/spatial-engine.md) maps the read instruments, semantic resolver, assessment, preflight, and proposal path.

## Coordinate fallback

Explicit X/Y/Z values are permitted as a fallback when the supported semantic vocabulary cannot express the necessary placement, or the user deliberately requests precise coordinates. Before using the fallback:

1. Name the semantic limitation or precision request in the proposal rationale.
2. Use measured geometry or explicit supplied values. State the coordinate frame, units, anchor, and affected actor; do not guess numbers from a screenshot.
3. Use only fields accepted by the safe operation contract. If that contract rejects the needed coordinates, extend it with validation and preview support or report the gap; do not bypass it through files or private mutation routes.
4. Keep one authoritative placement mode for each affected property. Do not attach conflicting semantic and numeric instructions. An override must have explicit precedence supported by the contract.
5. Assess the combined candidate, inspect the relevant preview states, and preserve human approval. A numeric fallback does not weaken source, timing, or review safeguards.

Z is not a universal DreamCut coordinate. Distinguish compositing order from actual depth in an effect that supports it; use the relevant typed operation. This policy does not introduce arbitrary 3D placement.

Repeated fallback for the same reusable relationship is a signal to improve the semantic resolver. It must not become an undocumented default in examples, recipes, or agent instructions.

## Visible motion and offscreen endpoints

Time an animation by the movement the viewer can see. An exit ends at the first
frame where the actor and its visible blur, trail, shadow, or other effect footprint
fully clear the output canvas. Stop the animated properties there by default;
do not spend the remaining duration moving an invisible actor farther away.
An intentional offscreen pause is a separate hold, not part of the visible exit.
For an entrance, begin just outside the visible boundary so its duration is spent
entering the frame rather than approaching it invisibly.

Continue motion offscreen only for a stated purpose, such as a continuous trajectory
that determines a later re-entry, a camera move that reveals the actor again, or an
effect whose visible contribution continues after the actor leaves. A later return
alone does not require hidden travel: use an offscreen hold and a separate entrance
unless trajectory continuity matters. Preserve source playback and audio clocks;
stopping visual motion does not authorize trimming or freezing the source.

Measure transformed actor/effect bounds against the actual output canvas, not just
the actor's center or the editor viewport. Check normal-speed playback, the visible
motion midpoint, and frames immediately before and after clearance or re-entry.
If effect bounds cannot be measured reliably, inspect rendered pixels and report
the remaining uncertainty. Review fails when added animation time is invisible
without an explicit purpose, or when a blur/trail is clipped before it clears.

Adopted at the creator's explicit request on 2026-09-29 after a speed-exit review
showed that extended offscreen travel made the visible burst too short. This is an
authoring and review requirement; automatic offscreen stopping is not implemented
by this policy change.

## Human controls and current enforcement

Human drag and exact-value controls remain normal precision tools. A proposal may offer horizontal, vertical, and size dials while the agent's initial placement is semantic. Controls must tune the actual candidate through the supported review contract.

Current semantic visual placement and named motion are implemented. Some generic props and creation paths also accept numeric fields; other operations, such as named replacement-caption placement, have stricter schemas. The default-path rule and fallback rationale are authoring/review policy, not universally enforced by runtime metadata today. Do not claim that an allowed numeric field proves a justified fallback, or that documentation makes a rejected field usable.
