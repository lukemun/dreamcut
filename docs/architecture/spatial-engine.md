# Spatial reasoning engine

[Architecture overview](README.md) · Status: architecture reference reviewed against the local implementation on 2026-09-28, not a new benchmark. This page interprets the [primary-paper update](../research/2026-09-27-spatial-reasoning-frontier-update.md) and [earlier findings](../research/2026-09-12-spatial-reasoning-and-agent-design.md). The full [spatial evidence architecture](../spatial-evidence-architecture.md) remains a design proposal; the map below describes implementation boundaries.

## Guiding principle: language owns intent; code owns geometry

**Do not make the LLM act as a coordinate calculator. Convert measured spatial state into text the model can reason over, and convert its named placement decisions back into geometry with deterministic code.**

The design starts from documented weaknesses in visual localization, spatial transformations, and multi-object reasoning, rather than assuming a longer prompt will fix them. This is a system-design response to the research linked below, not a claim that all models fail every spatial task or that DreamCut has eliminated spatial errors.

The intended agent experience is: read what is where, understand a conflict, choose a named region or relationship, and review the resulting placement. The model should not have to estimate X/Y positions from a screenshot, calculate offsets, or manually solve collisions. Coordinates still exist inside the renderer and evidence records; **coordinate-free authoring does not mean coordinate-free implementation**. Human drag and numeric controls remain useful explicit overrides. [Semantic-first authoring](../standards/spatial-authoring.md) is the default; explicit X/Y/Z is a permitted fallback when needed and supported, with measured values, stated coordinate conventions, and one placement authority.

## The two-way spatial reasoning engine

“Spatial reasoning engine” names a cooperating set of modules, not a single model or file. It has a read side and a write-intent side:

```text
READ: timeline + source evidence + measured text/rendered pixels
        → deterministic geometry and spatial relationships
        → compact text/structured facts + IDs + times + uncertainty
        → LLM reasons about meaning, hierarchy, and editorial intent

AUTHOR: LLM selects named slots, size classes, and supported relationships
        → semantic proposal contract
        → deterministic placement resolver
        → candidate timeline → spatial preflight → human preview/approval
        → assess the resulting composition again
```

For example, an assessment can describe two actors as overlapping, or say that a caption's visible ink is above, touching, or overlapping a visual mask edge. The agent can respond with the following supported **operation fragment** for an existing visual (the enclosing proposal supplies the actual element ID and revision):

```json
{
  "element_id": "<existing-visual-id>",
  "props": {
    "semanticLayout": {
      "slot": "upper_left",
      "size": "supporting"
    }
  },
  "rationale": "Move the supporting visual into the upper-left region, then recheck its relationship to the caption."
}
```

The resolver chooses the transform values. The assessment checks the combined candidate; the slot name alone does not prove clearance. Supported motion similarly names `from_slot` and `to_slot`, with timing and easing, instead of an agent-authored X/Y path. Natural-language requests are translated by the LLM into this bounded vocabulary; an arbitrary sentence such as “keep everything balanced” is not itself an implemented solver command.

## Supporting files and their responsibilities

Paths below are relative to the repository root. The file split is intentional: evidence, geometry, language, authoring, and approval have different responsibilities.

| Responsibility | Supporting files | What the agent gets or delegates |
| --- | --- | --- |
| Named visual placement and motion | [`src/lib/timeline/semantic-layout.ts`](../../src/lib/timeline/semantic-layout.ts) | Resolves the 3×5 slot vocabulary, size classes, named motion endpoints, packing variants, and bounded crowd arrangements into transforms; records semantic inputs in the resulting props. |
| Caption anchors and bounded text arrangements | [`src/lib/timeline/captions.ts`](../../src/lib/timeline/captions.ts) | Resolves named caption positions and supported text layouts. The model chooses the semantic treatment; the shared resolver owns its geometry. |
| Agent input contract and proposal derivation | [`src/lib/agent/timeline-editor-agent-apply.ts`](../../src/lib/agent/timeline-editor-agent-apply.ts) | Validates supported operation shapes and compiles semantic layout into a candidate timeline. This is also where remaining raw-coordinate exposure must be audited. |
| Shared scene geometry | [`src/lib/timeline/resolved-media-scene.ts`](../../src/lib/timeline/resolved-media-scene.ts), [`source-projection.ts`](../../src/lib/timeline/source-projection.ts) | Resolves supported transforms and projects source observations into composition space. Unsupported treatments retain explicit limitations. |
| Measured screen state as text | [`src/lib/instruments/frame-state.ts`](../../src/lib/instruments/frame-state.ts), [`scripts/frame-state.ts`](../../scripts/frame-state.ts), [`src/lib/qc/measure-captions.ts`](../../src/lib/qc/measure-captions.ts) | Produces caption measurements, layer state, sampled fill colors, stills, and labeled overlays from the current timeline. The model reads measurements instead of guessing placement or color from pixels. |
| Explicit textual relationships | [`src/lib/instruments/spatial-relations.ts`](../../src/lib/instruments/spatial-relations.ts) | Turns caption-ink/mask-edge geometry into `above_with_clearance`, `touching`, or `overlapping`, with a generated statement and measured gap. This is a specific relation instrument, not a universal scene-language parser. |
| Composition assessment | [`src/lib/media-analysis/spatial-assessment.ts`](../../src/lib/media-analysis/spatial-assessment.ts), [`visual-overlap.ts`](../../src/lib/media-analysis/visual-overlap.ts), [`alpha-footprint.ts`](../../src/lib/media-analysis/alpha-footprint.ts) | Reports sampled caption/subject and cross-lane visual relationships, element IDs, times, layer order, footprint basis, contact evidence, and unknowns. Qualified alpha evidence distinguishes visible-shape contact from rectangular-envelope overlap. |
| Evidence loading and snapshot identity | [`src/lib/local-store/spatial-assessment.ts`](../../src/lib/local-store/spatial-assessment.ts), [`media-context.ts`](../../src/lib/local-store/media-context.ts) | Loads project/source evidence and binds assessment to its inputs so claims have provenance rather than depending on an agent's recollection. |
| Before/after proposal checks | [`src/lib/agent/proposal-spatial-preflight.ts`](../../src/lib/agent/proposal-spatial-preflight.ts) | Scopes assessment to changed actors and affected times; separates introduced, resolved, and remaining issues. Global lane/output changes expand the scope. |
| Agent tools and read API | [`mcp/server.mjs`](../../mcp/server.mjs), [`src/app/api/projects/[projectId]/analysis/spatial/route.ts`](../../src/app/api/projects/[projectId]/analysis/spatial/route.ts) | Exposes `spatial_assess`, `proposal_spatial_preflight`, and the proposal workflow. Assessment is read-only; proposing is separate from human approval. |

Verification lives beside these modules: [`semantic-layout.test.ts`](../../src/lib/timeline/semantic-layout.test.ts), [`resolved-media-scene.test.ts`](../../src/lib/timeline/resolved-media-scene.test.ts), [`spatial-relations.test.ts`](../../src/lib/instruments/spatial-relations.test.ts), [`spatial-assessment.test.ts`](../../src/lib/media-analysis/spatial-assessment.test.ts), and [`proposal-spatial-preflight.test.ts`](../../src/lib/agent/proposal-spatial-preflight.test.ts). [`scripts/verify-spatial-scene.ts`](../../scripts/verify-spatial-scene.ts) checks a production-renderer conformance case. These are implementation checks, not evidence that the whole architecture solves general spatial reasoning.

## Current boundary: semantic default with a bounded fallback

Implemented pieces include semantic visual slots and motion, bounded crowd/text layouts, shared geometry for supported treatments, textual measurements and relations, composition assessment, and scoped proposal preflight. The broader reusable group-layout catalog and general constraint-solving architecture remain incomplete.

The current local agent schema still accepts numeric placement in some paths: `editorAgentPropsSchema` includes `absX`/`absY`, and visual creation includes `media_scale`/`media_offset_x`/`media_offset_y`. Visual creation rejects combining its semantic layout with raw visual coordinates, but this is **not a universal ban on agent-authored coordinates**. The creator clarified on 2026-09-28 that numeric placement is permitted as an explicit fallback, never the default. These fields support some fallbacks today; the schema does not universally enforce semantic-first routing or a recorded fallback reason. Other operations remain stricter. This documentation does not add unsupported fields or a general Z coordinate.

The durable target is that an agent can complete supported spatial edits entirely through semantic instructions. If the vocabulary cannot express a needed relationship, use the measured, explicit fallback allowed by the current contract and record the gap. Improve the resolver when the relationship recurs; do not turn numerical guessing into the default. Evidence may expose numeric measurements for inspection without making the model responsible for calculating placement.

Text is an interface to grounded evidence, not a substitute for it. Missing observations mean `unknown`, sampled clearance does not prove clearance between frames, and estimated rectangles do not establish pixel occlusion. Rendered previews and human review remain necessary for appearance and editorial judgment. Spatial preflight informs that decision; it neither approves a proposal nor proves every overlap is undesirable.

## The arc

The papers report distinct limitations: errors can originate in perception, multi-view matching, spatial transformation, and planning; longer verbal reasoning is not a reliable repair on several tested tasks ([F01–F05](../research/2026-09-27-spatial-reasoning-frontier-update.md#measured-limitations)). Our architectural response is to ask the agent for semantic intent, compute geometry with versioned code, inspect the rendered composition against source-bound evidence, disclose uncertainty, and let the human decide the edit. This is an engineering inference from the cited work, not a result those papers measured in DreamCut.

```text
source media + evidence        timeline + semantic intent
          │                              │
          └──────────────┬───────────────┘
                         ↓
             resolved composition geometry
                         ↓
       spatial assessment + coverage/unknowns
                         ↓
              proposal preview and review
                         ↓
                  human decision
```

| Research signal | DreamCut design response | Current boundary |
| --- | --- | --- |
| Visual details may be inferred from text without the image; verbal chains can hurt on tested spatial tasks ([F01–F02](../research/2026-09-27-spatial-reasoning-frontier-update.md#measured-limitations)). | Keep source observations, deterministic relations, cross-scene comparisons, and editorial recommendations separate as L1–L4. Attach methods, coverage, and snapshot identity to claims; [do not equate an empty detector result with clear space](../spatial-evidence-architecture.md#2-make-coverage-answer-the-actual-question). | Discrete examined-frame coverage and read-only composition assessment run; detector qualification and continuous clearance proof remain open. |
| Multi-image matching and situation transformation remain difficult on [MMSI-Bench](../research/2026-09-27-spatial-reasoning-frontier-update.md#measured-limitations). | Derive source-to-timeline projection, layer order, and supported transforms through code; bind assessment to the exact composition snapshot. Aim for [one resolved scene plan shared by renderer and assessor](../spatial-evidence-architecture.md#shared-effect-contract-one-resolved-scene-two-consumers). | Shared media and caption resolvers cover a limited subset. The complete closed scene compiler, transitions, and arbitrary effects are pending. |
| [Holodeck](../research/2026-09-27-spatial-reasoning-frontier-update.md#system-design-experiments) uses model-authored relations with solver-owned placement. | Agent proposals use named caption anchors and semantic visual slots; code resolves internal coordinates. Coordinated group layouts are the next layer ([semantic authoring](../wiki/spatial-authoring-failure-modes.md), [layout guide](../wiki/spatial-layout-guide.md)). | Caption replacement and single-visual semantic slot/motion placement are implemented; general multi-actor layout resolution is still proposed ([layout guide](../wiki/spatial-layout-guide.md#implementation-boundary)). |
| [SpatialWorld](../research/2026-09-27-spatial-reasoning-frontier-update.md#measured-limitations) evaluates final task state rather than an agent's explanation alone. | Assess the actual proposal preview, preserve uncertainty, and evaluate outcomes and human corrections, not just whether an agent invoked a skill ([validation plan](../spatial-evidence-architecture.md#validation-and-rollout)). | Proposal spatial assessment is advisory and read-only. Approval does not yet require a stored, revalidated assessment receipt. |

These responses do not imply that a 3D-room benchmark predicts caption accuracy. They identify failure classes and candidate system designs. DreamCut needs its own frozen editing tasks, renderer conformance cases, detector checks, and false-clear/unknown measurements before claiming effectiveness ([validation plan](../spatial-evidence-architecture.md#validation-and-rollout)).

## Architecture documentation boundary

Supporting research remains separate from this runtime architecture. For another agent weakness, preserve (1) a dated, primary-source findings record with source/version and limits; (2) a separate product-specific architecture argument mapping each failure class to a contract and enforcer; (3) an implementation receipt and code/evaluation links; and (4) a wiki index entry that lets a reader traverse those layers. Keep unverified leads and proposed capabilities visibly distinct from findings and shipped behavior. This follows the [research convention](../research/README.md) and [wiki maintenance rule](../wiki/README.md#how-to-read-and-maintain-the-wiki).
