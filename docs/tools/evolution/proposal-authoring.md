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
prints a turn as a timeline for learning reviews; `pnpm learning:evidence` lists a project's
episodes. Eval receipts carry each run's `episode_id`. Purpose: find where the harness (skills,
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
