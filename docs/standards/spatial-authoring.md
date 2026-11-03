# Spatial authoring: semantic first, explicit coordinate fallback

Status: current contributor policy, clarified by the creator on 2026-09-28. This supersedes older design prose that treats all agent-authored coordinates as categorically forbidden. It changes the default authoring policy, not the supported fields of any runtime schema.

## Default path

Agents read measured spatial facts and choose named slots, relationships, sizes, layouts, and motion endpoints. Deterministic code resolves geometry.

There is one read of what is on screen: `open_space_find` (code: `readScreenSpace` in `src/lib/local-store/screen-space.ts`). For a moment or a span it returns every occupant (the speaker's head and shoulders, and every picture, text and shape, through any camera) and the regions free for the whole span. Placing or replacing anything starts there: put the new thing in an open region for the time it is on screen, and pass `exclude_element_ids` with the element being replaced or moved. Element boxes come from `elementRectAt`, the same function the overlap check uses, and the face check reads the same occupancy, so a placement taken from the read is not refused at proposal time. By default nothing lands on another graphic or on the speaker; an overlap happens only when the creator asks for it. Use the supported semantic contract whenever it expresses the requested result; never choose raw coordinates merely because they are familiar or readily available.

Text and drawn shapes that belong to something are placed by relation, never by guessed numbers: `place: { relative_to, side, gap, align }` on `create_text`, `create_shape` or a `props` patch, where `relative_to` is an element id or a group of ids (a drawing's pieces), `side` is `below`, `above`, `left`, `right` or `inside`, `gap` is a share of the canvas height and `align` is `start`, `center` or `end`. The shared resolver (`src/lib/timeline/placement-relation.ts`) computes the coordinates from the anchors' boxes (the same boxes the overlap check uses, drawings counted fully inked) over the follower's time on screen, before any camera, and the follower is seen through its anchor's camera. It re-resolves in the proposal derive (so tuning the anchor or the Side and Gap dials moves it) and in the editor's write path (a person moving the anchor carries it; a person moving the follower itself keeps that spot and ends the relation). `svg_pieces_compile` returns a `label_slot` with the drawing's pieces as one anchor, and `reserve_label_space` keeps room for it inside the open region. A relation is the element's one placement mode: it cannot sit beside coordinates, a position preset or its own camera, and `proposal_create` refuses a follower that the frame edge pushes back onto its anchors.

Emphasis text (a pull quote, a stat, a headline beside the speaker) is sized to the open space, not guessed: call `open_space_find` for the span the text is on screen and use the props it returns for the chosen fill level (large, 85% of the open region, by default; medium 70%, full 95%). These are measured coordinates from the tool, so they satisfy the measured-fact rule below. Spoken captions keep their caption style rules.

Text and drawn graphics never cover the speaker's face unless the creator asks for it. The element overlap check cannot see a face inside footage, so proposal staging also runs a speaker-clearance check: whenever an option adds or changes text or shapes, re-frames footage under them, or changes a camera they follow, it samples up to sixteen moments (across each graphic's time on screen and at every camera keyframe), finds the face in each frame through the clip's zoom, offset and camera, and returns `speaker_clearance`. `proposal_create` refuses an option that covers the head; set the option's `speaker_overlap_intended` only when the creator asked for that overlap. `proposal_spatial_preflight` reports the same result as a dry run. The element overlap check covers drawn shapes (their outline box) and judges every actor through the camera it follows. A card is also checked against what each other pending card would add, so graphics previewed or applied together do not stack (`pending_card_overlaps`, a warning). A literal request such as "middle centre" over a centred talking head still gets placed clear of the face, with the X and Y dials to move it.

Every captions card carries Size, X and Y dials (`font_size_px`, `offsetX`, `offsetY` on `replace_captions`); X and Y nudge the rail from its preset spot while each caption stays centred. `caption_proposal_compile` includes them. One word at a time is `timing_mode: "single_word"`. Spoken numbers and names read as written through each cue's `caption_display_substitutions` (for example "eighty k" → "$80K"), which also time a substituted phrase as one word.

The [spatial engine architecture](../architecture/spatial-engine.md) maps the read instruments, semantic resolver, assessment, preflight, and proposal path.

## Coordinate fallback

Explicit X/Y/Z values are permitted as a fallback when the supported semantic vocabulary cannot express the necessary placement, or the user deliberately requests precise coordinates. Before using the fallback:

1. Name the semantic limitation, precision request or measuring tool in the option's `coordinate_fallback_reason`. `proposal_create` refuses coordinates on text and drawn shapes (`absX`/`absY`, `media_offset_x/y` and their keyframes) without it. Values a measuring tool returns (open-space props, `svg_pieces_compile` pieces, whose `option_fields` carry the reason) are measured fallbacks; a guessed number is not.
2. Use measured geometry or explicit supplied values. State the coordinate frame, units, anchor, and affected actor; do not guess numbers from a screenshot.
3. Use only fields accepted by the safe operation contract. If that contract rejects the needed coordinates, extend it with validation and preview support or report the gap; do not bypass it through files or private mutation routes.
4. Keep one authoritative placement mode for each affected property. Do not attach conflicting semantic and numeric instructions. An override must have explicit precedence supported by the contract. `proposal_create` refuses a position preset beside coordinates on new text (the coordinates would silently win), and `place` beside anything else.
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

Current semantic visual placement, named motion and relation placement for text and shapes are implemented. For text and drawn shapes the default path is enforced at `proposal_create` (coordinates need `coordinate_fallback_reason`; mixed modes are refused); `proposal_spatial_preflight` reports the same as `placement_refusals`. Pictures (`create_visual`) still accept numeric fields under the policy above without that check, and stored cards stay readable as written. A relation placed by keyframed motion is not supported: a placed element cannot also carry offset keyframes. Do not claim that an allowed numeric field proves a justified fallback, or that documentation makes a rejected field usable.
