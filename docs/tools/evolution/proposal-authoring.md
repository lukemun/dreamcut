# Compile, validate and stage reviewable edits — evolution

Capability: `proposal-authoring`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Compile, validate and stage reviewable edits. Proposal/evidence writes only; human applies or rejects.

## 2026-09-30 — initial capability registration

- **Observation:** Repository script/catalog audit found this capability family. This
  is code/discovery evidence, not measured editing frequency or a new runtime trial.
- **Decision:** Register existing implementation; audit remaining authoring-contract gaps incrementally.
- **Version:** Initial registry record; existing tool/recipe versions are unchanged.
- **Verification:** Catalog membership and owner/evolution paths checked by `check:tools`.
  Runtime behavior was not re-certified by this inventory.
- **Acceptance for next change:** Preserve existing authority tests; migrate recovery and accounting contracts with representative success/failure cases.
- **Evidence:** [Script audit and priorities](../script-audit.md). Private session
  traces remain outside this public log.

## 2026-09-30 — versioned recipe entry point

`recipe_compile` v1 delegates `prepared-reveal-sequence` version 1 to the existing
compiler, with explicit version/input validation and recipe identity in the result.
The legacy name remains available. The editing profile exposes the recipe name by
default; catalog loading can reveal the compatibility name. No new rendering, source
preparation, timeline writes or approval authority. Shared/independent gap transport
fixtures run the existing behavioral grader; real-footage quality remains unreviewed.

## 2026-10-02 — complete tuning inventory with presentation priority

`review_controls` now orders first-class controls instead of filtering editing
access. The remaining supported draft controls appear in Advanced adjustments,
using shared compact numeric rows, reset and preview bindings. Native transitions
include applicable registry defaults; factual audit rows remain distinct from
the adjustment inventory. Linked children, protected fields and compound timing
bindings retain their ownership boundaries.

The 15-slider admission budget applies to first-class controls. Human tuning may
materialize a registered transition parameter's storage object, with bounded
mutation accounting shared by preview and approval. No new approval authority,
actor creation or source mutation is granted.

Verification: parameter/UI contract gates, tool registry and typecheck passed.
Behavioral tests cover priority tiers, implicit defaults, bounds, linked controls,
reset, preview/approval parity and approval Undo/Redo using isolated synthetic
projects. A fresh visual-only tester verified compact controls, keyboard
activation, typed-value cancellation and reset at normal and narrow drawer widths
in both workspace layouts. Applied-edit Undo was covered by integration tests,
not the UI acceptance run. Other absent effect fields still require authoring;
unsupported structured values and baked processing do not become controls.
Private visual receipts stay outside distributed documentation.

## 2026-10-02 — vertical tracks on newly mounted visuals

The existing authored transition-track schema now accepts bounded vertical position
tracks, matching horizontal tracks and the registered vertical-position effect.
New visual actors can carry those tracks in their creation operation, keeping
coordinated aperture panels atomic instead of requiring an edit after approval.
Source timing and human approval authority are unchanged. Schema/geometry tests
cover interpolation, holds, canvas scaling, end position and rejected bounds;
parameter-contract and type checks pass. This does not add a new effect parameter.

## 2026-10-01 — editable rounded opening frame

Visual creation accepts registered opening duration and corner roundness, allowing
one shared frame above native picture transitions. The original media clocks stay
unchanged; proposal preview and approval derive the same actor. Both values have
bounded proposal tuning, inspector controls and reset semantics. No legacy gap
allowance or direct timeline write was added. Geometry tests cover a closed start,
slower duration, intermediate opening, preview scaling and clean final resolution;
the renderer instrument includes repeated seeks and a 61-frame synthetic encode.

## 2026-10-01 — frame units for proposal blend duration

A short linked montage exposed only three valid transition durations while the dial displayed fractional seconds. Boundary-transition proposal controls now declare whole frames in their owning registry, with native seconds retained for timeline persistence. Review and agent inventory convert both values and source-dependent ranges through the same adapter. The compact numeric owner reserves enough unit space for frames while keeping exact fields aligned. Longer opening animations and general clip timing retain their own seconds units; this change is scoped to the proposal transition duration dial.

Regression coverage exercises short-clip bounds, integer display/entry conversion, linked transition derivation, source preservation and reset. Browser review checks the 5→4 slider key step, 4→3 clicker and reset to five without applying the proposal. This is a display correction using existing interactions, not a new navigation or gesture model.

## 2026-10-01 — individual handled holds and frame display

The existing hold-timing adapter now accepts an optional display_unit (seconds or frames). Native timing remains seconds; whole-frame display, bounds, exact entry and inverse conversion share the proposal control adapter. Legacy holds keep their seconds presentation. Hold rows use one shared Time on screen heading and retain independent labels and resets. Timing row indices are kept separate from operation indices so hold rows cannot inherit transition defaults by coincidence.

Handled video holds use the existing source_tail contract to reveal real source frames, preserve the source-in and rate, and rederive tail trims. Additive bindings shift later cuts and independent graphic labels and extend the opening title/frame together. Hold overrides also extend an authored review window to include the longer beat while retaining its context padding; downstream ripple starts do not extend review to the entire project.

Acceptance covers frame-display bounds and roundtrip, source-tail behavior, timing/operation index isolation, independent override ordering, adjacency, source identity/rate, reset, and bounded replay context. Private UI acceptance confirms visible second-cut timing and reset, but footage loading prevented a full cadence/appearance acceptance. No timeline approval authority is changed.

## 2026-10-01 — shared seconds hold with individual overrides

Hold controls support a bounded member group without duplicating timing bindings. One shared seconds dial changes holds together while preserving unequal pacing; individual controls remain reachable in Advanced and take priority over inherited defaults. Review metadata projects effective member values into the shared numeric owner. Bounds, reset and preview/approval use the same deterministic resolver. Nested, duplicate, unknown and overlapping group membership are rejected. General seconds rows display two decimal places while retaining internal frame timing. This replaces repeated main hold rows when the agent selects the group, without changing old proposals or approval authority.

Regression coverage checks unequal durations, override ordering, source timing, tier inventory, invalid membership/bounds and scoped reset. Browser acceptance and current check results are recorded separately; declaration alone does not establish usability or playback quality.


## 2026-10-02 — Tuned revision baselines and combined previews

- **Decision:** Extend proposal_preview with ordered selections using the existing batch preview route. Omitted overrides read saved tuning; explicit empty overrides retain authored defaults. Single-proposal response identity is preserved.
- **Implementation:** Pending tuning is stored separately from authored proposals; proposal_get returns a baked tuned_baseline. Final combined preservation is checked in preview and apply. No agent approval authority added.
- **Verification:** Synthetic tests cover durable tuning/reset, resolved-edit rejection, unchanged authored/live state and protection conflicts in either selection order. Full session latency and visual equivalence remain unmeasured.

## 2026-10-02 — Timed mask edges in a proposal

The ball reference review exposed a proposal gap: a static `mask_inset` could show the final strip but could not reproduce its sliding entrance. `proposal_create` now accepts bounded `props.mask_inset_keyframes` for existing visual clips and compiles them into the native editable `mask_inset` keyframe track. Times are clip-relative seconds; each point gives normalized top, right, bottom and left inset values, with an optional native easing name. The track starts at zero, stays within the clip, preserves a visible opening and obeys the existing per-edge delta cap. No direct timeline write or approval authority was added.

On 2026-10-02, the creator found the resulting five-point mask animation visually correct but could only see Source in/out and Speed for its synchronized transparent foreground. The proposal authoring contract now exposes a bounded picture-window adapter: top and bottom bar depth plus closing and reopening start/duration. It compiles to the same native mask keyframes and keeps the foreground source window synchronized when timing changes. The source trims and speed remain factual proposal metadata but are removed from adjustment inventory for this paired effect. The approved appearance is unchanged at the authored defaults. The adapter remains scoped to this short reveal range; broader source-clock editing and a persistent post-approval window inspector are separate work.

The project trial kept the desk full-frame until the ball's approach, closed both edges over roughly 0.6 seconds and centered the final aperture on the ball. Proposal preflight and temporary player inspection covered opening, midpoint, settled and payoff frames. Unit coverage confirms interpolation and preview/apply derivation parity. `pnpm check:tools`, `pnpm check:parameter-contract` and `pnpm typecheck` pass. The full agent-apply test file has one pre-existing grade-cap assertion failure unrelated to mask keyframes; broad visual and second-source validation remain open.

### 2026-10-09 — structured schema for tool-only proposal authors

The first combined desktop Codex trial completed the requested pending volume
proposal in 12 tool calls, but three preflight requests failed while the model
reconstructed the generic proposal object's fields. Both proposal_create and
proposal_spatial_preflight now publish a generated JSON Schema projection of the
canonical editorAgentProposalSchema. The generator uses Zod's input shape and
Draft 7; server-only refinements and project/source checks remain authoritative.
No validation rule was relaxed to accommodate generation.

check:tools now detects drift between the published artifact and the validator.
Five MCP harness tests, schema parity, registry validation and typecheck pass. A
malformed proposal is rejected as INVALID_ARGUMENTS by the actual MCP client before
HTTP dispatch. A matched model rerun has not yet measured whether calls or failures
improve. The prior API schema-1 normalization is unchanged; MCP schema validation
now enforces the advertised schema-2 body, so legacy MCP callers must upgrade their
payload before dispatch. Stored proposals and human approval are unchanged.

The expanded schema exposed a Codex 0.162.0 dynamic-tool compatibility limit:
draft-07 positional `items: [schema, schema]` is rejected at thread creation
(`invalid type: map, expected a string`). An isolated ephemeral schema probe
reproduced this for tuples while ordinary properties and anyOf were accepted.
The desktop adapter now projects tuple items to an anyOf item schema for model
registration, retaining length constraints. The original MCP schema and service
validator remain authoritative for positional types. The complete projected
proposal schema was accepted without starting inference; a regression test checks
that projection does not mutate the original schema. This broadens advertised
item types only, not accepted execution payloads.

A fresh packaged combined-owner volume trial passed after that projection and the
same-read revision change: 10 journaled calls, one failed call, one pending proposal,
feedback recorded, and unchanged working timeline. Baseline: 12 calls, three
rejected preflights. One synthetic comparison does not establish general latency
or editing quality. The remaining failure's payload was not retained; do not infer
its cause. The verifier now reports aggregate failed-call counts.

2026-10-09 — Project identifiers now accept the store's bounded dotted folder
names in recipe compilation and video search, matching native opening and desktop
chat. Empty, dot/dot-dot, slash/encoded-slash and overlong input remain rejected.
Real MCP recipe/search tests and desktop ownership tests pass; no new tool or
approval authority. Packaged chat/session/search fixtures also pass. Native
chooser-to-chat visual acceptance remains unverified.

2026-10-09 — Portable tool schemas. Anthropic rejected the generated proposal
schema's draft-07 tuple `items` (transition `bezier`, surface-track `quad`, mask
keyframe values), so Claude sessions silently lost `proposal_create` and
`proposal_spatial_preflight` while Codex worked through its private projection.
The generator now emits one `items` schema with an exact length (all tuples were
homogeneous, so no constraint was widened). `proposal_preview` drops its root
`oneOf`/`not`; its handler already enforces exactly one mode. The Codex bridge uses
the shared owner instead of its own anyOf projection. `check:tools` now checks all
60 catalog schemas against the portable subset; MCP and desktop suites pass.
Fresh Claude and Codex registration of the regenerated catalog, and local-model
grammar trials, remain unverified until those clients reconnect.

2026-10-09 — Browser GPU admission for proposals. An agent-authored project could
only play on the Standard renderer because GPU-first admission covered editor panel
catalogs but not proposal content. `validateEditorAgentProposalAgainstProject` now
runs `assertGpuWriteAdmissible` (`src/lib/timeline/gpu-write-admission.ts`) on every
option's derived timeline. Create, preflight, storyboard/compound proposals, batch
approval, single approval and pending-proposal refresh share that owner. An option
that introduces a CanvasKit issue fails with HTTP 422:
"Proposal option <id> rejected: <element> uses <capability>, which Browser GPU cannot
draw yet (<reason>); use a supported alternative or extend the GPU renderer first."
`source` issues (media preparation) are exempt. Issues already on the same element,
or on the element a split/duplicate came from, are pre-existing and do not block.
Pending proposals that now fail show as "No longer applies". Verification:
`gpu-write-admission.test.ts` (an unsupported prop and a media word animation rejected,
bookkeeping and source-only gaps admitted, legacy gaps ignored). The route error is
plain text; a typed `tool_error` payload is not yet emitted.
Existing proposal fixtures surfaced five bookkeeping/audio props that blocked
admission without drawing anything. They are now listed in `non-rendering-props.ts`:
`caption_split_source_element_id`, `intentional_visual_overlay`, `media_motion_preset`,
`detached_audio_original_volume` and `detached_audio_original_volume_envelope`. Letter fall
(`letter_fall_*`) was briefly refused while it drew only on Standard. CanvasKit now draws it
(2026-10-09): the caption raster re-renders the shared `LetterFallText` owner at the exact
clip frame, keyed by `letterFallRasterElapsed` in `src/lib/timeline/letter-fall.ts`, so
letter-fall proposals are admitted again; the "finish within" bound is unchanged. Tracked,
ticker, wall, image-filled and reveal/per-word combinations still fail closed
(`src/lib/gpu-preview/caption-letter-fall.ts`). WebGPU still rejects letter fall.

2026-10-09 — Browser GPU parity ratchet and backfill. GPU write admission now follows a
derived inventory of everything Standard draws (`src/lib/gpu-preview/parity-inventory.ts`,
enforced by `src/components/studio/timeline/gpu-parity-inventory.test.ts`). Agent writes that
were refused although Standard draws them are now admitted because CanvasKit draws them with
pixel parity: paper contour and traveling aura (`contour_*`, `edge_aura`), caption presets on
media (`handwriting`, `word_*`; shared animation frame), gravity drops including drops linked
to a letter-fall label (`admitGpuScene` applies `resolveLetterFallFollowers` like
TimelineComposition), inert camera-only montage controls on other caption styles, ticker
segments, `image_rendering: pixelated`, and the inspector review mattes. An invalid `edge_aura`
or unknown review mode fails closed. The proposal-validation test now uses an unprepared grid
matte as its non-GPU example; `word_pop` on media is admitted.

2026-10-10 — Clip reverse. Proposals can set `props.playback_reverse` on a video clip: the
used source window plays from its end back to its start, picture and sound, at one constant
speed (`src/lib/timeline/speed-steps.ts`). It refuses speech-bound clips and does not combine
with speed steps or ramps. A local model searched for reverse, found nothing, and invented
`keyframes.reverse`; the field now carries a schema description, `proposal-authoring` has
reverse/play-backward search aliases, catalog search ignores "this/that/it", and rejected
arguments name each unknown field with the closest accepted ones (`mcp/argument-errors.mjs`).

2026-10-10 — Unknown-field guidance on the live server (audit F7): `proposal_create` and
`proposal_spatial_preflight` arguments are checked against the published schema before any
request; `props.keyframes` now suggests `playback_speed_steps`, `playback_reverse` and
`transition_keyframes` (read-shape redirects in `mcp/argument-errors.mjs`). Thrown ZodError
messages from the proposal route are reformatted as `path: message` without regex bodies.
No feature-eval run was made for this change.

2026-10-10 — Server-owned bookkeeping. Every GPT feature-eval run (27/27) was first rejected
for a missing `requested_mutations`, a count the server already computes. Option and cap
counts are now optional and derived (`countOperationMutations`); `caps` defaults to the
runtime ceiling, and a value an agent does send must still match. An operation `type` label,
which models added in 15 of 27 runs, is accepted, ignored and stripped; an operation with no
changes is still rejected. Eval cases now accept equivalent outcomes (`expect.also`: an
animated punch-in through `transition_keyframes.media_scale`), and "crop in" moved to the zoom
case. GPT-6.1-Sol, 9 cases × 3: 26/27 with every run rejected first → 27/27 with 5 runs
rejected first; median calls 11 → 10, median 28 s → 27 s.

2026-10-10 — Server default review dials. A draft that names no `review_controls` gets every
supported changed field as its own main dial (`defaultReviewControls`, applied by the create
and preflight routes only, so stored proposals keep their dials); the option records
`review_controls_origin`. The feature eval now runs the application validator and the dial
default on simulated proposal calls and records the resulting dials; `--dials agent` replays
the earlier contract. GPT-6.1-Sol, 9 cases × 3 per arm, both 27/27: median calls 10 → 9,
preflights 2 → 1, mean 26 s → 24 s; requested-field dial coverage unchanged (18 vs 17 of 27).
The uncovered runs are contract gaps, not selection: `mask_inset` (crop) and keyframed
punch-ins have no proposal dial, and reverse is a boolean.

2026-10-10 — Crop and punch-in dials; recorded control gaps. Crop (`mask_inset`) gets one
derived dial per edge and a keyframed zoom gets `media_scale_peak`, so both are tunable on
the review card and selected by the server default. Each option records `control_gaps` at
authoring time; `pnpm control-gaps` reads them from any projects folder. Verified in the
editor on a disposable project: the server-chosen dials render, typed values update the
preview (left crop 20% vs right 10%, zoom 1.3×), and no approval was made. Applied with
`--infer-legacy` to 873 existing local proposals, the most common untunable changes are clip
timing (`timeline_start` 200 options, `trim_end` 74, `trim_start` 73), then text placement
(`semanticLayout` 61, `positionPreset` 34) and text content/animation presets.
The zoom amount dial also tunes `media_scale_keyframes`, which Sonnet used for a punch-in.
Final run, 9 cases × 3 each: GPT-6.1-Sol 27/27 (median 8 calls, 22 s) and Sonnet 5.5 27/27
(median 5 calls, 14 s); a dial tunes the requested field in 21/27 runs for both (17 before
derived dials). The remainder: reverse is an on/off change with no review toggle (recorded as
a gap), and green-screen runs expose key dials the eval's field check does not credit.

2026-10-10 — Product signals and timing dials. Catalog searches (with misses), rejected
arguments (invented and missing fields, at the harness, server and application layers) and
staged proposals (changed fields, dials, control gaps) now write fixed-schema product signals
under the profile (`docs/architecture/desktop-data-layout.md`); a rejected call was previously
not even counted in `tool-events`. Existing clips get Start, Trim start and Trim end dials
that move only already-proposed fields (`setTimingField`). New feature cases `clip-trim-start`
and `clip-move`: GPT-6.1-Sol and Sonnet 5.5 each 33/33, with a dial on the requested field in
27/33 runs. Both models trim a head as `{trim_start, duration}`, which shaped the coupling
rule; one GPT run sent `trim_start` alone, which the editor accepts as a slip that overruns
the source (open: enforce source-window consistency for agent trims).

2026-10-10 — Activity journal. Each desktop editing turn and each feature-eval run is now an
episode (`profiles/default/activity-journal/`): request, the contract the model saw, its
reasoning summaries and text, every tool call and raw result, the proposals staged, and the
creator's decisions on them, joined by proposal id to project history. `pnpm episode <id>`
prints a turn as a timeline. Eval receipts carry each run's `episode_id`. Purpose: find where the harness (skills,
contracts, catalog, dials) lets a model down or costs it time; not a model-training corpus.

2026-10-10 — Spatial check folded into staging. `proposal_create` runs the scoped spatial check
(`src/lib/agent/proposal-spatial-review.ts`) whenever an option can move or cover something —
anything except sound and registry `geometry_preserving` colour fields — returns and stores
`spatial_review`, and warns about introduced overlaps. `proposal_spatial_preflight` becomes an
optional dry run. 11 cases × 3: GPT-6.1-Sol 33/33, preflight calls 27 → 0, mean calls 8.7 → 7.6,
mean time 20.1 s → 17.5 s; Sonnet 5.5 33/33, unchanged at 4.8 calls and ~13 s but now checked on
every visual edit. Real check cost on a 135-element project ~55 ms.

### 2026-10-10: corrections may name a rejected predecessor

A Codex correction after a rejection listed the rejected draft in `supersedes_proposal_ids`,
as the desktop instructions ask, and staging returned 409 "already rejected". The agent
retried without it and refetched the timeline, an avoidable round trip that every
post-rejection correction risks. Staging now accepts any existing predecessor as revision
history. Only pending drafts are resolved on approval; settled records are never changed;
unknown IDs still return 404. Covered by `src/lib/agent/proposal-supersede-settled.test.ts`,
which fails on the previous route.

### 2026-10-12: extend the contract and propose in one session; dials may follow

The creator asked that the harness never stop an agent from proposing an edit the renderer can
support merely because the contract or its dials are not built yet. An audit found two
obstacles. First, `mcp/server.mjs` read `proposal-schema.json` once at startup, so a field the
agent added and regenerated was rejected as `INVALID_ARGUMENTS` until a restart. Second, policy
treated a field without a dial as a blocker: the only CI allowance was the frozen legacy list.
Runtime already staged dial-less edits and recorded them as `control_gaps`.

The server now re-reads the schema when the file changes. Both the published and the validating
`proposal_create` schema follow the file, the server announces `tools/list_changed`, and a file
caught mid-write keeps the last good schema (`mcp/proposal-schema-reload.test.mjs`).
`PENDING_CONTROL_PARAMETERS` in `src/lib/agent/proposal-parameter-contract.ts` lets a new field
ship before its dial with a stated reason. The contract test requires the reason, rejects names
that are not agent-writable fields, and fails once a dial exists so the entry is removed. A
dial-less field stages and is recorded as a control gap (`proposal-parameter-contract.test.ts`).
Strict schemas and GPU admission are unchanged: a capability still has to exist in the contract
and the renderer. Not yet measured with an agent run; the review card does not list gaps.

### 2026-10-12: large edits arrive as a queue of steps (waves)

Reviewing one opener proposal (the graphic, a ripple, six linked sounds and 69 advanced dials),
the creator asked for big edits to come "in waves": one step comes up, they tune and approve it,
then the next, in an order the agent chooses, with the option to pick a step. Proposals now carry
an optional `wave {id, step, title, needs_steps}`. Each step is its own `proposal_create` call.
A step that needs pending earlier steps is validated on top of them (their recommended option
plus the creator's saved tuning), waits while they are pending (no preview or approval, 409
"Approve step N first"), and opens once they are approved: approval and the read-time refresh
re-validate it against the live timeline and rebase it. A step whose needed step was turned down
reads as no longer applying. Clips created by earlier pending steps are not staleness
dependencies of later ones. The panel shows one step as a full card, other open steps as "Up next"
rows with Open, waiting steps as "After step N", and approved steps as Done. Covered by
`src/lib/agent/proposal-waves.test.ts` (approve in order, refuse early, undo back to the start)
and `proposal-inbox.test.ts` (queue presentation). Not yet measured with an unprompted agent run.

Same day, first review: the creator asked for the opener's sound effects to come with it, "that
isn't a boundary we should usually be splitting on". The skill now keeps a graphic and its own
sound effects in one step and splits waves by the creator's decisions, not by media type.

### 2026-10-12: swap a placed motion graphic's render or a synthesized sound

After the creator approved an opener and then asked for it full screen with varied sounds, no
operation could express the revision: `patch.source_url` was limited to stills. It now also
accepts a new render of the same composition on a placed motion graphic (its length and cues
follow the render) and another synthesized sound on a sound effect (its length follows the new
file; a sound not rendered in the project is refused). Real footage still keeps its source.
`props.title` renames a clip in plain words. Covered by `src/lib/agent/proposal-render-swap.test.ts`.

### 2026-10-13: speech-synced cutouts over editor-prepared clips

A whole-video background blur needs each talking-head clip's SAM 2 cutout bound to that clip
with `speech_sync`. Staging failed with "Speech visual and audible source hashes must match":
the clips play an editor-prepared copy (`media/.prepared/editor-media-v1/<sha>/…/render.mov`)
and carry `archival_source_url`, but the authority lookup only recognised managed sources and
render-authority props, so a prepared copy had no hash. It now inherits its archival source's
hash when that source is a hash-verified managed copy and the prepared path names the same hash.
A prepared path naming another hash still fails (`timeline-editor-agent-apply.test.ts`).


## 2026-10-12 — Caption dials, one-word reveal, written numbers

- **Problem:** a captions card had no dials at all, and placed captions could only move by redrafting. Captions also had to read exactly as aligned, so "$80K" showed as "eighty k".
- **Change:** `replace_captions` takes `offsetX`/`offsetY` (centred nudges from the preset spot) and `timing_mode`. `font_size_px`, `offsetX` and `offsetY` are default Size/X/Y dials, and `caption_proposal_compile` always includes the offsets. Cues may list `caption_display_substitutions` (spoken → written); the validator checks the cue text equals the spoken words with those swaps applied, and one-word reveals time a swapped phrase as one word.
- **Evidence:** `caption-display-text.test.ts`. On the real project the captions card shows Size, X and Y dials.

## 2026-10-13 — One dial set per graphic, not per clip

- **Problem:** a card swapping four section cards to new renders showed four complete dial sets (Point 1–4, pen colour, entrance… four times), each titled "Section header", in a shuffled order. Graphic dials had no shared-value concept; only numeric dials could link across clips (`linked_operation_indices`). The title lookup read an empty `adjustment_rows` list, all four panels shared one React key, and patch render swaps had no dials at all.
- **Change:** `motion_items` now include patch swaps (`target: "patch"`) and keep one item per distinct render. The panel groups items by composition (`proposal-motion-groups.ts`). `ProposalMotionGroup` shows matching settings once under "All N cards", shows each clip's differing settings under its own name, and renders the copies in a queue, because the server renders one graphic at a time. Render overrides accept `patch` as well as `create_visual`.
- **Evidence:** `proposal-motion-groups.test.ts`, `proposal-motion-render.test.ts`. On the real card: one "All 4 cards" set, then Point number and Title per section.
- **Not yet:** a shared change takes about 20 s per copy, because copies render one after another.

## 2026-10-13 — Repair and Draft from the review panel

- **Problem:** a card that stopped applying was a dead end ("Needs updating — still pending", no reason, no action), and a recorded request with no card only said "Not drafted yet". The creator had to explain both to an agent by hand. One such row was a request already done whose correction record was never linked.
- **Change:** stale cards show **No longer applies** with the reason and a **Repair** action; "Up next" requests get **Draft**. Each records an `agent_request` (`proposal-agent-requests.ts`, listed on `proposal_list` entries) holding the exact instructions (`proposal-agent-request-prompt.ts`). The panel sends them into the editor's Chat when it is beside the panel, otherwise copies them for the creator's own agent chat; no hidden session runs them. The skill now drafts every ask up front so each stays valid across the others' decisions.
- **Evidence:** `proposal-agent-requests.test.ts` (live cards refused, stale card records its reason, Draft asks for an independent linked card). On a disposable project copy: the stale card shows its reason, and Repair copies the request.
- **Not yet:** sending into the editor's Chat is unverified in the browser (the Editor page has no Chat beside it). Narrower staleness for timeline-wide operations (captions, speech sync) would reduce how often Repair is needed.

## 2026-10-13 — Every card stands alone; dials follow the control catalog

- **Problem:** cards went out of date in normal use. Changing any field of a clip retired every card touching it. Captions, cuts and speech sync retired on any change. Wave steps were built on pending steps, so rejecting or retuning step 1 broke step 2. The creator had to stop and ask for a repair and lost track of the original ask. Separately, a section card's "Point number" was a 1–4 slider that picked a section, and On/Off settings were dropdowns.
- **Change:** `proposal_create` refuses a card that overlaps, depends on or would break another pending card (`proposal-standalone.ts`). Wave steps are an order (no default `needs_steps`). Cards re-validate onto every new revision and go out of date only when they truly cannot apply. If the creator changed a setting a card also sets, the card stays and names it (`proposalOverrides`, `overrideNotice`): the creator chose this over skipping or stopping. Repair remains the backup. Graphic dials follow the catalog in `editor-controls.md`: a pick is a named `choice` (segmented or select, `label_from` for names), a yes/no is a checkbox, and rendering refuses a `number` that is really a pick (`controlKindProblems`).
- **Evidence:** `proposal-waves.test.ts` (dependent step refused; steps settle in any order; same-setting overlap refused), `proposal-staleness.test.ts`, `proposal-contract.test.ts`, `proposal-inbox-batch.test.ts`, `proposal-override-notice.test.ts`, `composition-manifest.test.ts`. On the real project the section cards show one Section picker by name.
- **Not yet:** a ripple cut cannot share the queue until placements follow their clip or word. The ordered-list (drag) control is catalogued but not built.

## 2026-10-13 — Type on entrance, captions without punctuation

- **Problem:** the creator asked for a quote "written out one letter at a time"; the closest entrance was write_on, a soft wipe. They also asked for captions with no punctuation, but cue text must match the aligned words. And captions moved to a second caption lane to clear the quote were never drawn, because that lane was missing from the lane order.
- **Change:** `type_on` entrance for text (`animation-presets.ts`): letters appear in place with the rest laid out but hidden, so lines never re-wrap; GPU redraws only when another letter appears (`typedCharacters`). Pictures cannot use it. `hidePunctuation` caption prop (Captions → Punctuation, `replace_captions.hide_punctuation`): both renderers draw `captionDrawnProps`, which drops punctuation but keeps marks inside words and numbers; the aligned words are untouched.
- **Evidence:** `caption-display-text.test.ts`; frames on a disposable copy show the quote typing and the 0:21–0:24 captions drawn without commas.
- **Not yet:** GPU playback of typing is unverified in the browser. A session's MCP server started before 2026-10-12 cannot learn new schema fields (wave, hidePunctuation) until it is reconnected.

## 2026-10-13 — A caption holds exactly the words it shows

- **Problem:** captions set to "One word at a time" played one word per moment, but each caption on the timeline still held a group of up to four words. Selecting one showed three words in its text, so the creator could not tell which word they were editing, and could not move or trim one word. Nothing in the contract prevented it: `replace_captions` did not validate single_word timing, and its `word_limit` was stored, not enforced.
- **Change:** `splitSingleWordCaptions` (`src/lib/timeline/caption-word-elements.ts`) stores a multi-word `single_word` caption as one caption per word, each with its own timing, source window and audio binding. It runs on the captions a write adds or changes in `writeTimeline`, `writeTimelineAndMetadata` and `writeWithCaptionFollowers` (which returns the new captions and a history snapshot, so the editor shows them and Undo restores the original in one step), and in `deriveProposalTimeline`, so a card's preview shows the same captions approval writes. Captions → One word at a time always uses the batch write. The `timingMode` and `replace_captions.timing_mode` descriptions state the rule.
- **Evidence:** `caption-word-elements.test.ts`: words keep the same frames as before the split; one-word, phrase, invalid and removed captions are untouched; the split is idempotent.
- **Correction (same day):** the first version split every such caption on any write. A mark placed in the editor split a whole project's captions without an approved edit, and an open editor kept the old captions. Untouched captions now split only through an edit that touches them (an approved card or the Captions menu), and a repeated split replaces rather than duplicates word captions.
- **Not yet:** older multi-word one-word-at-a-time captions stay as they are until an edit touches them. Choosing One word at a time applies only to the primary selected caption (unchanged). Switching a one-word caption back to Phrase leaves it one word; merging words back into phrases is not built. Editor flow unverified in the browser.

## 2026-10-13 — Layout dials reach the whole frame and answer at once

- **Problem:** on a card that moved a picture behind the speaker, Horizontal ran only from −0.1 to 0.1 and Vertical from −0.2 to 0: the slider window was the drafted value ± the larger of that value and ten steps, so a centred draft got almost no room and the creator hit the end. Each dial move also waited 0.6–1.9 s for the server to derive and send the whole draft timeline (≈1.5 MB) before the paused preview changed.
- **Change:** `numericWorkingRange(..., {floorFraction: 0.25})` for size, position and other non-time dials on cards: the window is at least a quarter of the full range on each side and clips each side to the domain on its own (Horizontal from a centred draft now spans −1 to 1, frame edge to edge). Timing dials keep their fine window. Picture dials (`media_scale`, `media_offset_x/y`, `media_opacity`, `absX/absY`, `fontSizePx`) are applied to the shown draft at once (`proposal-preview-props.ts`); the server's derived preview still replaces it when it arrives.
- **Evidence:** `numeric-working-range.test.ts`, `proposal-preview-props.test.ts`; in the editor the card showed Size 0.1–1.7, Horizontal −1–1, Vertical −1.1–0.9.
- **Follow-up (same day):** the creator still saw a two-second delay. Measured in the editor: the card's 120 ms debounce restarted on every drag sample, so the instant update only ran after release; and `GpuPlaybackComposition` keyed its GPU session effect on `profileInputs` (a JSON of the whole scene, added 2026-10-10 for replay hints), so every element change — card dial, Properties edit or server preview — tore down and rebuilt the GPU worker instead of using `updateScene`. Picture dials now update the draft on every drag sample (`onInstantPreview`), and the session keeps running across edits while the replay profile rotates with the scene. Measured on a disposable copy: scene update 70 ms after pointer down, first redrawn frame ≈200 ms; before, nothing redrew until the server preview returned 1.7–2.7 s later.
- **Not yet:** `pnpm verify:gpu-preview` was not run (it needs an isolated editor storage root). Other dials still wait for the server; the preview response still carries the full timeline and a spatial report on every move (1.2–2.7 s).

## 2026-10-13 — Card dials redraw the paused preview while dragging

- **Problem:** after the session-rebuild fix the creator still saw dial drags lag. Measured with 60 scripted drag samples on a disposable copy (dev server): each sample cancelled the paused picture in flight, so nothing finished until the drag stopped; each scene change aborted the worker's decoded video; and each sample re-rendered the whole editor (≈60 ms) because the dragged values lived in editor state, plus a ≈1 MB scene JSON was re-serialised and re-keyed for replay hints.
- **Change:** dragged picture values go through `instant-preview-store.ts` straight to `GpuPlaybackComposition` (no editor re-render); the derived preview clears the store. The player holds a scene change while a paused picture is being prepared, shows that picture, then renders the newest scene (the paused-scrub rule). `runtime-core.updateScene` keeps decoded frames and decoders when only placement props changed (`samePictureSources`). Admission is patched for the dragged clip instead of re-checking every clip, and replay hints stay keyed to the scene as edited.
- **Evidence:** per drag sample 66 → 18 ms of main-thread work; paused pictures every 35 ms during the drag (none before), each drawn in ≈2 ms with no video decode; pixel check: the article's left edge in every presented frame matches the slider value at that moment. `instant-preview-store.test.ts`, `scene-media-key.test.ts`.
- **Not yet:** measured on the dev server only; size, position and opacity only — other dials still wait for the server preview. `pnpm verify:gpu-preview` not run (needs an isolated storage root).

## 2026-10-13 — Graphic dials show what the card is about

- **Problem:** a card that re-rendered three section headers only to fix their first frame showed every header control three-fold, including a Section dropdown (picking a different point than the header's own name) and a Duration that repeats the clip length. The creator could not tell which dial related to the change.
- **Change:** choosing a card's main dials is an agent judgment owned by the new [proposal-dial-selection](../../../.agents/skills/proposal-dial-selection/SKILL.md) skill, with its own evolution log and regression suite (`pnpm eval:dial-selection`). Proposal options accept `motion_main_controls`; without it the card leads with settings that differ from the render being replaced. Composition controls accept `"fixed": true` (rendered, never shown); the section header marks Section and Duration fixed.
- **Evidence:** unit tests for the split, the replaced-render link and the manifest flag; the suite's reference answers pass and known-bad answers fail; card UI checked on a disposable project copy.
- **Not yet:** no model trial against the suite. The composition fingerprint covers the controls file, so changing a manifest's presentation needs fresh renders before placed clips show their dials again.

## 2026-10-13 — Color Map and Glitch clip effects

- **Problem:** recreating a datamosh glitch lyric reel needed a thermal gradient map and a digital glitch that one clip can flash or burst on a beat. Neither existed ("Mask Glitch" is a white subject flash).
- **Change:** twelve registered controls (`gradient_map_*`, `glitch_*` in `EFFECT_CONTROLS`), settable through `props` and `create_visual`. `gradient_map_amount`, `gradient_map_contrast`, `glitch_amount`, `glitch_shift`, `glitch_rgb_split` and `glitch_smear` join `transition_keyframes`, so a card keys a flash with hold keys. The three ramp colours are proposal colour dials (`PROPOSAL_COLOR_CONTROL_FIELDS`). Glitch randomness hashes seed, block index and `floor(t × rate)` on the clip clock; CanvasKit and Standard draw the same `glitchPlan`. Twelve feature cases and catalog vocabulary (thermal, heat map, datamosh, RGB split…); `transition_keyframes` point fields are now described.
- **Evidence:** `glitch.test.ts`, `gradient-map.test.ts`, `proposal-look-effects.test.ts`, parameter contract, GPU admission; CanvasKit vs Standard frame proof on public-domain inspector photos (glitch identical pixels; color map mean channel delta ≤ 0.31, max 2); editor Effects → Glitch / Color Map add, slider, Undo and Pattern checked on a disposable project; `verify-renderer-contract.ts` passes all 58 effect cases (Standard visible change, exact reset, preview/export parity).
- **Not yet:** `pnpm eval:features` not run for the new cases; `verify:surface-tracking` (second half of `pnpm verify:renderer`) not run; no recorded inspector preview clip for the two new tiles; custom WebGPU does not admit either effect (CanvasKit is the default).

## 2026-10-14 — Subject window: a clip seen through another clip's moving subject

- **Problem:** recreating a silhouette overlay (fills cycling every 0.6 s inside a person's head-and-shoulders, sky kept) failed with a black chroma key because the dusk sky is nearly as dark as the silhouette. Nothing let one clip use another clip's moving cutout as its matte.
- **Change:** `subject_window_parent_id` + `subject_window_mask` bind a visual to a subject video clip and its prepared mask (`cutout_status` grid_matte_mask); `subject_window_mode`, `_feather`, `_expand`, `_strength` are registered effect controls (proposal dials, Show footage as a choice) and `_enabled` a switch. Accepted in `props` and `create_visual`. Validation refuses a missing/self/rotated subject, another project's or stale mask, and masks that do not cover the subject's shown footage, re-checked whenever the subject is edited or removed. Seven feature cases; cutout_status names the mask's second use.
- **Evidence:** `subject-window.test.ts`, `proposal-subject-window.test.ts`, `gpu-subject-window-packet.test.ts`, lifecycle/assets tests; parameter contract, parity inventory, `check:tools`; `verify-renderer-contract.ts` passes the four new cases (Standard visible change, reset, preview/export parity). Disposable project `subject-window-test`: frame-state contact sheet of a nine-fill sequence under the silhouette plus a second subject (canyon selfie); Standard vs CanvasKit encoded comparison shows no window-edge differences (residual is fill texture resampling).
- **Not yet:** `pnpm eval:features` not run for the new cases; no UI to add a window from scratch (needs a subject cutout picker); window does not follow subject entrance animations/transitions, rotation or mirroring; per-frame mask derivation is CPU (≈7–14 ms at 1080p) with an 8-frame lookahead, real-time playback measured only briefly.

## 2026-10-17 — proposal_create takes the project id once

- **Problem:** in three of three recent headless agent runs, the first `proposal_create` failed with `400: Invalid field: project_id: expected string, received undefined`: agents pass the top-level `project_id` but not `proposal.project_id`, then retry with both, costing a turn per edit.
- **Change:** `proposal_create` and `proposal_spatial_preflight` fill `proposal.project_id` from the top-level `project_id` when it is absent and refuse with `INVALID_ARGUMENTS` (nothing sent to the editor) when the two name different projects. The published proposal body no longer lists `project_id` as required, including after a schema reload; the editor API still requires it.
- **Evidence:** `mcp/proposal-project-id.test.mjs` (stub editor: filled body, matching body, refused mismatch, preflight).
- **Not yet:** not re-measured in a headless agent run.

## 2026-10-17 — Punch-in timing dials

- **Problem:** a "Punch in on the dancer" card (1.0→1.25×, ramp from 7.2 s, peak 7.5 s, hold to 8.3 s, back by 8.8 s) offered only Zoom amount; the creator could not retune when the punch starts, how long it holds or how fast it returns without editing keyframes.
- **Change:** a keyframed zoom (`media_scale_keyframes` or a `media_scale` transition track) also gets derived Ramp in, Hold and Ramp out dials. One adapter in `proposal-controls.ts` reads and writes them for review, preview, reset and approval; the peak keyframe never moves, a first-frame ramp gains a level lead-in when shortened, Hold 0 merges the hold into the peak, and the review narrows each range to neighbouring keyframes and the clip. The server default selects all four; agent-chosen cards keep the rest in Advanced. No new stored field, so GPU admission is unchanged (`keyframes.media_scale` is already admitted).
- **Evidence:** `proposal-advanced-controls.test.ts` (values, ranges, each tuning, hold removal and re-adding, approval writes only the track, empty overrides reset, crossing refused, default selection); proposal/apply suites, `check:parameter-contract`, `check:editor-ui`, `typecheck`, `feature-index` labels regenerated.
- **Not yet:** the proposal skill does not yet suggest the timing dials as main controls for punch-ins.

## 2026-10-22 — text rotation and word looks

- **Problem:** rebuilding a logo-and-words demo as separate native elements lost the tilted APPROVED stamp and the blue highlight behind "approve.". Graphic text had no general rotation (only wall-surface and benchmark-card rotation), and per-word colour drew only for timed speech captions, never in phrase mode.
- **Change:** caption text gains `rotationDeg` (−180 to 180°, added to any entrance or exit spin; Rotation dial on cards and in Properties) and `wordStyles` (`[{index, color?, background?}]`, drawn in every timing mode and with word entrances; Word colours row in Properties). `create_text` and props accept both. Standard draws them in `CaptionSequence`; Browser GPU rasterizes the same spans and applies rotation in the compositor, measuring the pivot whenever text has its own rotation.
- **Evidence:** caption, GPU scene, parity-inventory and admission tests; frame-state on disposable `zz-native-logo-check`; in the editor on the GPU renderer, a highlight behind "approve.", a −9° stamp, the Rotation slider (12°), picking "You" in Word colours and colouring it, and Undo restoring it.
- **Not yet:** colour inside one word (the "Cut" of "DreamCut"), keyframed rotation, and `type_on` with word looks (typing draws plain text).

## 2026-10-22 — shape elements

- **Problem:** the demo's drawn ring and landing shockwave had no native home, so they could only exist inside a baked composition. Every new decorative need (a highlight bar, an underline, a ring) would have meant another one-off feature.
- **Change:** a `shape` element type on visual lanes: rectangle or ellipse with fill, outline colour and width, corner rounding and `shape_draw` (how much of the outline is traced), placed with the media transform fields and a new `media_rotation`. Scale, position, opacity, rotation and draw are keyframable. `timeline/shapes.ts` resolves one frame's path and transform for both renderers (GPU texture via `gpu-preview/shape-raster.ts`, Standard SVG in `ShapeSequence`). Proposals add shapes with `create_shape` (dials: Width, Height, Outline, Outline colour, Corners, Drawn, Rotation); Properties shows a Shape and a Placement section; the timeline names clips by title. GPU admission refuses any shape prop or animated channel it does not draw.
- **Evidence:** `shapes.test.ts`, `gpu-shape.test.ts`, parity inventory with a shape actor, editor UI, parameter-contract and tool checks; on disposable `zz-shape-check`, GPU and Standard frames of a half-drawn ring and a turned, scaled box agree; the Shape panel's Fill switch repaints the ring; a `create_shape` card stages with its dials. A preview-only frame-state of the demo lockup shows the ring tracing, the shockwave bursting and the name settling beside the logo.
- **Not yet:** paths beyond rectangle and ellipse, entrance presets and transitions on shapes, Start as a card dial (timing dials are patch-only), and supersampled export rasterization of shapes.
- **Follow-up (same day):** shape animation is editable without the agent. The Keyframes strip lists Rotation and Drawn with their ranges alongside position, scale and opacity; Add keyframe offers "Shape properties" on a shape with no animation yet (keys every animatable setting at the playhead); the timeline shows shape keyframe diamonds. Verified in the editor on the GPU renderer: selecting the Ring's 1 s keyframe showed "Drawn 100%", setting 60% left the outline 60% traced at that moment.

## 2026-10-22 — freeform shapes

- **Problem:** shapes offered only rectangle and ellipse, so every new outline (a star, an arrow, a heart) would have needed another shape kind. The creator asked for a small set of base shapes plus free editing, not a growing list.
- **Change:** every shape is now a set of contours (points with optional curve handles in a unit box). Base shapes are generators: `rect`, `ellipse`, `polygon` (`shape_sides`), `star` (`shape_sides`, `shape_star_depth`), `line`, `arc` (`shape_arc_start/end`), `arrow` (`shape_arrow_head/shaft`). `path` stores its own `shape_contours`; agents give it SVG path data (`create_shape.shape_path_d`, every command, read by `timeline/svg-path.ts`) and it is stored as editable points. Closed contours fill even-odd, so an inner contour cuts a hole, and draw-on runs through contours in order. Properties offers all eight with glyphs drawn by the generators themselves, preset dials, and Edit points (turns the current preset into points without changing its look). Selecting a freeform shape shows its points on the preview: drag a point or a handle (Alt breaks the curve), double-click an edge to add a point, double-click a point to switch corner and curve, Delete removes the selected point; each edit is one Undo step. Shape fields are now patchable through `props`, with new dials (Points, Depth, Start, End, Head, Shaft).
- **Evidence:** `shapes.test.ts` (preset geometry, perimeters, contour draw-on, Edit points identity, SVG commands including packed arc flags, unit-box fit), `shape-point-edit.test.ts`, `gpu-shape.test.ts` (all kinds on both GPU engines, `shape_path_d` validation, props patches), parity inventory with every shape prop and kind; `check:editor-ui`, `check:tools` (17 new feature cases), `check:parameter-contract`, `check:agent-parity`, typecheck. On disposable `zz-shape-kinds-check`, all eight kinds draw the same on GPU and Standard; in the editor a heart point drag saved and undid, an edge double-click added a point and Delete removed only that point (an early build let Delete remove the whole clip; the editor now takes the key first while a point is selected), Edit points turned a star freeform unchanged, and double-clicking its tip made it a curve.
- **Not yet:** keyframed point positions (morphing), SVG file import in the UI, adding or removing whole contours by hand, and a model eval of agents choosing `shape_path_d`.

## 2026-10-22 — morphing shapes

- **Problem:** freeform shapes could be edited but not animated between outlines, so a square becoming a diamond or a heart swelling needed a baked composition.
- **Change:** a freeform shape's points are keyframable as `keyframes.shape_contours`, stored as a flat number list (six numbers per point: position, in handle, out handle) so retime, split, delete and ease work as for any keyframed setting; the shape's own `shape_contours` give the structure, and a key with a different point count is not drawn. `shapeContoursAt` resolves the outline for both renderers. On the canvas, a keyed shape shows its outline at the playhead and a drag or corner/curve switch keys that moment; adding or deleting a point applies to the outline and every key alike. Add keyframe → Shape properties keys the points of a freeform shape, and a Points option starts a morph on a shape that already moves; the Keyframes panel lists Points with its ease and delete, without sliders. Agents morph with `create_shape.keyframes.shape_contours` (SVG path strings with `shape_path_d`, fitted with the outline in one shared box, or contours); keys with a different structure are refused.
- **Evidence:** `gpu-shape.test.ts` (keyed path admitted on both GPU engines and halfway between keys; morph schema refusals; an SVG morph stored as fitted points that draw the key outline), `shape-point-edit.test.ts` (keying the playhead, inserting and deleting across keys), `check:editor-ui`, `check:tools` (new `shape-morph` case and search aliases), `check:parameter-contract`, `check:agent-parity`, typecheck. On disposable `zz-shape-kinds-check`: Add keyframe keyed the heart at 0 s, dragging its left point at 2 s added a key, at 1 s the point sat halfway on GPU and on Standard, and Undo/Redo removed and restored the key.
- **Not yet:** a model eval of agents writing morphs.
- **Follow-up (same day):** later proposals morph a placed path shape with `props.shape_morph` (SVG keys fitted together; the outline becomes the first key's), and outlines no longer need matching structures: `matchOutlines` adds points along the longest edges without changing any outline, grows a missing contour from a point and starts each closed contour where it lines up with the previous key. Morph keys are SVG path data only; a second contours form pushed the published tool catalog past the 1 MB output buffer of the catalog checks (it now reads with a 64 MB buffer). Evidence: `shape-point-edit.test.ts` (matching), `gpu-shape.test.ts` (patch morph of a square into a triangle, admission, refusals), the four checks; on `zz-shape-kinds-check` a staged card "Star to circle" reads "Morph: 2 outlines over 1.50s" and its preview plays the star turning into a circle whose final outline stays within 0.02% of a true circle. The card is left pending for the creator. Mid-morph frames can look uneven because points travel in straight lines; spacing added points by arc length is a possible refinement.

## 2026-10-23 — shot match for grades

- **Problem:** "make this shot match that one" had no measured route; an agent could only guess grade values from stills.
- **Change:** `color_shot_match` (read-only, `src/lib/media-analysis/shot-match.ts` over `src/lib/color/shot-match.ts`) samples three frames inside each clip's trim, measures both as they display with their current grades, and returns target props for `proposal_create` with before/after CIELAB distances and limits. The editor's Match to… control uses the same route.
- **Evidence:** `shot-match.test.ts`, `check:tools` (new `color-shot-match` case and aliases), typecheck; read-only runs on local projects (same-scene pair ΔE 1.2 → 0, cross-scene pair 30.5 → 18 without extra clipping).
- **Not yet:** a model eval of the new case, matching with look files, and per-region (skin, sky) matching.

## 2026-10-24 — look cards replace the shot-match values tool

- **Change:** `color_shot_match` became `color_look_cards`: it takes several target clips and a mode (`match` measures and evens out, `same` copies the whole grade) and returns ready proposals, one per clip, with a plain-language title and change line, so the agent passes them to `proposal_create` unchanged. The editor's Match a clip / Copy a clip's look actions use the same route.
- **Evidence:** `look-cards.test.ts`, `check:tools` (cases `color-shot-match`, `color-same-look`); both modes validated through proposal preflight and showed as cards in the editor on a disposable project.
- **Not yet:** a model eval of either case.

## 2026-10-24 — Face clearance for every graphic, cameras and pending cards

- **Observation:** Shapes were outside the spatial check, speaker clearance only covered text at one moment each, cameras were ignored, and cards were never checked against each other, so a sketch and a pushed-in label landed on a speaker's face unchecked.
- **Decision:** `assessVisualOverlap` and the proposal scope include shapes (outline box) and apply camera views; a changed camera scopes its followers. Speaker clearance covers text and shapes, samples up to 16 moments including camera keyframes, and projects the face through the footage's camera. `proposal_create` refuses face coverage unless the option sets `speaker_overlap_intended`; preflight reports it. New cards are checked against other pending cards' additions (warning, `pending_card_overlaps`).
- **Verification:** `visual-overlap.test.ts`, `proposal-spatial-preflight.test.ts`; preflight on a disposable project flags the earlier sketch cards.

## 2026-10-24 — Text and shapes placed by relation; coordinates need a reason

- **Observation:** On `sketch-pieces-check` the "1000 tasks" label was staged with raw `absX`/`absY` beside a `positionPreset` (two placement modes; the coordinates silently won), nothing tied it to the skyline, so it drifted when the drawing or camera changed, and its fade made its box unknown to the spatial review.
- **Decision:** `create_text`, `create_shape` and `props` accept `place: {relative_to, side, gap, align}`. `src/lib/timeline/placement-relation.ts` resolves it from the anchors' boxes (drawings fully inked, captions regardless of entrance animation) before the camera, gives the follower its anchor's camera, and re-resolves in the proposal derive and the editor write paths; a follower moved on its own leaves the relation. The card gets Side, Align and Gap dials (derived fields over `place`). `proposal_create` (`src/lib/agent/proposal-placement.ts`) refuses coordinates on text and shapes without the option's `coordinate_fallback_reason`, a preset beside coordinates, and a follower the frame edge pushes back onto its anchor; preflight reports the same as `placement_refusals`. `place` is non-rendering for GPU admission.
- **Verification:** `placement-relation.test.ts`, `proposal-placement.test.ts`, the existing apply/controls/parameter-contract/preflight/svg-pieces suites, typecheck, `check:editor-ui`, `check:tools` feature cases (`label-below-drawing`, `label-beside-picture`). On a disposable copy (`sketch-pieces-relation-check`): unreasoned coordinates and preset+coordinates were refused (422); the related card staged (201); preview put the label one gap under the drawing through a camera push-in, and the Side dial and a skyline position dial re-resolved it, checked by eye in the editor. Not yet: `pnpm eval:features` runs for the new cases.
- **Limits:** a placed element cannot also carry offset keyframes; existing shapes still cannot be moved by `props.media_offset_*` (separate gap); pictures keep the old numeric fallback policy without enforcement.

## 2026-10-25 — Shapes fade in and out

- **Observation:** A full-frame backdrop shape could only fade in through an opacity keyframe, so a card's fade dial could not reach it and a person had no fade control on the shape.
- **Decision:** Shapes take `animationIn`/`animationOut` `fade` (or `none`) with their durations. `shapeFadeOpacity` in `src/lib/timeline/shapes.ts` applies them in `shapeFrameInTimeline`, which both the GPU scene and the Standard renderer draw from; GPU admission refuses any other entrance on a shape. The inspector's entrance controls now offer None and Fade for shapes, and `create_shape.animationInDuration` is a card dial.
- **Verification:** `gpu-shape.test.ts` (admitted on both GPU engines; opacity 0, 0.4, 1 and 0.4 through a 0.5 s fade in and out on a 2 s shape; other presets refused), `gpu-admission-contract.test.ts`, `check:tools` (case `shape-fade-in`), `check:parameter-contract`, typecheck. On `week-recap` twelve section cards staged with a white backdrop fade and its own dial.
- **Limits:** linked dials still need one operation type, so a card has separate fades for the backdrop and its pictures.

## 2026-10-25 — Speed change with one Speed dial; cards name stored compiles; smaller staging replies

- **Observation:** Speeding a tutorial's speaker to 1.15× took a hand-written script that re-timed every screen clip, zoom keyframe and caption (about 100 changed fields), and the card had no Speed dial. Caption cards meant pasting hundreds of cues, and `proposal_create` echoed the whole card back.
- **Decision:** New `speed_change` operation (`factor`, `ripple_lane_keys`, `max_affected_elements`) on the speaker clip: later clips on the named lanes move by 1/factor (frame-snapped), media keeps its footage and plays faster, keyframe and volume-envelope times keep their moments, speed steps scale, and voice-bound captions re-time through their binding. `factor` is the Speed dial (0.5–2×). It counts as a ripple for card independence and staleness. Options take `operations_from: [{compile_id}]`, expanded before checking by `proposal_create` and `proposal_spatial_preflight`. The MCP reply to `proposal_create` is compact (id, options, main dials, warnings); `proposal_get` reads the full card. Large results are sent as compact JSON. Fixed a merge in which zoom keyframes dropped keyframes merged earlier in the same operation.
- **Verification:** `speed-change.test.ts`, `check:tools` (cases `talk-faster-everything`, `caption-card-from-compile`), typecheck.
- **Limits:** A clip that straddles the speaker clip's start speeds up as a whole. Captions that do not follow the voice move only when their lane is named.

## 2026-10-25 — Card dials keep room on both sides of the proposed value

- **Observation:** A Speed dial proposed at 1.05× in a 0.5–2× range only reached 1.6×: each dial's working window was cut to the same distance on both sides, so a value near one limit lost its room on the other. The creator asked that every proposed value leave room both ways.
- **Decision:** `numericWorkingRange` gives each side at least the value's own size (or ten steps) and clips each side to the field's limits on its own. Size and position dials keep their wider layout window.
- **Verification:** `numeric-working-range.test.ts` (1.05 in 0.5–2 reaches both ends; 1.2 in 1–2.5 reaches 2.4; 50 s in 0–60 s reaches 0), `proposal-dial-sweep.test.ts`, the agent, timeline and component suites (2 unrelated source-pattern failures in files other sessions are editing), typecheck.
- **Limits:** A value close to a limit is not centred in its window; it gets its full room on the far side instead.

## 2026-10-27 — Proposal building blocks, phase 1

- **Observation:** The Speed Entrance & Exit session hand-built 23–31 KB of operations per card, had 13 of 22 `proposal_create` calls refused (overlaps, lane order, frame rounding, binding rules), needed one adapter per missing dial, and still could not offer "blur relative to the subject" or "speed at the stops" (`docs/audits/2026-10-27-speed-effect-retro.md`, internal).
- **Decision:** Options gain `blocks[]` ([design](../../architecture/proposal-building-blocks.md)). A block is a registered kind and version with measured inputs, typed settings (unit, range, step, default, off position, tier, shared or per instance) and a pure compiler that emits today's operations, frame-snapped, with element ids derived from the card's seed, block id, role and index. The option schema compiles blocks on every parse, so `applyProposalReviewOverrides` → parse → `deriveProposalTimeline` is the one path for preview, review rows, tuning and Apply; overrides address `target: "block"` by block index and setting name. Settings are the card's dials from the registry (main or Advanced; `first_main` for the first of a per-instance set); compiled clips offer no dials of their own and record `props.block_ref`. `proposal_create` compiles each block at its authored settings and at each setting's minimum and maximum (each choice), refusing by block, setting and value. Raw operations remain `option.operations` (an explicit `operations@1` block is hoisted into it). First blocks: `live_hold`, `keyframed_move`, `hop_sequence` (`src/lib/agent/proposal-blocks-hops.ts`).
- **Verification:** `proposal-blocks.test.ts` (frame-aligned non-overlapping compile, stable ids across re-parse, dials and tiers within the slider budget, preview = Apply at defaults, both ends of every dial and every choice, reset, approve/Undo/Redo through the routes with lane order and review state, refusal wording, `operations@1` hoisting, standalone blocks); `proposal-parameter-contract.test.ts` covers every block setting (display, both ends, reset, inventory); `non-rendering-props.test.ts` admits `block_ref`; proposal, apply and timeline UI suites (914 tests); typecheck; `check:tools` regenerates `mcp/proposal-schema.json`.
- **Limits:** Per-hop streak length and travel are not separate dials yet (one shared dial each; the design table asks for per-hop Advanced dials). Blur is sized as subject height × 1080 px regardless of the output aspect. Element ids derive from the card's `expected_revision` and block id, so two cards drafted on the same revision with the same block id would collide on Apply; give each pending card its own block id. Applied blocks are baked clips: reopening them from `block_ref` is phase 3. The subject entrance envelope and `proposal_reveal_sequence` are not blocks yet (phase 2).
- **Performance (same day):** `review_timings_ms.block_compile` / `block_compiles` on a staging reply count the block compiles from validation through the dial sweep; `perf:check` gains a `block-card` workload template (`proposal-preview` on a pending block card). First baseline on the owner's machine: warm preview of a five-stop `hop_sequence` card p50 10 ms wall / 13 ms CPU for the whole route (compile included); cold 320 ms, dominated by the ffprobe spawn, not the compile.
- **Dials in time order (same day, creator request):** `hop_sequence` streak length and blur are now per hop, and the block declares `sections` (`proposal-block-kit.ts`): "Every hop" (variant, travel, empty beat, speed, fade, ease), the opening hold, then one section per hop holding its streak, blur, direction and the hold that follows, named `<place> → <place>`. Each block change carries the shared `section` heading (proposal-presentation); stop labels that are mark numbers are refused ("name the stop by a place the creator can see"). Speed at stops moved to Advanced to keep a five-stop card within 15 main sliders; six or more stops need two cards. The card groups main dials by that heading in order of first appearance.
- **Range validation at draft time only (same day):** the first staging reply showed 1,948 block compiles for one card because every option re-parse (each dial-sweep override) repeated the min/max sweep. `validateBlockRanges` now runs in `validateEditorAgentProposalAgainstProject` (proposal_create, preflight, approve), not in the option schema; a stored card re-parses with one compile per block. Verified on the dev build: the restaged five-stop card shows headings "Every hop", "Opening at Swings", "Swings → Path bend" … with each hop's Streak length, Blur, Leaves toward and Hold under its own heading; perf baseline updated (cold preview 88 ms, warm p50 10 ms).

## 2026-10-27 — Shapes in later cards; slider-cap and face-clearance messages

- **Observation:** In session retro docs/audits/2026-10-27-proof-look-walking-man-retro.md (git-ignored), a later card could not move a drawn shape ("Visual
  effect properties are not applicable to shape"), and it could not change its entrance or
  exit ("Animation properties …"), although `create_shape` sets both. The 15-slider refusal on
  a three-shape rose told the agent to split a dependent drawing. A drawn-only scene warned
  "could not find the speaker's face".
- **Decision:** Fixed. A later card may set a shape's transform (`SHAPE_TRANSFORM_PROPS`, done in
  the session) and its entrance/exit within `SHAPE_ANIMATION_PRESETS` and 2 s. The slider-cap
  refusal says to keep a multi-piece drawing in one card and pick or link its dials. Speaker
  clearance skips scenes with no footage.
- **Verification:** `proposal-placement.test.ts` ("a later card can change a drawn shape's
  entrance and exit …"), `proposal-control-budget.test.ts`, `proposal-speaker-clearance.test.ts`
  (fails without the change).
- **Limits:** Linked dials still need equal values. Moving pieces at different positions
  together needs a relative offset dial: later work, in project status.

## 2026-10-27 — proposal_create and motion_graphic_prepare time themselves

- **Observation:** The Proof-look retro had no phase data: the agent read the skill that says to call
  `proposal_work_record` and never did (0 calls in an 18-minute session).
- **Decision (owner-approved freeze exception B):** The MCP server opens and closes proposal-work
  spans itself (`mcp/proposal-work-auto.mjs`): one attempt per project per MCP session (`start` with
  `recorded_by: "server"` and the session id), a `preparation` span around each
  `motion_graphic_prepare` and a `validation` span around each `proposal_create`; a staged card
  records `saved` with its id and closes the attempt, a refused card marks the span `failed` and keeps
  the attempt open for the retry. Recording failures never touch the tool's result. The agent-called
  `proposal_work_record` is unchanged; its attempts are separate records and the report's `recorded_by`
  tells them apart.
- **Verification:** `mcp/proposal-work-auto.test.mjs` (span order, saved closes the attempt, refusal
  keeps it, other tools and a dead work route are untouched); `mcp/product-signals.test.mjs` (a
  `motion_graphic_prepare` call reaches a fake editor as start, begin, prepare, end).
- **Limits:** Server spans cover tool latency only; composition time (the agent writing the payload)
  still shows up as the gap between spans. A `proposal_create` that fails before the HTTP call is
  still recorded as `failed`.


## 2026-10-27 — Crops may move to a corner bubble

- **Observation:** Moving a speaker from a left column crop (`mask_inset` right 0.79) to a 320 px corner bubble was refused: "mask_inset change exceeds the per-edge delta cap of 0.5". Any bubble smaller than half the frame needs an edge past 0.5, so the cap blocked the corner bubble `mask_corner_radius` documents. The static check also refused opening a crop back up, unlike the keyframe check.
- **Decision:** The per-edge change cap is gone from both the static and keyframe checks; each edge stays bounded 0–0.95 by the schema and the card preview shows the result. A minimum-visible-window rule was tried first and dropped: on a corner bubble (left edge 0.81) it made the card's own Crop right dial fail near the end of its slider.
- **Verification:** `timeline-editor-agent-apply.test.ts` (column to corner bubble accepted, keyframe crops moved freely); typecheck; the tutorial's corner-circle card staged on the dev editor.
- **Limits:** Nothing now stops a proposal from closing a crop entirely; the creator sees that in the preview before approving.

## 2026-10-27 — Refusals name the fix

- **Observation:** In one session three `proposal_create` refusals each needed a source search or a guess: "video duration is derived from its source window" (what to send instead), "Lane \"audio_1\" is not visible/editable for element type \"sound_effect\"" (the agent grepped `src/lib/timeline` for the `sound_effect_N` family) and "Overlapping authored visuals require separate registered visual lanes" (which key to use). About 50 s across the motion graphic and the bobblehead cards.
- **Decision:** The duration refusal says to omit `duration_seconds` and send the source window; a lane refusal names the family and an example key for the element type (`src/lib/timeline/lanes.ts`); the overlap refusal names the busy lane and asks for a free `visual_N` key, added to `set_lane_order` when the card sets order.
- **Verification:** `lanes.test.ts` and `timeline-editor-agent-apply.test.ts` assert each message.

## 2026-10-27 — a keyframe at a clip's very end is accepted

- **Observation:** Zoom cards on the DreamCut tutorial were refused, or their Hold and Ramp out dials failed at the end of their sliders, with "Transition keyframes must fit within the clip duration". Clip lengths carry float noise (24.19999999999999 for 24.2), so a key placed at the end, or a dial's end rounded to the millisecond, landed a hair past it.
- **Decision:** Fixed. The clip-end checks for transition keyframes on existing clips and on create_visual allow a microsecond of slack.
- **Verification:** `src/lib/agent/proposal-advanced-controls.test.ts` (the zoom timing dial ends on the clip end of a 24.19999 s clip); typecheck.
- **Limits:** Cards staged on an editor build without the fix still report those dial failures until it serves the new code.

## 2026-10-27 — Three refusals say how to fix the card

- **Observation:** In a tutorial-editing session three `proposal_create`
  refusals cost retries or code reading. A trim patch missing `trim_end` was told "Use
  element_trim", a direct-write tool that refuses outside an agent workspace. A source-range cut
  0.00002 s inside the frame it must keep was told only to "leave at least one complete frame",
  and the agent read `timeline-editor-agent-apply.ts` to find the bound. Side titles placed by
  relation ran off the frame on eight attempts (02:06–02:18) while the agent guessed sizes;
  `open_space_find`, which measures the text, was never called.
- **Change:** In a proposal, the trim refusal says to add the missing fields to that element's
  patch (`assertSemanticTrimOperations(…, { inProposal: true })`; `elements_batch` keeps "Use
  element_trim"). The source-range refusal names the element and the source window it accepts.
  The relation-overlap refusal ends with one pointer to `open_space_find` for measured room. The
  dreamcut-proposals skill gives "Place from `open_space_find` first" its own lead in step 5.
- **Verification:** `mcp/source-window.test.mjs`, the source-range case in
  `timeline-editor-agent-apply.test.ts` and `proposal-placement.test.ts` check each message.
