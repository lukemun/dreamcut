---
name: dreamcut-proposals
aliases: [open-edit-proposals]
description: Safely inspect and edit an existing DreamCut video timeline through previewable proposals. Use for any conversational timeline edit, including edits described by a review mark, exact dictates, trims, cuts, captions, audio, media, layout, effects, or output format.
---

# DreamCut proposals

Before constructing an effect, follow the [continuous-source effect gate](../../../docs/standards/effect-capabilities.md#continuous-source-effect-gate). Keep a continuous performance on one source clip with timed effects; document and justify any derivative or extra cut before preparing the proposal. Missing native controls are capability gaps, not permission to silently split or bake the treatment.

Treat a normal edit request as a request to prepare a previewable proposal. The user never needs to say “proposal,” “previewable,” or “do not apply.”

An **edit** proposes a specific change for approval; an **audition** offers multiple alternatives to one editorial question for user choice. Use one proposed result by default for an edit. When the user wants a comparison, follow `../timeline-auditions/SKILL.md`; mutually exclusive proposal options are the current supported transport for auditions against a working cut. Multiple independent changes remain separate edits. A recommendation or playback is never a winner selection or approval.

1. Read the timeline with `timeline_get` and keep its revision.
2. When the user refers to a mark, read the project frame tags. A mark locates the region; it is not automatically an edit boundary.
3. When the request contains several commands, several marks, or ambiguous grouping, read `../editorial-intent-planning/SKILL.md`. Persist its interpretation plan before creating the proposal, and map every planned task to an operation or an explicit disposition afterward.
4. Identify the requested change and what must remain fixed using the scope discipline below. Perform read-only analysis as needed. Prefer existing alignment, transcription, shot, loudness, and media analysis.
5. `proposal_create` runs the scoped spatial check itself for every option that can move or cover something (anything but sound and colour) and returns `spatial_review` with introduced, resolved and worsened overlaps between changed actors and their neighbours, plus a warning for any new overlap, and against what other pending cards add (`pending_card_overlaps`). Shapes are included, and actors are judged through any camera they follow. An option whose text or drawing covers the speaker's face is refused.

   **Place from `open_space_find` first.** Before placing any new or replacement text, picture or drawing, call `open_space_find` over its time on screen (excluding the element being replaced), with the text when there is text, and size and place it from the open regions and measured room it returns; do not find the room by trial `proposal_create` calls. This keeps a placement off the speaker by default (`speaker_overlap_intended` only when the creator asked for the overlap). Text and drawn shapes that belong to something are placed by relation, not coordinates: `place: {relative_to, side, gap, align}` on `create_text`, `create_shape` or `props` ("1000 tasks" below the skyline: `relative_to` the drawing's piece ids from `svg_pieces_compile`'s `label_slot`, `side: "below"`). Code computes the position, keeps it with its anchor through tuning and camera moves, and the card gets Side and Gap dials. Coordinates (`absX`/`absY`, `media_offset_x/y`) on text and shapes are refused unless the option sets `coordinate_fallback_reason` (copy `svg_pieces_compile`'s `option_fields` for its pieces); a preset beside coordinates is always refused. Read it; repair an unintended conflict with a superseding proposal, or state why the overlap is intended. For layout-heavy work (captions, multi-clip placement, reveal sequences), `proposal_spatial_preflight` runs the same check as a dry run so you can iterate before staging. Do not substitute a whole-video `spatial_assess` dump for this check.
6. Express every working-timeline change with `proposal_create`. Send the same body that passed preflight. Do not mutate the timeline through direct MCP writes, HTTP mutation endpoints, or file edits. Never approve, reject, render, or export for the user.
7. Make each option independently previewable, recommend exactly one option, explain assumptions, and keep mutation and render caps honest. For a multi-beat plan, create one proposal per independently reviewable beat by default. Every card must apply on its own, in any order, whatever the creator does with the others: put edits that depend on each other, or change the same setting, in one card. `proposal_create` refuses a card that overlaps, depends on or would break another pending card, and names it; combine the two or replace the earlier one. Combine separate beats only when the user explicitly requests one integrated review or separation would make a preview misleading or invalid.
   When the creator asks for several changes, work through them with [working-through-requests](../working-through-requests/SKILL.md): draft one to three cards per pass, each built to survive the creator's decisions on the others, and leave the rest recorded under Up next ("Not drafted yet") until the pass settles. When `proposal_list` shows a stale card with `agent_request` (the creator pressed Repair), or the creator pastes a repair request, follow its prompt: read the card and its `tuned_baseline`, find what changed, and send a replacement naming it in `supersedes_proposal_ids` that keeps its intent and tuning.
   When a revised or consolidated proposal intentionally replaces earlier pending cards, include their ids in `supersedes_proposal_ids`. Creating the successor changes nothing; if the human approves it, those named drafts are resolved as superseded in the same approval and do not linger as stale review items. Never use supersession for an independent edit the user may still want.
   **Split a card on request without losing work.** When the creator asks to split a card, restage every part that can wait beside the others in the same turn, each as its own card, and name the superseded card. For any part that cannot wait beside them (a cut card cannot wait beside cards of other kinds), say which follow-up card will bring it back and when. A liked part must never silently disappear.
   **Write the card for the creator.** The title, option labels and option summaries say what the viewer will see or hear, as the creator would say it: "The DREAMCUT word becomes its own clip you can edit", not "Scrambled word on its own transparent clip replacing the baked decode clip". Name clips by what they show; quote on-screen words. Build terms, field names and ids stay in the brief and audit record. `proposal_create` refuses card text with known build vocabulary and names each word to rewrite; see [proposal presentation](../../../docs/standards/proposal-presentation.md#write-cards-in-plain-words).

   **Send a large edit as a wave.** When one request needs several decisions the creator will want to settle separately (for example a new section: the opener, then the title cards, then the music bed), send it as a queue of small proposals sharing `wave.id`, numbered `wave.step` in the order a creator would settle them, each with a plain `wave.title`. Create the first one to three steps, then each later step once the earlier ones settle, built on what the creator applied. Steps are an order, not dependencies: each must apply whatever happens to the others, so something that only makes sense after step 1 (sounds that follow a graphic step 1 creates) belongs in step 1. Do not set `needs_steps`. A wave replacing an earlier single proposal names it in step 1's `supersedes_proposal_ids`. Keep each step small enough to judge in one preview; do not split edits that only make sense together. A graphic and its own sound effects are one step: split by decisions the creator makes, not by media type.
8. If the proposal contract cannot express the edit, extend the contract and its review UI first. Never bypass it.
9. **An approved card is done.** Before previewing, verifying or revising a card, read its status with `proposal_list` (or `proposal_get`). If the creator approved it, stop: do not preview, frame-check or re-review it. Build the next change on the applied timeline, patching what the card created rather than adding a second copy.

## Preserve tuning and validate combined review

Before revising a pending draft, read `proposal_get`: `tuning` contains saved review
adjustments and `tuned_baseline` contains their effective proposal. Start from that
baseline and change only requested behavior. Retain stable actor identities where
possible. Do not copy overrides by operation index into a reordered/rebuilt draft;
map the effective values by actor/control meaning and account for intentional changes.
A shorter source hold can limit an unchanged transition duration: verify effective
motion after pacing changes. Authored controls are not proof of identical output.

For independently selectable drafts intended to work together, call
`proposal_preview` with the complete `selections` in review order before handoff.
Omitted overrides use saved tuning; explicit `overrides: []` uses authored defaults.
Check the combined result, not only individual preflight success. Scope preserved
fields to actual invariants; conflicting preservation is a draft-design error, never
a reason to bypass protections. Human approval remains separate.

## Track proposal work

Use `proposal_work_record` to start a private attempt when handling an editing
request. Mark substantive preparation, composition, validation, engineering and
verification spans with begin/end, including failed or reused work. Record saved
with the new proposal ID, then handoff after verification. Use a new attempt for
each revision. These timestamps start at capture, not the original user message;
keep missing phases and token cost unknown. Evidence stays out of the app UI.
The MCP server times `motion_graphic_prepare` and `proposal_create` itself, as its
own attempt per project (events marked `recorded_by: server`); that covers tool
latency only, so still mark your preparation, composition and verification spans.

## Change only what the request needs

Make the smallest editorial change that accomplishes the user's request. Preserve
everything outside that scope by default. A request to change hue, motion, or beat
alignment does not also authorize changing layer count, shape, thickness, spacing,
placement, source poses, visibility, or unrelated timing. Necessary supporting
changes are allowed; explain their direct connection to the requested result.

Pin the baseline the user means before constructing the proposal: the working cut,
a named option, or a referenced state. Reuse its assets and parameters where possible.
For a correction, retain previously accepted choices and change only the corrected
behavior. Do not treat rejection of one detail as permission to redesign the effect.
Clarify only when competing interpretations would materially change the result.

Before staging, compare the draft with that baseline. Every changed property or
operation must serve an explicit request or a necessary dependency; remove
unrequested embellishments and cleanup. Verify both the requested difference and
the preserved features. For a temporary excursion and return, check the returned
state against the original geometry and placement, not just the general look.
Broader exploration belongs in a separately requested audition.

To replace the people in a clip already on the timeline, generate the recast first
(Generate's recast models, window chosen around the clip; see [video-recast](../video-recast/SKILL.md)),
have the creator keep it, then propose `use_recast` with the window's start on the
original footage clock. Timing and look stay; the card shows the new people.

## Choose controls from editing intent

New options have a 15-slider limit; follow the shared control standard for splitting
larger edits without losing dependent operations or required controls.

Every proposed option needs a control plan before staging. Start with the user's
requested adjustment, identify its actor and the choices they would reasonably
want to tune, then select enough working controls to cover those choices on the first proposal. Do this
without waiting for another request for dials. A single timing dial does not make
a layout proposal adjustable.

| Editing intent | Primary controls to consider |
| --- | --- |
| Size or placement | Size, horizontal position, vertical position; Side and Gap for a placed label |
| Handwriting or entrance | Drawing/entrance duration; exit duration when relevant |
| Color or treatment | Applicable color, amount, opacity; blend only when relevant |
| Audio placement | Level, relevant fades; source timing only when requested |
| Pace | Playback speed or the supported effect duration |

These are candidates, not a requirement to expose every field. Keep accepted
choices fixed unless tuning them belongs to the requested edit. Include each
chosen supported numeric field explicitly in the operation, using its current
value when it is a tunable neighbor rather than a requested change. This expands
the declared adjustment scope, so explain that connection. Never introduce an
unrelated visual change merely to get another slider.

Read the preflight response’s per-element `control_inventory`: it distinguishes configured values from actual changes and reports the available dial metadata and current selection. For a newly placed actor, normally select X, Y and size together. Favor relevant control coverage: put explicit and likely adjustments first, followed by useful secondary controls. Follow the [proposal control standard](../../../docs/standards/inspector-information-architecture.md#proposal-control-selection).

Set `options[].review_controls` to ordered references of the form
`{operation_index, target, field}`. For a newly created label placed by relation, use
`create_text.fontSizePx`, `create_text.place_side`, `create_text.place_gap`, followed by
`create_text.animationInDuration` if its entrance is relevant. The server validates
that references uniquely identify supported fields already in that option; labels,
units and ranges come from the shared control registry. The plan selects controls;
it cannot rename what approval writes or add mutations. A new draft without a plan
gets the server default: every supported field the option changes, as its own main
dial in operation order, recorded as `review_controls_origin: "server"`. Send a plan
when the request calls for a different selection or order, or a linked group. Stored
proposals without a plan keep the supported-field fallback. Source URLs and
fingerprints stay in the audit record.

Control selection is an agent judgment grounded in the request, not automatic
keyword detection; [proposal-dial-selection](../proposal-dial-selection/SKILL.md) owns
that judgment for clip fields and motion-graphic controls (`motion_main_controls`). Review the selected controls against the edit before saving:
can the creator actually change the requested outcome? Avoid exposing each child's
position when the user wants to move a whole group. If a coherent group control or
a requested capability is unavailable, extend the contract and UI or report the
specific gap; do not pretend independent sliders are a group transform.

Before staging, map explicit and inferred tuning needs to controls and useful ranges; identify any missing capability. The goal is that the creator can reach the intended result from the first proposal without another request for dials. Follow the standard’s main/advanced design and its current ordered-list fallback; do not emit unsupported tier fields.

Use compact rows: familiar label, slider, exact value with units, and reset. Avoid
duplicate setup fields and nested control cards. Keep controls directly accessible;
put technical detail in the existing details disclosure. Follow the
[inspector row standard](../../../docs/standards/inspector-information-architecture.md#row-anatomy-and-alignment).

`proposal_create` drags every numeric dial to both ends of the slider the card draws
and builds the preview there (`dial_sweep`, main dials first, within a time limit). A
dial that breaks the preview at either end comes back as a warning: fix the operation
(or drop that dial) and stage a replacement before presenting the card, so the creator
never hits an error while tuning. A main dial whose two slider ends look and sound
the same in the preview (for example a camera length that only holds the last view
longer) refuses the card with `dead_dials`: make the dial drive the visible result or
drop it from `review_controls`.

Verify the key controls in the actual proposal: changing them updates the paused
preview without replay, reset restores the draft, and preview and human approval
use the same overridden option. Never self-approve to test. If a requested control
is missing, extend the contract and UI before calling the result tunable.

## Keep motion graphics native and editable

When reusing an existing composition's artwork, follow `../../../docs/standards/reusable-artwork.md`.
Pin the exact reference composition and asset version; reuse its saved appearance assets before
reconstructing anything. Verify pack/source fingerprints before import and imported hashes after
import. A saved object may include its intentional white outline or shadow; scene layout and motion
remain instance properties. Asset equality alone is not scene parity: verify geometry, layer order,
and representative motion frames before claiming a faithful port. The standard distinguishes the
available capture verifier from future proposal/export enforcement; do not claim the latter exists.

When DreamCut is the destination editor, it owns scene layout, timing, layering, and keyframes. Import each semantic visual object (portrait, logo, icon, label, background, beam, card, or prop) as its own source and propose it as its own timeline element. Do not import a full-scene HyperFrames, Remotion, or other rendered composite merely because its source project remains editable elsewhere; inside DreamCut that render is still one baked clip and forces every adjustment back through the external renderer. Exception while the model-authored motion experiment runs: a self-contained motion piece such as a logo sting may be one composition (see the motion-graphics skill).

Compose repeated graphics from the smallest meaningful reusable source. Create one person icon, logo, card, or other primitive, then place repeated instances as separate timeline elements with their own position, timing, animation, and lane. Do not generate a joined still containing several copies when the copies may need independent entrances, ordering, spacing, or later adjustment. A composite is appropriate only when its parts are intentionally inseparable as one editorial object; convenience or faster initial assembly is not enough.

Use an external motion renderer only for a visual behavior DreamCut cannot faithfully express, such as procedural particle fields, complex path morphing, 3D/camera scenes, or shader-like effects. Return the smallest isolated transparent element or short effect pass that preserves native control of the rest of the scene. Before using an external renderer, identify the missing native capability; if ordinary transform, opacity, crop, mask, entrance preset, or timeline keyframes can express the motion, keep it in DreamCut.

For an internal pause or unwanted phrase, resolve complete word boundaries from forced alignment or VAD, preserve a natural breath when appropriate, and use `source_range_cut` with absolute source seconds. This operation removes the interval from the target clip. Set `ripple_lane_keys` explicitly to the target visual lane and its speech-caption lane when tightening narration while preserving cutaways. Only named lanes are retimed or cut; the target lane must be included. Omitting the field retains the legacy all-lanes ripple, so use that only when the request calls for every layer to move together. Use stable unique IDs for the removed segment and inserted right-hand segment.

Treat every talking-head derivative as another view of the audible source clock, not as independent B-roll. Use `sync_speech_visual` to bind a cutout's absolute source window and source hash to its active speech element; the operation derives timeline placement, trim, duration, and playback rate atomically. Once bound, ordinary patches may change layout or layering but must not alter timing fields. Captions independently bind to the same speech element and source-word clock through `replace_captions`.

The timeline is an edit decision, not a pre-cut media export. Put the complete available source-backed clip on the timeline and express the chosen visible window with `trim_start` and `trim_end`. Preserve unused head and tail media so the editor can reveal it by dragging either edge. Never manufacture a new file whose boundaries merely duplicate an ordinary timeline trim.

When a visual treatment genuinely requires derived pixels, such as a tracked transparent cutout, create the derivative across the complete practical handled source interval, retain its mapping to the unchanged original source clock, put that handled derivative on the timeline, and trim it there. A left-edge trim reveals earlier source and a right-edge trim reveals later source; moving a speech-bound view chooses the matching source interval on the bound speech clock. Never simulate an earlier entrance by sliding a fixed derivative against its audio.

When a step needs editor code that the stable editor on 3123 does not serve yet, do not
wait for the rebuild. The MCP tools stay on 3123, so send only that step to the dev editor on 3129
(already running from another session in this checkout is fine; it serves the same code): POST the
route the tool's handler in `mcp/server.mjs` names, with the body you would have given the tool, and
call `capability_gap_report` once for it. Go back to the MCP tools for every other call.

After creation, report that the proposal is ready to preview, with the project linked as `[<project title>](http://127.0.0.1:3123/p/<project_id>)`; do not imply that the edit has already been applied.
