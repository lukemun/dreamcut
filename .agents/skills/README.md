# Repository skills

Canonical, versioned skills for every coding agent working on DreamCut. The [agent knowledge architecture](../../docs/agent-knowledge-architecture.md) explains why skills are task procedures rather than the home for every kind of instruction. Read [AGENTS.md](../../AGENTS.md) and the [standards index](../../docs/standards/README.md) first. Agents without automatic skill discovery can select a skill here and read its SKILL.md directly. New sessions may be needed for tools that cache skill catalogs. Subjective named looks belong in the separate [style recipe catalog](../style-recipes/README.md); personal choices about when to use them remain in My Style.

For code quality, use **code-review** for standalone inspection and **pr-review** for the complete PR workflow, which requires code-review. For slow playback, polls or renders, use **performance-review**. Maintain procedures in these canonical folders; do not fork per-agent copies. Add new skills to this index when creating them.

Each skill folder contains `SKILL.md` (the current procedure) and `evolution.md`
(its Purpose and learning history). Optional references and helpers stay in that folder.
Shared requirements live in [standards](../../docs/standards/README.md). See the
[contributor layout](../../docs/agent-knowledge-architecture.md#contributor-file-layout)
for how the pieces fit together.

| Skill | Purpose |
| --- | --- |
| [chatgpt-local-trial](chatgpt-local-trial/SKILL.md) | Restricted desktop test: local viewing and explicit numeric proposals; no media returned to ChatGPT. |
| [editor-ui-design](editor-ui-design/SKILL.md) | UX audits and editor UI changes, including creator-facing documentation; includes an independent nontechnical creator judge, shared controls, visual evidence and regression checks. |
| [device-format-coverage](device-format-coverage/SKILL.md) | Check a media change against phone and camera footage classes (iPhone/Pixel HLG, Samsung PQ, SDR variants, VFR, rotation, stills) using synthetic fixtures, and record evidenced coverage per platform. |
| [releasing](releasing/SKILL.md) | Get a version ready and, on the owner's word, ship it: routes to install-check, windows-compatibility, release-build and release-publish in order, with the authority gates between them. |
| [install-check](install-check/SKILL.md) | Check that a new creator's install from dreamcut.io sets up every program and model the features need, with truthful doctor reports and failures that name working commands; reduced-PATH and fresh-cache runs. |
| [release-build](release-build/SKILL.md) | Build and verify every download with `pnpm release --dry-run`, publishing nothing, and read the log against the release checklist. |
| [release-publish](release-publish/SKILL.md) | Publish a version to dreamcut.io, GitHub and npm only on the owner's explicit go-ahead, then run the after-release checks. |
| [windows-compatibility](windows-compatibility/SKILL.md) | Build the Windows editor download in a Windows VM driven from a Mac over SSH, run the first-run check, and use the editor in Windows Chrome through to an export, before a release or after packaging, launcher, server-startup, native-dependency, path, media-preparation or export changes. |
| [skill-authoring](skill-authoring/SKILL.md) | Author and validate portable repository-owned skills, with appropriate scope, execution references, and evolution records. |
| [prompt-authoring](prompt-authoring/SKILL.md) | Write grounded agent instructions and image/video generation direction with explicit inputs and acceptance criteria. |
| [generated-asset-workflow](generated-asset-workflow/SKILL.md) | Turn creator feedback into an accepted generated asset through visible staging, efficient revision, inspection and quality promotion. |
| [video-reference-analysis](video-reference-analysis/SKILL.md) | Decompose a full video reference into its sequence, pacing, typography, sound and reusable effect occurrences. |
| [recreate-effect](recreate-effect/SKILL.md) | Analyze a finished effect or tutorial, choose existing composition or an editor extension, and deliver a reusable capability with creator controls and verification. |
| [effect-authoring](effect-authoring/SKILL.md) | Package an effect that already works in a creator's edit into a reusable Templates card (Yours or shared) with its whole workflow, scoped to what the creator names. |
| [reference-match-review](reference-match-review/SKILL.md) | Compare a proposed reference-driven edit with the original motion, timing, and subject-relative geometry before handoff. |
| [advice-review](advice-review/SKILL.md) | Browse saved advice, prepare a focused pre-filming checklist, and check actual application against script or cut evidence. |
| [audio-balance](audio-balance/SKILL.md) | Diagnose and improve dialogue, music, ambience, fades, loudness, and voice clarity in a DreamCut timeline. |
| [beat-aligned-cuts](beat-aligned-cuts/SKILL.md) | Align cuts, sprite poses, and coordinated graphic changes to chosen musical hits, including drop jumps followed by consecutive-frame runs. |
| [caption-craft](caption-craft/SKILL.md) | Create or refine accurate, readable, timed captions for a DreamCut video. |
| [code-review](code-review/SKILL.md) | Review repository changes for concrete defects using native Codex review and the shared DreamCut rubric. Use standalone or as the required review step within pr-review. |
| [performance-review](performance-review/SKILL.md) | Review architecture, time/space complexity and I/O across the codebase or a slow path, with coverage and before/after measurements. |
| [session-retro](session-retro/SKILL.md) | Retro a coding-agent session from its transcript: skills, mistakes, MCP refusals, editor bugs, missing dials, performance and agent overhead, then making the ranked fixes the freeze allows and recording the rest as later work. |
| [cut-pacing](cut-pacing/SKILL.md) | Refine pacing in a DreamCut edit by removing pauses, filler, false starts, repetition, or weak beats while preserving natural speech and continuity. |
| [editor-media-preprocessing](editor-media-preprocessing/SKILL.md) | Prepare proxies and reversible derived media such as stabilized video or enhanced voice for DreamCut editing. |
| [editorial-assembly](editorial-assembly/SKILL.md) | Direct an end-to-end DreamCut assembly from script, talking-head media, visual direction, and delivery target through one coherent previewable edit. |
| [editorial-intent-planning](editorial-intent-planning/SKILL.md) | Decompose multi-command, multi-mark, or first-assembly requests into auditable editorial tasks before proposal or construction. |
| [working-through-requests](working-through-requests/SKILL.md) | The default routine for several requested changes: record each ask under Up next, draft one to three cards per pass, and draft the next pass after the creator settles the last. |
| [media-pull](media-pull/SKILL.md) | Find, import, register, and place supporting images, video, audio, or graphics in a DreamCut project. |
| [media-annotation](media-annotation/SKILL.md) | Build source-linked visual catalogs for photo or video collections before an edit exists. |
| [media-intake](media-intake/SKILL.md) | Route supplied or existing footage by purpose: import, technical readiness, visual sampling, annotations and edit-specific review. |
| [layered-paper-cutout](layered-paper-cutout/SKILL.md) | Build and verify editable concentric paper silhouettes with constant-distance geometry, source preservation, overscan, and separate layers. |
| [music-audition](music-audition/SKILL.md) | Find cataloged music passages and prepare playable comparisons for a video, scene, mood, or narrative turn. Use when choosing music or auditioning alternative cues; catalog building without a current edit is a separate preparation step. |
| [music-catalog-ingestion](music-catalog-ingestion/SKILL.md) | Import and reconcile full music recordings, reviewed cue annotations, rights provenance, and reusable catalog metadata. |
| [music-direction](music-direction/SKILL.md) | Select, shape, and mix music for a DreamCut video based on narrative role, pace, and platform. |
| [explainer-visuals](explainer-visuals/SKILL.md) | Plan and build graphics that complement speech (data, names, scale, comparisons), beat by beat from the transcript, with sourced figures and timing on the words. |
| [motion-graphics](motion-graphics/SKILL.md) | Route motion graphics requests to timeline-native semantic motion, Hyperframes animation overlays, or both, with proposal review and pixel verification. |
| [sketch-drawing](sketch-drawing/SKILL.md) | Draw a hand-drawn sketch that draws itself on, beat by beat, as separate editable native pieces. |
| [split-into-pieces](split-into-pieces/SKILL.md) | Lay a graphic out as separate timeline pieces the creator can tune one by one, keeping playback the same. |
| [dreamcut-proposals](dreamcut-proposals/SKILL.md) | Safely inspect and edit an existing DreamCut video timeline through previewable proposals. Use for any conversational timeline edit, including edits described by a review mark, exact dictates, trims, cuts, captions, audio, media, layout, effects, or output format. |
| [color-grading](color-grading/SKILL.md) | Correct or restyle a clip's colour with exposure, white balance, wheels, curves and colour slice, staged as a tunable proposal. |
| [proposal-dial-selection](proposal-dial-selection/SKILL.md) | Choose which dials a proposal card shows up front and which wait in Advanced adjustments, for clip fields and motion-graphic controls alike. |
| [phone-edit-workshop](phone-edit-workshop/SKILL.md) | Build or revise a phone-first vertical social edit in DreamCut using marks and conversational review. |
| [planned-shot-craft](planned-shot-craft/SKILL.md) | Plan and place supporting shots, B-roll, stills, inserts, and cutaways in a DreamCut narrative edit. |
| [platform-video-delivery](platform-video-delivery/SKILL.md) | Prepare and quality-check a DreamCut video for a requested social or presentation delivery format. |
| [pr-review](pr-review/SKILL.md) | Review a PR or pending repository changes, grade readiness from evidence, fix confirmed issues when authorized, and rerun relevant checks before publishing. |
| [product-walkthrough](product-walkthrough/SKILL.md) | Edit a clear software or product walkthrough in DreamCut with readable screen action and explanatory pacing. |
| [dreamcut-rendering](dreamcut-rendering/SKILL.md) | Repository-owned guidance for the preview/render integration. Install upstream Remotion skills separately from their publisher. |
| [research-deliverable](research-deliverable/SKILL.md) | Produce a research deliverable that is pure evidence — every factual claim inline-linked to a primary source, no synthesis, spin, or product/marketing interpretation. Use whenever asked to research a topic and record findings, write a research doc, gather and cite evidence, build a sourced findings or source-map doc, or "find out what's true" about something external (a market, competitor, craft, definition, prices, specs). Covers the three-layer model (raw verbatim captures, then a pure-evidence deliverable in docs/research/, then a separate opinionated application doc that cites it), the sourcing rules (cite every claim, primary over secondary, quote don't paraphrase, no unsourced claims), a reproducible method/caveats section, and keeping our interpretation OUT of the evidence layer. Complements the deep-research skill (deep-research gathers; this records). NOT for the opinionated application/wiki doc itself, ad copy, or customer/persona research (use client-niche-research). |
| [scratchpad-treatment](scratchpad-treatment/SKILL.md) | Apply and audit a continuous, evenly inset white Scratchpad perimeter on cards, graphics, logos, and cutout actors. |
| [sound-design](sound-design/SKILL.md) | Select, time, layer, mix, and propose sound effects that follow what is on screen (measured activity curves, verified alignment) for entrances, drawing, camera moves, motion, reactions, impacts, and visual payoffs in a DreamCut edit. |
| [spatial-composition](spatial-composition/SKILL.md) | Arrange and verify multiple visual actors as one composition, including hierarchy, alignment, spacing, safe areas, layer order, and intentional overlap. |
| [storyboard-drafting](storyboard-drafting/SKILL.md) | Break supplied footage into a reviewable storyboard of named beats and shots from the creator's direction, with notes, on-screen text and transitions. |
| [video-recast](video-recast/SKILL.md) | Recreate a reference video with other people, shot for shot, planned on the Follow-reference storyboard; the creator generates and chooses takes. |
| [talking-video-editing](talking-video-editing/SKILL.md) | Edit a presenter, interview, vlog, or direct-to-camera video in DreamCut, coordinating pacing, captions, supporting visuals, audio, and delivery. |
| [tutorial-screen-recording](tutorial-screen-recording/SKILL.md) | Record DreamCut's own interface as a screen take and cut it into a narrated tutorial, such as a talking head with the screen in a split. |
| [rotoscope](rotoscope/SKILL.md) | Prepare and correct moving person/object masks with source timing, occlusion handling, and matte verification. |
| [talking-head-cutout](talking-head-cutout/SKILL.md) | Create, refine, and audit source-synchronized presenter cutouts, with explicit hair, silhouette, and per-second matte QA. |
| [timeline-auditions](timeline-auditions/SKILL.md) | Cut and show multiple playable DreamCut versions for comparison without changing the working timeline. Use when the user asks to compare takes, audition options, try alternate openings, explore different cuts, or "show me a few versions. |
| [mask-glitch](mask-glitch/SKILL.md) | Create continuous incoming-subject mask handoffs or consecutive chains as one coordinated editable sequence; includes the legacy batched-pop variant. |
| [pop-in-white-flash](pop-in-white-flash/SKILL.md) | Compatibility name routing to the legacy batched-pop variant in Mask Glitch. |
| [speed-entrance-exit](speed-entrance-exit/SKILL.md) | Build Speed Entrance & Exit: a cut-out keyframed out of frame, into frame or between marked stops with blur over a still empty set, never footage played faster. |
| [video-letters](video-letters/SKILL.md) | Build Video Letters: a big, thick native title with a project video playing only inside its letters. |
| [video-compositing](video-compositing/SKILL.md) | Compose layered video, images, overlays, masks, keys, crops, and effects in a DreamCut timeline. |
| [surface-text-tracking](surface-text-tracking/SKILL.md) | Attach editable text to moving flat surfaces; diagnose tracking, visibility, source-clock and playback drift. |
| [screen-replacement](screen-replacement/SKILL.md) | Put pictures, videos or cut-out people onto a real screen in footage, in perspective with the screen's edge showing. |
| [video-typography](video-typography/SKILL.md) | Design readable titles, labels, callouts, and on-screen text for a DreamCut video. |
| [visual-timing](visual-timing/SKILL.md) | Time supporting visuals, graphic actors, and on-screen text to spoken beats, including coordinated entrances, holds, replacements, and exits. |
| [voice-file](voice-file/SKILL.md) | Prepare, enhance, align, or replace recorded voice media used by a DreamCut project. |
