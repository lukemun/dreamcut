# Model-authored motion graphics and sound — proposed design

Status: experimental, 2026-10-10. **Slice 1 implemented** (see [implementation status](#implementation-status));
everything else here is proposed. External evidence is in
[how motion graphics made with Claude are produced](../research/2026-10-10-claude-motion-graphics-pipelines.md).
Current behavior is described in the [renderer contract](../standards/renderer-contract.md),
[playback architecture](playback-rendering.md) and [proposals](proposals.md).

## Goal

A model should author motion graphics and their sounds in the medium it is already good
at: code. A person should be able to place, trim, layer and grade the result on the
timeline, and tune whatever the model chose to expose, without the model or source code
and with ordinary approval and undo.

Two failure modes bound the design:

- **Getting in the model's way:** forcing it to express motion as DreamCut keyframe JSON,
  or forcing it to wire controls into everything, when that makes the motion worse. The
  widely shared Claude work is code rendered to frames by a headless browser and FFmpeg
  ([F07, F13, F16](../research/2026-10-10-claude-motion-graphics-pipelines.md#code-to-video-frameworks)),
  and Anthropic's Claude Motion builds animations as code with no video model
  ([F01](../research/2026-10-10-claude-motion-graphics-pipelines.md#anthropics-own-products)).
- **Getting in the editor's way:** an opaque clip whose every change needs the model.

## One separable object per composition — decided 2026-10-22

The creator rejected graphics that drew a logo, its name and a tagline (or two lines and a
stamp) as one clip, because none of them could be edited on its own. This replaces points 1
and 2 below for composition scope: every separable object is its own timeline element,
native for logos, titles, words and labels, and a composition draws one object that native
elements cannot animate. New or changed source must declare that object and its
`native_gap`; the check refuses a rendered frame that shows more than one object
([composition-objects.ts](../../src/lib/hyperframes/composition-objects.ts),
[probe](../../scripts/composition-object-probe.ts)). Controls inside that one composition
remain the model's choice. Packaged Templates are a recorded gap until they are split.

## Experiment stance

We do not yet know how much editability costs in motion quality. This design therefore:

1. **Lets the model choose.** For each piece it may use native DreamCut elements, a code
   composition, or both. Inside a composition it may declare controls, tag actors, mark
   holds, or none of these. Nothing is rejected for being uncontrolled.
2. **Gates correctness, not coverage.** Validation rejects only what is broken or unsafe:
   a malformed manifest, a declared control the composition ignores, nondeterministic or
   network-dependent rendering. It never requires a minimum number of controls.
3. **Audits everything**, so coverage, quality and later edits can be compared across
   compositions and the default can be decided from evidence (see [audit trail](#audit-trail)).

## What exists today

| Capability | Current owner | Limit relevant here |
| --- | --- | --- |
| HyperFrames compositions | Source under `hyperframes/<id>/`; approved renders become transparent WebM under `media/hyperframes/<id>/` with a receipt pinning the source fingerprint ([hyperframes-overlays.ts](../../src/lib/local-store/hyperframes-overlays.ts)) | On the timeline the overlay is ordinary video. Trimming cuts the animation; `playback_rate` squashes it; any change needs a code edit and a new approved render. States `source_changed` / `render_missing` already detect drift. The receipt records one render, not a history. |
| Color grading | `grade_*` properties and `.cube` LUTs ([color-grade.ts](../../src/lib/timeline/color-grade.ts), [cube-lut.ts](../../src/lib/timeline/cube-lut.ts)), GPU-admitted | Already parametric and proposal-tunable on any visual clip. |
| Generated images and video | `asset_generation_prepare`, human-approved generation, then managed media | Results are ordinary media. |
| Sound effects | 274-entry library ([catalog](../../catalogs/sfx/catalog.json)), [sound-design skill](../../.agents/skills/sound-design/SKILL.md) | No sound generation of any kind. |
| Hold timing controls | `timing_controls` with `kind: "hold"`, group holds, frame units ([proposals.md](proposals.md#handled-hold-controls-and-display-units)) | Proven pattern for changing time on screen without manufacturing frames; not connected to compositions. |
| Ownership after transfer | [Reusable artwork standard](../standards/reusable-artwork.md) | Rejects bidirectional HTML ↔ timeline sync. This design keeps that rule. |

## Decision: the model owns inside the box, the timeline owns the box

1. **Inside the box** — HTML, CSS, GSAP timeline, synthesis code and assets — belongs to
   whoever authors code. DreamCut does not parse or rewrite it.
2. **The box** — placement, layer order, start, duration, opacity, blend, grade,
   transitions, clip animation, audio level and fades — belongs to the timeline.
3. **The boundary** is whatever the composition optionally declares. Values flow one way,
   from the timeline into the composition. The editor never writes back into code.

## Optional composition manifest

A composition may ship `hyperframes/<id>/dreamcut.controls.json`. With no manifest it
behaves as today: a box with no inner controls. Sketch:

```json
{
  "schema_version": 1,
  "controls": [
    { "id": "headline", "kind": "text", "label": "Headline", "default": "Ship faster", "max_length": 40 },
    { "id": "accent", "kind": "color", "label": "Accent", "default": "#ff5a1f" }
  ],
  "actors": [
    { "id": "headline", "label": "Headline" },
    { "id": "logo", "label": "Logo" }
  ],
  "markers": [
    { "id": "intro_end", "at_seconds": 0.8 },
    { "id": "hold", "at_seconds": 0.8, "stretch": { "min_seconds": 0.4, "max_seconds": 6 }, "until": "outro_start" },
    { "id": "outro_start", "at_seconds": 2.6 }
  ]
}
```

- **Controls** are the model's own choices (text, color, choice, bounded number) and follow
  the [editable parameter contract](../standards/editable-parameter-contract.md). The
  15-slider first-class limit applies; the rest go to Advanced adjustments. A control
  marked `"fixed": true` is set where the graphic is placed (which section a header
  announces, its length): it still renders from its value but is never shown as a dial.
  Which controls lead on a card is the drafting agent's judgment for that change
  ([proposal-dial-selection](../../.agents/skills/proposal-dial-selection/SKILL.md)),
  sent as the option's `motion_main_controls`; the rest sit in Advanced adjustments.
  Without a choice the card leads with the settings that differ from the render it replaces.
- **Actors** are elements the model tagged with `data-actor` and gave their own labelled
  GSAP sub-timeline. DreamCut derives the same controls for every actor without reading
  the code: position offset, scale, opacity (an extra transform applied on top of the
  model's animation) and entrance delay (a shift of that sub-timeline). Actors can be
  dragged in the preview.
- **Markers** split composition time into fixed animated beats and stretchable holds, and
  give sounds something to anchor to.
- **Canvas** (`"canvas": {"control": "<choice id>", "sizes": {"<option>": {"width", "height"}}}`)
  lets one composition render at several sizes, for example 16:9 and 9:16. The renderer
  reads the root's `data-width`/`data-height` before any script runs, so DreamCut writes
  the chosen size into the render copy. Mark that choice `fixed`; the project decides it.
- **Resetting controls** (`"resets_with": "<control id>"` on a control): when the named
  control changes, this one goes back to its default. A look's palette and texture reset
  with the look; the card, Properties and the render agree because they share one rule
  (`src/lib/hyperframes/control-resets.ts`).
- **Opaque switch** (`"opaque_control": "<switch id>"`): while that switch is on, the
  graphic fills the frame (a full-screen card with its own backdrop), and a render with no
  transparent pixel is accepted.
- Values reach the composition through one runtime entry point (for example
  `window.__dreamcut = { controls, actors, segment_durations }`) read at load.

What stays with the model regardless: the character of the motion — easing, physics,
choreography. Changing that is a code revision.

## Time mapping

With markers, trimming or stretching the clip solves for hold lengths instead of cutting
or rescaling: the required duration minus fixed beats is distributed across holds in
proportion to their authored lengths, within bounds (existing group-hold behavior). The
trim stops at the bounds; it never freezes a frame or changes `playback_rate`. Each hold
also appears as a `kind: "hold"` timing control. Without markers, trimming cuts as today.

## Synthesized sound

The model may write sound as code, the same way it writes motion.

- **Source:** `sounds/<id>/` holds the synthesis program (for example a Web Audio
  `OfflineAudioContext` script or a Python script), an optional manifest with the same
  `controls` shape (pitch, length, brightness, decay), and a fixed random seed.
- **Render:** a deterministic local worker writes WAV to `media/sounds/<id>/` with a receipt
  like the overlay receipt: source fingerprint, control values, seed, SHA-256, duration,
  sample rate, channels, renderer version. Same inputs must produce identical bytes.
- **Placement:** the WAV is an ordinary audio clip. It may carry an anchor
  (`composition_id` + marker id + offset). When a hold stretches, anchored sounds move with
  their marker in the same derivation that preview and approval use.
- **Provenance:** recorded as synthesized in this project; no third-party rights involved.
- Library SFX remain available; the model may mix both.

The sound worker executes trusted code with the local process privileges. Its Node VM
is a determinism boundary, not an isolation sandbox for hostile source. HTTP code
preparation accepts same-origin editor requests and non-browser JSON CLI/MCP requests
to a canonical loopback Host; it rejects foreign origins, browser requests without a
matching Origin, and simple-request content types before reading project state or
launching work. Local processes remain trusted. Do not run untrusted downloaded sound
programs; OS-level isolation remains a separate capability gap.

## Change flow and authority

The creator asks in chat; the agent builds and proposes; the creator tunes and decides on
the proposal card. There is no separate approval step in Generate.

| Change | Who | Path |
| --- | --- | --- |
| New or revised code (visual or sound) | Agent | `motion_graphic_prepare` / `sound_synth_prepare` write the source and render a candidate (preparation, no approval); `proposal_create` places it with `create_visual` / `create_audio`. A later code change needs a new or superseding proposal. |
| Declared control value | Creator | Proposal card dials. A committed change re-renders that value set in the background (Apply waits), then swaps the proposed clip through the `motion_render_source_url` review override, so preview, saved tuning and Apply derive the same render. Re-renders refuse if the code changed after the proposal (`expected_source_fingerprint`). |
| Library | Agent | `motion_library_save` / `motion_library_use` keep the creator's own graphics and their linked sounds; the proposal card has no rating or Add to Library control. |
| Move, trim, layer, grade, level, transition | Person or agent | Ordinary dials and timeline operations. |

A code revision that removes or renames a declared control, actor or marker shows which
person-set values no longer apply and keeps the rest; it never silently drops a choice.

## Rendering: baked first, live as a spike

**Phase 1 — parameterized baked render.** The render key becomes `(source fingerprint,
manifest hash, values, segment durations)`. A value change renders that key in the
background and shows the previous render until it lands. A new source fingerprint still
needs approval; re-rendering an approved source with in-bounds values does not. The
timeline still sees transparent video, so GPU admission is unchanged. Renders are a
bounded cache under the [storage lifecycle contract](../standards/storage-lifecycle.md):
keys referenced by the timeline, open proposals and the audit's approved revisions are
kept; others are evictable. Sound renders follow the same rule.

**Phase 2 — live composition spike (decision deferred).** The frame runtime would seek
the composition at time *t* and upload it as a CanvasKit texture, making value changes
instant. The spike must measure texture capture cost, preview/export parity, seek
determinism and sandbox isolation (model-written code with no project API, filesystem or
network). It ships only if it passes the
[GPU-first rule](playback-rendering.md#gpu-first-feature-rule--decided-2026-10-09).

## Grading and generated visuals

- Grades sit on top of the box as `grade_*` values or a `.cube` LUT on the clip or an
  adjustment layer, never baked into the composition.
- Brand colors inside the box are composition controls when the model declares them.
- Generated images or video used inside a composition go through
  `asset_generation_prepare`, become managed media and are referenced by project-relative
  path. Remote resources (including the CDN GSAP in the HyperFrames blank template) are
  recorded as validation warnings, not blocked.

## Audit trail

Every composition and sound keeps an append-only JSONL log under the project's
`audit/motion/compositions/<id>.jsonl` or `audit/motion/sounds/<id>.jsonl`. It sits outside
the source folder so appending never changes the source fingerprint. Entries are never
rewritten; corrections append.

| Event | Recorded |
| --- | --- |
| `revision` | Source fingerprint, manifest hash (or none), file list with hashes, authoring agent, model and effort, linked `editing_feedback` ids and proposal id, the request text as recorded by feedback capture |
| `coverage` | Counts computed at revision: declared controls, actors, markers; visible top-level elements not tagged as actors; whether a manifest exists. Descriptive only, never a gate. |
| `validation` | Check results, including ignored declared controls and determinism probe |
| `render` | Render key, output path and SHA-256, duration, renderer version, elapsed time, whether it needed approval and who approved |
| `value_change` | Control/actor/hold id, old and new value, who (person or model), via direct edit or proposal |
| `placement` | Timeline element ids using this revision, trims and anchors, as they change |
| `model_request` | A later request to the model that a declared or derived control could have satisfied (linked feedback id), marking a missed control |
| `review` | Proposal approval or rejection with the creator's optional 1–5 rating, given on the proposal card (decided 2026-10-10) |

The project's existing history and proposal records remain authoritative for timeline
state; the audit links to them by id rather than duplicating them. `pnpm project-health`
should summarize per composition: revisions, coverage, person edits by control, model
round-trips, and approvals. These are the inputs for deciding later whether controls,
actors or markers should become defaults, and whether they correlate with lower-rated
motion.

## Out of scope

- Editable exports to After Effects, Premiere or Resolve
  ([F19–F29](../research/2026-10-10-claude-motion-graphics-pipelines.md#routes-to-editable-project-files)).
- Parsing or round-tripping arbitrary HTML into native elements.
- AI sound-generation services; synthesized sound only for this experiment.

## Acceptance

Phase 1 is complete when:

1. A composition with no manifest and one with a full manifest both place, render and
   trim; neither is rejected for coverage.
2. Every declared control and derived actor control appears in the inspector with
   self-explanatory labels; changing each produces a new render whose frames differ only
   where expected (`pnpm frame-state` evidence). A declared control the code ignores fails
   validation.
3. Trimming within hold bounds leaves fixed beats frame-identical at matched local times,
   and anchored sounds move with their markers.
4. A synthesized sound renders byte-identically from the same source, seed and values.
5. A code revision through a proposal shows the manifest diff, keeps still-valid
   person-set values, and Undo restores source, values, render and anchors together.
6. Each step above appends the expected audit events, and `project-health` reports them.
7. `pnpm check:parameter-contract`, `pnpm check:editor-ui`, `pnpm typecheck` and affected
   runtime tests pass, and the interactions are verified in the actual UI.

## Open questions

- Should a revision that adds controls be its own review card?
- Proportional hold distribution, or let the first hold absorb trims?
- Synthesis runtime: Web Audio in the same sandbox as visuals, or a separate Python
  runner?
- License review: GSAP standard license terms for a visual editor built on GSAP-authored
  compositions ([GSAP standard license](https://gsap.com/standard-license/)).

## Implementation status

Slices 1–2 (2026-10-10), recorded in the [capability evolution](../tools/evolution/model-authored-motion.md):

| Part | State |
| --- | --- |
| Optional controls file: parse, validate, coverage, value injection, receipt parameters | Implemented ([composition-manifest.ts](../../src/lib/hyperframes/composition-manifest.ts)) |
| Agent tools `motion_graphic_prepare`, `motion_graphic_status`, `sound_synth_prepare`; value-keyed candidate renders and durable render jobs | Implemented ([hyperframes prepare route](../../src/app/api/projects/[projectId]/hyperframes/prepare/route.ts), [hyperframes-candidates.ts](../../src/lib/local-store/hyperframes-candidates.ts), [motion-jobs.ts](../../src/lib/local-store/motion-jobs.ts)) |
| Proposal card: composition controls with background re-render | Implemented ([ProposalMotionControls.tsx](../../src/components/studio/timeline/ProposalMotionControls.tsx), [ProposalsPanel.tsx](../../src/components/studio/timeline/ProposalsPanel.tsx), [proposal-overrides.ts](../../src/lib/agent/proposal-overrides.ts)) |
| Audit: revision, coverage, validation, render, value_change (card), review and placement (approve/reject/batch), library_add; `project-health` summary | Implemented ([motion-audit.ts](../../src/lib/local-store/motion-audit.ts), [motion-proposal-review.ts](../../src/lib/local-store/motion-proposal-review.ts)) |
| Synthesized sound: isolated deterministic runner, WAV, receipts | Implemented ([synth.ts](../../src/lib/sound-synth/synth.ts)) |
| Library intake of synthesized sounds | Implemented ([sfx-library-intake.ts](../../src/lib/local-store/sfx-library-intake.ts)) |
| Inspector controls after placement: Properties → Animation → Motion graphic shows a placed clip's declared controls; a committed change re-renders and swaps the clip's source as one undoable clip edit, audited with the element id ([MotionGraphicProperties.tsx](../../src/components/studio/timeline/MotionGraphicProperties.tsx), [controls route](../../src/app/api/projects/[projectId]/hyperframes/controls/route.ts)) | Implemented 2026-10-12 |
| Linked sounds: `create_audio.follows_visual` links a sound to a picture clip at a fixed offset; proposal derivation and every clip edit keep it there (move the picture, the sounds follow; move a sound alone, its offset updates). One linked dial can set all their levels. Properties → Timing shows the link with Unlink / Unlink sounds; a proposal unlinks with `clear_props: ["follows_visual"]` ([sound-link.ts](../../src/lib/timeline/sound-link.ts), [SoundLinkControl.tsx](../../src/components/studio/timeline/SoundLinkControl.tsx)) | Implemented 2026-10-12 |
| Timing knobs: a controls file declares `timing` (length and named cues as formulas over number controls, [composition-timing.ts](../../src/lib/hyperframes/composition-timing.ts)); renders record the resolved timing; a clip takes its render's length and cue times (`props.motion_timing`), linked sounds anchor to cues (`follows_visual.cue`), and `ripple_after` pushes the edit after an inserted clip when its length changes ([sound-link.ts](../../src/lib/timeline/sound-link.ts), [motion-timing.ts](../../src/lib/local-store/motion-timing.ts)) | Implemented 2026-10-12 |
| A sound's internal rhythm following a composition's controls (sound controls bound to composition values) | Not started |
| Personal Library for motion graphics (agent tools): `motion_library_save` stores a placed graphic's source, values and linked sounds under the profile's `library/motion/`; `motion_library_list`; `motion_library_use` renders it and its sounds in another project for a proposal ([motion-library.ts](../../src/lib/local-store/motion-library.ts)). Graphics with binary assets are not supported yet | Implemented 2026-10-12 |
| Canvas choice and opaque switch in the controls file; the explainer Templates (`.agents/skills/motion-graphics/templates/explainer-looks.md`) use both ([composition-manifest.ts](../../src/lib/hyperframes/composition-manifest.ts), [hyperframes-overlay.ts](../../scripts/hyperframes-overlay.ts)) | Implemented 2026-10-14 |
| `model_request` writer, actor-derived controls, hold time mapping, render cache eviction | Not started |
| Phase 2 live composition spike | Not started |
