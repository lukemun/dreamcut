---
name: editorial-assembly
description: Direct an end-to-end DreamCut assembly from script or transcript, talking-head source media, visual directions, and delivery target through one coherent previewable edit. Use for a new video project or major rebuild; use narrower editing skills for isolated changes to an existing cut.
---

# Editorial assembly

This is the parent workflow; load the specialist skill named at each stage only when that stage applies. Read `../editorial-intent-planning/SKILL.md` to interpret the intake and persist its task and beat decomposition. Read `../open-edit-proposals/SKILL.md` before changing an existing or human-edited timeline. The design rationale and artifact definitions are in [`../../../docs/wiki/editorial-assembly-harness.md`](../../../docs/wiki/editorial-assembly-harness.md).

Keep one editor responsible for the integrated result. Do not let cuts, captions, assets, timing, layout, or audio become independent mini-projects with incompatible clocks or scene assumptions.

## Choose the assembly authority

Select the route before importing or placing media:

- **New first assembly:** use `assembly_create` to create a fresh target project from the script, source inventory, directions, and delivery format. It refuses overwrite and creates an `agent_workspace`. Import sources and use the direct timeline tools to build and revise the complete timeline autonomously. Do not create intermediate proposals inside that workspace.
- **Continuing an untouched agent workspace:** read its assembly brief with `assembly_get`, then continue direct construction while the workspace grant remains active.
- **Existing or human-edited timeline:** read `../open-edit-proposals/SKILL.md` and prepare one integrated proposal. Never attempt to restore or manufacture the workspace grant.
- **Major rebuild of an existing edit:** create a separately named assembly workspace and preserve the working cut. Do not overwrite it.

The first layout handoff or human timeline edit permanently closes direct agent mutation. From that point onward, every agent change uses proposals. Creating a fresh workspace grants assembly authority, not permission to render, export, publish, approve proposals, or overwrite another project.

## 1. Establish the brief and authorities

Record the supplied script or reviewed transcript, source media, visual directions, reference edit or style, target platform and aspect ratio, and explicit exclusions. Distinguish requirements from suggestions. List unresolved inputs without blocking work that can proceed safely.

After `assembly_create` establishes the project and immutable brief, use `editorial-intent-planning` to split the intake into narrative and production atoms, group them into coherent beats or work units, and persist the interpretation plan before detailed timeline construction. Link its tasks to the later beat map and scene states. Preserve user corrections as revisions rather than replacing the earlier interpretation without a trace.

Use `media-intake` as the entry point for supplied files, after establishing the workspace. It routes import, preparation, annotations, and per-file readiness to the appropriate specialists. Use `media-pull` for asset search and provenance. Use `editor-media-preprocessing` only for real signal or pixel transformations, never as a substitute for timeline trims. Preserve originals and source handles.

### Required media-preparation handoff

Before placing any video, run `editor-media-preprocessing` and consume its ready media package under the [preview proxy contract](../../../docs/standards/preview-proxy-contract.md). Require the verified preview, full-quality render authority, mapped audio authority when present, and preparation receipt. This gate applies to the initial speech spine and audition candidates as well as supporting footage. Import completion or an analysis job marked complete is not sufficient.

Assembly owns editorial source windows and linked timing; preparation owns decoding formats and derivative files. Do not generate a separate proxy for each ordinary trim. When a requested effect changes pixels, return to preparation for its full-quality/preview pair before adopting the effect. Research, script planning, and asset collection may continue while preparation runs.

## 2. Build the speech spine

Inspect all takes and establish the audible source authority before decorative work. Use `timeline-auditions` when the user needs to compare takes. Use `cut-pacing` for repetitions, false starts, pauses, and cadence; inter-take speech boundaries require the repository's forced-alignment gate.

Apply voice cleanup and mix decisions through `audio-balance`. Keep enhanced voice reversible and synchronized to the selected speech clock.

Do not begin detailed visual placement against a provisional speech edit. If a boundary remains provisional, label every downstream timing decision provisional too.

### Presenter-first standard and review gate

For presenter-led edits, use this order before assembling supporting visuals:

1. Import unchanged originals, whether individual takes or one recording containing retries, and complete the media-preparation handoff before placement. Select passages with reversible source windows against the prepared source package; do not export a separate file for each ordinary cut.
2. Finish the speech edit: choose takes, remove fumbles and unwanted repetitions, and verify complete words and natural cadence at every join using the required forced-alignment workflow. Preserve source handles.
3. Establish one authoritative presenter edit map. Each selected passage identifies its original source and hash, absolute source interval, timeline placement, and playback rate. Picture, audible voice, and captions must resolve through that same mapping.
4. Prepare requested appearance effects, including cutout and Scratchpad, as replaceable derivatives of those passages. Processing chunks are implementation details, not independent editorial clips or new timing authorities. Preserve practical source handles and exact source-clock mappings; never flatten the edit merely to make it look like one source.
5. Generate source-bound captions from the reviewed, force-aligned speech. Detach audio only when useful for cleanup or mixing: it remains linked, and exactly one voice path may be audible. Silence both embedded scalar gain and any gain envelope when a detached voice replaces it. Never fix drifting picture by nudging captions away from the speech.
6. Present one logical presenter track to the reviewer. When two or more active presenter sections belong to the same speech spine, compound them by default after their timing and accepted appearance are stable. Preserve the individual source-bound sections underneath; compounding is presentation and preview organization, never permission to flatten the edit map.
7. Review the presenter alone on a neutral background, first picture plus voice, then with captions. Supporting visuals, music, and effects stay absent or reversibly muted through the permitted edit route. Review at normal speed, across every speech edit and processing-chunk boundary, and after seeking, pausing/resuming, and replaying. Verify no missing/duplicated words, natural joins, mouth/voice sync, caption timing, and the complete requested cutout treatment. Correct source bindings or matching still frames alone do not prove playback sync.

Record the gate in `analysis/presenter-foundation.json`: reviewed timeline revision (or proposal/option and expected revision), source/edit-map and alignment references, derivative receipts, audible voice authority, tested playback ranges/actions, timestamped defects, checks with pass/fail/pending status, and the user's acceptance. Do not advance into supporting-visual assembly until checks pass and the user accepts this foundation. Asset research and collection may proceed without placing or timing those assets. User-directed exceptions remain explicit and provisional. A later speech-clock, audio-authority, or presenter-derivative change reopens the affected checks and the gate.

### Default presenter compound

The user-facing default is one presenter compound with linked picture, voice, captions, and shared appearance controls, even when multiple physical media sections back it.

- Normalize eligible sections to the accepted presenter framing before compounding unless a beat intentionally calls for a different scale or position. A casual adjustment to the first section should normally become the shared compound framing, not an accidental one-section jump.
- Keep every member's source window, speech binding, playback rate, and derivative provenance intact. Voice and captions remain independent and source-bound; export continues to use the original full-quality sections.
- In a fresh `agent_workspace`, create the UI compound through the permitted direct workspace mutation path once the presenter foundation is stable. Give it a meaningful label such as `Presenter`, not a generic processing-chunk name.
- On an existing or human-edited timeline, make the grouping and any framing normalization part of the same proposal option. When that option leaves 2–32 adjacent silent alpha presenter sections with identical static appearance, constant positive speed, and no transitions or per-section animations, call `compound_prepare` with the proposal and option ids. This attaches the verified continuous 30 fps alpha preview without changing render authority or creating another proposal.
- If intentional section-level appearance differences make a seamless preview ineligible, keep those differences and create only the reversible UI compound. State that playback still uses the member clips; do not describe it as a seamless preview.
- Verify that the timeline presents one container, shared framing edits reach every member, playback crosses each hidden boundary cleanly, and **Break apart compound clip** restores the sections. A timing, source, appearance, or membership change invalidates the continuous preview; prepare it again before handoff.

Do not include unrelated cutaways, captions, voice clips, or secondary character/graphic actors in the presenter compound. If the supported compound contracts cannot preserve the shared mapping atomically, stop before adoption and extend the contract rather than baking away editability or manually maintaining independent clocks.

## 3. Translate narration into a visual plan

Use `visual-timing` to create a beat map from exact spoken anchors. Every visual needs a narrative job, entrance, hold, exit or replacement, and persistence decision.

Use `planned-shot-craft` for cutaways and supporting media. Build an asset manifest with four states: available, imported, generated, or missing. Do not place assets merely because they exist.

Classify visible text before assembly:

- literal speech, quotations, claims, statistics, and paragraph builds are native caption or typography elements;
- labels and editorial callouts use `video-typography`;
- imagery remains a visual asset.

When the user names a prior edit as the style reference, inspect its actual text, spacing, timing, and animation properties. “Similar” is not permission to approximate from memory.

## 4. Design complete scene states

Use `spatial-composition` whenever multiple foreground actors coexist, and `video-compositing` for masks, keys, crops, and effect mechanics.

For every entrance, exit, replacement, or major motion change, record the complete active actor set, primary focal actor, supporting actors, text region, protected regions, and layer order. Give repeated actors a shared alignment, spacing, and scale rule. Treat overlap as intentional or unresolved, never accidental.

Keep semantic actors as separately editable elements. Put the timing and transforms for one coordinated scene in the same proposal option so the combined result is reviewable.

### Keep related visual lanes together

Treat the timeline's visual-lane order as part of the edit's information architecture, not only as a compositing stack. Every coordinated visual idea must occupy one contiguous lane block whenever its actors can do so without changing the intended composite. Order that block top-first as:

1. primary or hero actor;
2. supporting actors in their intended front-to-back order;
3. paired controls, frames, phones, or other context actors; and
4. the scene plate or background.

Do not interleave unrelated visual lanes inside that block. Paired actors such as a person and the phone they are watching must remain adjacent even when their clips do not overlap in time. When adding to or revising a scene, preserve the relative order of unrelated lanes and move the scene's lanes as one stable block. If adjacency would conflict with the required front/back composite, preserve the composite and record that exception in the scene-state plan.

## 5. Build the integrated assembly

When music is requested, use `music-direction` to map the accepted narration into
musical sections before selecting tracks, then `music-audition` to compare cue
directions against the assembled picture. Music sections follow narrative turns,
not individual shots. Preserve quiet beats and existing SFX, record user choices,
and review the chosen cues together at section seams before calling the score
assembled. Research may happen earlier; music placement follows the presenter gate.

In a live `agent_workspace`, use direct semantic timeline tools to build the dialogue spine, synchronized captions or text, supporting visuals, scene timing, layout, and audio as one coherent edit. Iterate in place and preserve source handles, history, and the shared speech clock. The absence of proposals during this phase is intentional: there is no earlier human cut to protect.

On an existing or human-edited timeline, use `proposal_create` for every mutation. The recommended option must integrate the dialogue spine, synchronized captions or text, supporting visuals, scene timing, layout, and audio decisions that depend on one another. Use alternatives only for genuinely different editorial directions.

Do not split one scene into independently approvable asset proposals. Do not imply that preparation changed the working timeline. Never approve or reject for the user.

## 6. Verify the edit at the right level

Preview the full option at normal speed, then inspect every speech cut, visual boundary, paragraph-build state, and multi-actor overlap. Use `spatial_assess` for supported caption-versus-detected-subject evidence and preserve every limitation or unknown. An empty or not-applicable assessment does not clear asset-to-asset layout.

For a workspace assembly, use `frame-state` at every new or changed scene state before handoff. For a proposal assembly, run the same check after approval makes the proposal current. Use `caption-craft` for source-bound caption accuracy and `platform-video-delivery` for the final canvas, safe-area, continuity, and output checks.

The assembly is not ready for review when any of these remains true:

- a video was placed without a ready media package, or an adopted pixel derivative lacks its matching preview;

- a presenter-led assembly has advanced beyond an unaccepted presenter-foundation gate;
- the speech spine or a cut boundary is provisional but presented as final;
- a visual lacks a spoken owner or narrative job;
- old actors linger into a new beat without an explicit continuity decision;
- paragraph text is baked into image cards;
- a coordinated scene is distributed across separate proposals;
- related scene actors are scattered across non-adjacent visual lanes without a documented compositing reason;
- layout was judged from element coordinates without combined playback or rendered states;
- spatial unknowns are reported as clear; or
- delivery was rendered without a separate user request.

## 7. Hand off to the reviewer

For a workspace assembly, report the review URL, major creative decisions, unresolved gaps, and what the user should watch or listen for. Before presenting the first layout, call `assembly_handoff` and verify `proposal_required`. This closes the grant permanently; all later corrections and additional layers use proposals, even if the human has not edited. Opening an unfinished project alone does not revoke the grant. For an existing-timeline proposal, report the recommended option instead. Human proposal approval, rejection, and delivery remain separate actions.
