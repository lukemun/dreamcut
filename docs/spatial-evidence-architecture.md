# Spatial evidence architecture — design proposal

Status: first integration implemented locally on 2026-09-12 after explicit user authorization. The complete architecture below remains the target, not a claim that every component has shipped. See the [spatial implementation boundaries](architecture/spatial-engine.md).

Part of the [DreamCut wiki](wiki/README.md). Supporting records:
[external findings](research/2026-09-12-spatial-reasoning-and-agent-design.md),
[spatial implementation boundaries](architecture/spatial-engine.md), and
[source inventory and receipts](research/raw/spatial-evidence/README.md).
This document is the application/architecture layer; its recommendations are not research findings. Validation and rollout criteria appear below.

For the current two-way engine, file map, and enforcement gaps, start with the [spatial reasoning architecture reference](architecture/spatial-engine.md). The principle below is the target contract; the reference distinguishes it from current numeric authoring paths.

## Decision

Extend the existing source-addressed analysis system with a revision-bound composition evidence service. Keep measured observations, deterministic descriptions, cross-scene analysis, and editorial recommendations separate. Give the LLM compact prose backed by inspectable records. Require a spatial assessment for relevant proposals, but permit intentional overlap and explicit unknowns.

The intended guarantee is **awareness with provenance**, not automatic perfect composition or a ban on covering faces.

Spatial authoring follows the same separation: the LLM supplies named regions, relationships, and editorial intent; deterministic code resolves those semantics into renderer geometry. Semantic placement is the default; measured, explicit coordinate fallback and human precision overrides follow the [spatial authoring standard](standards/spatial-authoring.md). The incident, failure-mode inventory, and enforcement status are recorded in [Semantic spatial authoring](wiki/spatial-authoring-failure-modes.md).

### Semantic intent before geometry

```text
LLM layout intent
  → versioned deterministic resolver
  → resolved scene plan and receipt
  → renderer + spatial assessor
  → proposal preview and human decision
```

The agent contract must not carry two placement authorities. A named preset combined with numeric X/Y values is invalid even when the numbers happen to match the preset. Caption replacement is the first enforced slice: `position_preset` is accepted, raw coordinates are rejected, and both rendering and assessment resolve the same preset. General visual elements support semantic placement and some numeric fallback paths; the full relational solver and universal enforcement of fallback rationale remain incomplete.

## What exists, traced to implementation

| Existing component | What it establishes | Remaining limitation |
| --- | --- | --- |
| `src/lib/media-analysis/schema.ts:185` | Shared context permits L1 source observations and L2 deterministic per-source derivations, with producer, input revisions, coverage, coordinates, and artifact references. | Level alone does not express observation method, calibrated reliability, or suitability for a particular query. |
| `src/lib/local-store/media-context.ts` | Immutable dataset revisions, source SHA-256 identity, explicit supersession; rejects L3/L4 in shared source context. | Most extraction artifacts are exposed as manifest derivatives rather than uniform typed context datasets. |
| `src/lib/media-analysis/stage-cache.ts` | Cache keys include source, tool, parameters, schema, and dependency keys; invalidates dependants. | Composition evidence additionally needs timeline, metadata, font, renderer, and source-mapping dependencies. |
| `src/lib/media-analysis/worker.ts` | Probe, decoded media, shot/frame timing, waveform artifacts, optional face/person detections, and L2 tracks. | Transcription/alignment remain separate scripts; detector is opt-in and locally unpromoted in this audit. |
| `src/lib/media-analysis/semantic-tracks.ts` | Deterministic anonymous tracking within shots; no identity inference. | Face/person boxes are not silhouettes and do not establish who is speaking. |
| `src/lib/timeline/source-projection.ts` | Shared source-time and geometry projection, including fit, scale, offsets, masks, sample aspect ratio, and display rotation. | The query must audit every renderer transform/effect it encounters; unsupported mappings must be explicit. |
| `src/lib/instruments/spatial-relations.ts` | Numerical caption-ink-to-mask clearance with deterministic prose. | A specific edge relation, not general face/body/overlay occlusion. |
| `src/lib/media-analysis/semantic-queries.ts` | Conservative focal exclusions, candidate contrast/geometry checks and caption ranking. | Only test callers found. Geometry assessment and editorial selection currently share one function. |
| `src/lib/media-analysis/project-context.ts` | Source summaries and clip bindings for the analysis API and legacy context command. | MCP `timeline_get` supplies editing memory but does not call this pack builder. The legacy command references guidance outside the standalone repository. |

The living spec describes L1 extraction, L2 per-item derivation, L3 set analysis, and L4 goal-dependent guidance. It links `timeline-media-context.md`, which is absent from the current checkout. The exposed editing skills do not state this methodology. This is a documentation/distribution gap as well as a runtime integration gap.

### Priority correctness issue: coverage

The worker samples at approximately 0.5-second intervals and stops at 240 frames. Publication nevertheless uses `[0, duration]`, no gaps, and `complete` when the tracking stage completes. A long source can therefore receive coverage extending past the examined frames. Even an uncapped two-Hz sample does not prove continuous visibility.

`focalRegions` accepts caller-supplied completeness and checks gaps between relevant track samples. An empty set of relevant tracks can return complete. It cannot establish that an interval was examined merely from the absence of tracks. This is a source-inspection finding, not a reproduced production incident.

Do not wire this into automatic clearance claims without correcting the coverage contract.

## Preserve the methodology; add an independent scope dimension

| Level | Meaning | Example |
| --- | --- | --- |
| L1 | Recorded measurement or model observation, with its method and uncertainty | Detector reported this face box on this source frame; ASR emitted these words; decoded pixels or alpha values; font measurement returned this footprint. |
| L2 | Reproducible descriptive derivation from identified inputs | Anonymous track association; exact intersection of the supplied boxes; signed clearance; templated prose describing that relation. |
| L3 | Aggregation or comparison across scenes, intervals, or candidates | Which intervals have the most overlap; how candidate placements compare across the edit. |
| L4 | A choice or recommendation dependent on intent or taste | Prefer clear face placement; deliberately put a title across the eyes; choose one layout. |

Prose is a representation, not an evidence level by itself. A deterministic description of a measured relationship is L2. An LLM's recommendation in prose is L4. Writing a recommendation into JSON does not turn it into L1.

Add `scope: source | composition | project`. Source-scoped L1/L2 stays in the current shared source store. A single composition snapshot can have its own L1 measurements and L2 relations in a project-local receipt. Cross-snapshot rollups remain L3. This explicitly extends the current *per-source* L2 definition; it does not relax the shared source store to accept project facts.

L1 is not synonymous with truth. Preserve `method: measurement | model_observation | human_annotation`, producer/model versions, and validation status. A detector score of 0.9 is not a 90% probability of correctness unless calibrated. Exact intersection arithmetic over estimated boxes still describes estimated regions.

## Proposed flow

```text
Original source + fingerprint
  → versioned L1 extraction records
  → source L2 tracks / descriptive summaries
       + exact composition snapshot + source-to-authority mappings
  → composition L2 geometry relations + deterministic prose
  → L3 interval/candidate comparison
  → L4 agent recommendation + current user intent
  → proposal preview + human decision
```

### 1. Publish observations consistently

Adapt the current worker and scripts, preserving existing artifacts and hashes. Publish typed datasets for probe/frame timing, detector observations, ASR output, and alignment evidence. Preserve reviewed transcript text separately from raw ASR, and record the transcript revision consumed by alignment. Do not relabel old files as fully evidenced: legacy imports retain explicit missing provenance.

Store large masks and media externally to JSON, referenced by immutable artifacts. Preserve source PTS/timebase, coordinate convention, pixel aspect ratio, orientation, and any proxy-to-source mapping. A geometrically changed derivative, including stabilization, needs a validated mapping or its own analysis; matching duration is insufficient.

Keep face boxes, person boxes, and segmentation masks distinct. Associate audio activity with a visible subject only through a separate, attributed association or human confirmation. A face in a speaking video is not proof that that face owns the speech. Default face-clearance assessment can cover all detected faces without solving speaker identity.

### 2. Make coverage answer the actual question

Separate execution status from evidence coverage and query sufficiency:

- execution: finished, partial, failed, cancelled;
- observations: actual examined frame IDs/times, detection results including empty observations, and unexamined spans;
- query sufficiency: sampled, bounded by a validated method, exact for represented geometry, or unknown, with reasons.

No detections means “none detected in these examined frames,” not “no person exists.” A sampling gap or cap must survive into the LLM response. Require coverage across the requested interval, including its edges and shot changes.

Use inexpensive initial sampling for discovery. Refine only relevant source windows near an overlay, moving subject, cut, or transform change. Do not assume a guessed speed bound certifies gaps. When a calibrated motion bound is unavailable, report sampled clearance or request denser analysis. Even frame-by-frame detection retains model uncertainty.

### 3. Compute composition evidence with renderer semantics

Build one snapshot from the same proposal preview derivation used for approval. Bind its hash to the timeline, relevant metadata/lane ordering/output format, source identities, analysis revisions, mappings, fonts, and projection/renderer versions.

For every affected interval, resolve source time, keyframes, crop, masks, fit, flips, opacity, layer order, and supported effects. Reuse existing renderer helpers. Unsupported effects return a specific unknown; an advanced effect must never silently fall back to simple rectangle math.

Return separate measurements for:

- geometric intersection of regions;
- possible occlusion according to layer order;
- visible coverage only when alpha/mask/compositing evidence supports it;
- clearance and measurement support over time.

Bounding-box overlap is conservative and cheap. It cannot establish that opaque pixels cover a face. A hollow graphic, a silhouette, a translucent effect, and an opaque card need different evidence. Refine with masks or rendered diagnostic frames when the distinction changes the decision. Preserve visual review for appearance questions.

### 4. Return facts and prose together

#### Shared effect contract: one resolved scene, two consumers

Design-review refinement, 2026-09-12: require visual effects to enter through a versioned registry and a shared scene compiler. Rendering and assessment consume the same resolved scene; assessment must not independently reconstruct transforms from timeline props. This is proposed, not implemented.

The existing [effect-control catalog](../src/lib/timeline/effect-controls.ts) declares parameters, normalization, resolver names, and renderer names. It is a starting point, not an executable scene contract. [MediaTransformFrame](../src/lib/remotion/TimelineComposition.tsx) still builds surface perspective/skew and compositing styles beyond the simpler [source projector](../src/lib/timeline/source-projection.ts). That separation is the concrete parity risk.

```text
UI / proposal / imported timeline
    → validated versioned effect instances
    → scene compiler: resolve time, effect order, hierarchy, geometry, compositing
    → resolved scene plan
        ├─ renderer backend: preview and export
        └─ assessment backend: spatial relations and L2 prose
```

Each registered effect must supply executable parameter validation, version/migration behavior, and a pure resolution function. Its output is an ordered composition of supported primitives: source/time mapping, transforms with coordinate space and origin, clips/masks, alpha operations, pixel filters, and child nodes. Operation order is part of the contract: clip-then-transform differs from transform-then-clip. Transitions belong in the scene graph too, rather than operating as untracked outer wrappers.

The contract separately declares effects on geometry, alpha/visibility, appearance/contrast, and time. Assessment support is `analytic`, `measured`, `bounded`, or `unknown`, per property/query. A color change may preserve geometry while invalidating contrast; a chroma key requires image-dependent alpha evidence; a blur expands visible support and must expose a declared threshold/tolerance or remain unknown for exact footprint queries.

The parent compiler composes the primitives for all children and assigns stable node IDs, dependency hashes, and inherited uncertainty. A parent bounding rectangle is only a broad-phase aid, not a substitute for the child scene. The assessment backend traverses the resolved scene with source observations to identify inter-node relationships. Every effect passes through this accounting, but no LLM, detector, or expensive pixel measurement runs synchronously on every playback frame. Cheap resolution follows the playhead; interval assessments are cached/queued and invalidated by dependency changes. Unfinished assessment is pending, never an old current result.

Enforce the route with a closed renderer node dispatcher, registry/schema validation, restricted imports of geometry/effect wrappers, and behavioral conformance tests. New native effects must compile into supported primitives or a registered opaque/custom node carrying explicit unsupported semantics. Imported or generated media remains a source asset whose internal content needs observations; an outer contract cannot infer a face or an arbitrary shader's behavior from its bounds. Existing effects require adapters with declared support until migrated. Never silently interpret an unknown effect as identity.

Conformance tests must compare known shapes/masks transformed by the renderer with assessment output, including nested order, intermediate animation frames, perspective, transitions, and alpha changes. A schema can force declarations; it cannot prove those declarations truthful. Pixel-based parity tests and explicit uncertainty remain necessary, but a single resolved plan removes duplicated transform interpretation as the default design.

This strengthens the parent abstraction requested in design review without changing the selected native video decoder paths or requiring a new effect DSL in the persisted timeline immediately. Current props can compile through adapters; any future on-disk change still requires a schema migration. The invariant is shared resolved semantics, not a particular HTTP route or class-inheritance hierarchy.

A proposed response contains structured relations, evidence IDs, interval, snapshot hash, coverage limitations, and short deterministic statements. For example, with invented values:

> At 4.20 s, Caption A overlaps the detected face box by 18% of that box's area. Caption A is above the video layer. This is box overlap; pixel occlusion is unmeasured. Source samples cover 4.0–4.5 s at 0.5-second cadence. Clearance between samples is unknown.

The denominator and sample scope are explicit. Templating cannot add unmeasured facts. Human-friendly labels accompany stable IDs. Full evidence is available on demand; the default context contains relevant intervals and limitations, not every frame or mask.

Split `rankCaptionRegions` conceptually into descriptive `assessPlacement` and goal-dependent `rankPlacements`. Retain overlapping candidates with their measurements. A user-directed overlap can then be recommended without falsifying the assessment. Ranking weights and preferences are versioned L4 policy, never source observations.

### 5. Make assessment part of the proposal path

Introduce a small MCP query surface: source evidence lookup and composition assessment, with bounded evidence drill-down. The server resolves evidence from registered artifacts; the LLM does not supply its own claim that analysis is complete.

At relevant proposal creation, derive or validate an assessment receipt for each option. The deterministic operation classifier triggers reassessment for visual placement, caption footprint, source timing, layer order, or output changes. Audio-only gain changes do not trigger spatial work. Show affected intervals, overlap observations, and unknowns in the review drawer with the normal help affordance.

Missing evidence does not block preparing an edit. It blocks a claim that the placement is verified clear. Intentional overlap remains reviewable without a separate permission exchange. If composition dependencies change before approval, refresh/review or reject the stale assessment; never show an old “clear” receipt for a new snapshot. New analysis arriving during review is surfaced explicitly rather than silently replacing the reviewed result.

### 6. Treat skills as consumers of a contract

Update preprocessing, talking-video editing, caption craft, compositing, typography, and delivery skills with: required inputs; tool entry point; L1/L2/L3/L4 ownership; behavior for missing evidence; and review evidence to produce. Repair missing documentation links and the standalone context path.

Record assessment IDs and skill versions with proposal events in Editing Memory. This proves an assessment was supplied and bound to the proposal, not that the LLM internally understood it. Evaluate behavior through outputs and outcomes. Historical corrections can seed frozen regression cases; they do not silently rewrite source observations or core skills.

## Why this design, compared with the alternatives

| Alternative | Attraction | Why I would not choose it as the foundation |
| --- | --- | --- |
| Stronger prompts and skills only | Fastest change | Tools remain optional, missing evidence remains invisible, and there is no revision-bound proof. Skills still matter as instructions for consuming the evidence. |
| Ask a VLM to judge every frame | Broad semantic coverage | Inference cost and inconsistency; precise geometry is not assured. Use VLMs for attributed semantic observations and targeted qualitative review. |
| Segment every source completely at ingest | Rich silhouettes everywhere | Expensive work on unused material; masks can drift and still do not identify the speaker. Use bounded refinement where it changes a decision. |
| Automatically forbid all face overlap | Simple invariant | Confuses perception with taste and rejects intentional compositing. Require disclosure, not a blanket ban. |
| Add a graph database, service bus, and agent team | Flexible future scale | Existing hashes, JSON stores, worker leases, and pure functions already fit the local workload. Add persistent query indexes only after measured performance requires them. |

The cost of the recommended approach is additional schemas, invalidation logic, and an explicit unknown state. The benefit is that changing taste does not rerun perception, moving an overlay does not retranscribe speech, and every spatial claim can be inspected and reproduced from its inputs.

## Validation and rollout

1. **Evidence honesty first:** coverage/cap/empty-observation regression fixtures; consistent dataset publication; local detector qualification; document level and scope contracts. Completion means unknown intervals cannot become “clear.”
2. **One vertical slice:** one caption over a moving face, source analysis through MCP assessment into a proposal receipt. Include a trimmed clip, a crop change, and stale-snapshot rejection. Completion means the actual agent workflow consumes valid evidence.
3. **Broaden composition:** multiple people, masks, transparent overlays, layer order, and unsupported-transform handling. Add bounded silhouette refinement. Completion means “box overlap” and “visible occlusion” remain distinct.
4. **Improve editorial outcomes:** separate assessment from ranking, then add skills and frozen cases to Editing Memory's proposed evaluation loop.

Compare the current system, skills-only updates, and integrated evidence on identical frozen tasks with repeated agent trials. Use hand-annotated media and deterministic geometry graders for measurable claims; human review for taste. Include missed faces, off-screen speech, two people crossing, long sources beyond the sampling cap, mirror/rotation, rapid motion, wrong transcripts, alpha holes, intentional face overlap, missing detector, and composition changes after analysis.

Report false-clear rate, correct-unknown rate, missed/incorrect overlap reports, evidence freshness, proposal assessment attachment, human correction rate, latency, and token cost. Zero false-clear outcomes on the fixed regression suite is a proposed release criterion, not a claim of zero real-world error. Track unknown frequency alongside it so the system cannot win by abstaining on everything. Detector recall alone is insufficient.

Historical local test receipts are not release certification. Evaluate the current implementation against the rollout criteria above.

## External design basis

- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) supports starting with simple, composable workflows. Applied here: a deterministic analysis workflow with an agent making editorial choices.
- [Anthropic: Writing effective tools](https://www.anthropic.com/engineering/writing-tools-for-agents) emphasizes a small set of task-oriented tools, meaningful compact responses, and evaluation of real tool use. Applied here: evidence queries and composition assessment rather than exposing every internal pipeline stage.
- [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) motivates selective retrieval. Applied here: concise relevant prose with evidence drill-down.
- [W3C PROV primer](https://www.w3.org/TR/prov-primer/) distinguishes entities, producing activities, derivation, revision, and plans. Applied here: input artifact → versioned analysis recipe → output evidence. Adopt these concepts without requiring RDF infrastructure.
- [Martin Fowler: CQRS](https://martinfowler.com/bliki/CQRS.html) explains separate update/read representations and cautions against excess complexity. Applied here: keep timeline authority and derive a read-only evidence representation, within the existing local architecture.
- [Anthropic: Demystifying evals for AI agents, January 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) distinguishes transcripts from actual outcomes and uses complementary code/model/human graders. Applied here: evaluate proposal state and perception claims, not merely whether a skill was loaded.
- [Kancheti et al.: Chain-of-Thought Degrades Visual Spatial Reasoning, ACL 2026](https://www.microsoft.com/en-us/research/publication/chain-of-thought-degrades-visual-spatial-reasoning-capabilities-of-multimodal-llms/) motivates caution about verbal reasoning as a substitute for grounded perception. It does not establish failure of every future model or prove this proposed design.

These resources support the design principles. The DreamCut-specific layering, APIs, rollout order, and release criteria above are engineering recommendations to be tested.
# Minimal still-overlap implementation

The additive [visual overlap contract](visual-overlap-contract.md) now exposes conservative
rectangle warnings through current and proposal assessments. Version 4 makes the broad-phase
geometry explicit: every warned actor carries bounds, centroid, rectangular outline and evidence
basis, while the pair carries intersection bounds, centroid, area and per-actor overlap fractions.
Source-addressed binary-alpha preprocessing now upgrades annotated still/video pairs to pixel support,
including the configured scratchpad outline, subject-vs-border contact counts, and sampled
disjoint/touching/overlapping relations. Unannotated `visible_shape` remains unknown. Fractional
alpha, between-frame clearance, protected regions, scene density and intent validation remain future
extensions. The contract also documents the history-to-evidence
path, its bounded layout projection, and its attribution limitations.
