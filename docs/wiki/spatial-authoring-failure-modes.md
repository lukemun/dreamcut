# Semantic spatial authoring: failure modes and mitigations

Status: historical incident and failure-mode record, updated 2026-09-28. Semantic visual slots and bounded layouts are implemented; the broader relational solver remains a target architecture. Current authoring policy is [semantic first with an explicit coordinate fallback](../standards/spatial-authoring.md). This page is the application layer; the supporting external findings are in [Spatial reasoning and agent system design](../research/2026-09-12-spatial-reasoning-and-agent-design.md), and the broader system design is in [Spatial evidence architecture](../spatial-evidence-architecture.md).

## Decision

An agent describes spatial intent. Deterministic code resolves that intent into geometry. Named placement is the default. The replacement-caption operation rejects raw coordinates; other supported operations may accept a measured, explicit fallback under the current standard.

```text
user direction
  → agent-authored semantic intent
  → deterministic layout resolver
  → resolved scene geometry
  → spatial assessment
  → proposal preview
  → human decision
```

Coordinates remain internal geometry and human precision controls; supported coordinate authoring is an explicit fallback, never the default agent path. The original incident still establishes the need for a single placement authority.

## Incident that established the rule

On 2026-09-16 an agent was asked for bottom-middle captions. The proposal supplied both `position_preset: "bottom_center"` and raw `abs_x`/`abs_y` values. The raw values won. In the rendering contract, an explicit absolute X uses a left-edge anchor, so `0.5` meant “place the caption box's left edge at the horizontal midpoint,” not “centre the caption.” A second attempt changed the number without resolving the ambiguity. The proposal was technically valid and visually wrong.

The root cause was dual authority in the agent contract, not a missing adjective in the prompt. The schema required a semantic preset and numeric coordinates simultaneously, so a model could contradict the preset while appearing to comply with it.

## Failure modes

| Failure mode | Mechanism | Mitigation | Enforcement status |
| --- | --- | --- | --- |
| Semantic/numeric contradiction | A preset says one thing while raw coordinates say another. | One placement authority: semantic intent by default; explicit supported numeric fallback when needed. | Implemented for `replace_captions`. |
| Coordinate-frame ambiguity | The same number may describe a centre, edge, top-left, normalized canvas point, or transform offset. | Use typed resolvers by default; a fallback states frame, units, and actor anchor explicitly. | Implemented for agent-authored replacement captions. |
| Plausible numeric guessing | A language model emits a reasonable-looking fraction without measuring the rendered scene. | Prefer named regions and relationships. Require measured values and an explicit reason for a supported coordinate fallback. | Implemented for caption coordinates; pending for general visuals. |
| Verbal reasoning substituted for perception | A model describes a scene confidently without grounded observations. The external findings record reported hallucinated visual details from textual priors and degraded visual-spatial results under chain-of-thought prompting ([R01](../research/2026-09-12-spatial-reasoning-and-agent-design.md#visual-spatial-reasoning)). | Separate model intent from measured observations and deterministic geometry; preserve explicit unknowns. | Spatial assessment is implemented; automatic layout resolution is partial. |
| Empty evidence treated as clear space | No detector output is interpreted as “nothing is there,” even when frames were not examined. | Track actual examined samples and return `unknown` for insufficient coverage. | Implemented in spatial evidence; detector qualification remains pending. |
| Temporal snapshot blindness | A layout is checked at one frame while subjects or captions move across an interval. | Assess every scene-state boundary and representative holds; retain coverage gaps. | Process requirement implemented; continuous proof remains bounded by evidence. |
| Stale assessment | Geometry or media changes after a check, but the earlier result is reused. | Bind assessment to a snapshot hash of timeline, output, evidence, and resolver versions. | Read snapshots implemented; approval-lock persistence remains pending. |
| Renderer/assessor divergence | Rendering and analysis independently interpret transforms or anchor semantics. | Resolve one scene plan and feed it to both consumers; require conformance tests. | Shared caption anchor and a limited media scene are implemented; the full scene compiler remains pending. |
| Element-at-a-time placement | Individually plausible objects overlap when assembled. | Author one semantic scene plan and assess the combined proposal option. | Skill/process rule; general auto-layout remains pending. |
| Bounding-box overclaim | Rectangle overlap is reported as pixel occlusion, or transparent corners are treated as visible content. | Distinguish geometric intersection, possible layer occlusion, and measured visible coverage. | Implemented as explicit limitations; alpha/pixel refinement is incomplete. |
| Silent fallback from unknown | Unsupported effects are treated as identity transforms. | Every effect declares assessment support; unsupported behavior returns `unknown`. | Partially implemented through the effect catalog. |
| Manual override leakage | Human drag coordinates become reusable agent defaults. | Keep human precision overrides distinct from semantic defaults and explicit agent fallbacks. | Implemented for new replacement-caption proposals; legacy timeline coordinates remain supported. |

## Caption contract now

`replace_captions` accepts `position_preset` and shared typography properties. It rejects raw coordinates. Approval stores the semantic preset without materializing agent-provided X/Y values. Preview, export, and spatial assessment resolve the same named preset through the shared caption anchor function.

Existing timeline captions can still contain manual coordinates because editors need precise direct manipulation and old projects must remain readable. Replacement captions retain their stricter contract; other numeric agent paths are documented in the [current implementation map](../architecture/spatial-engine.md#current-boundary-semantic-default-with-a-bounded-fallback).

## General visual contract target

The visual equivalent should accept a versioned intent such as:

```json
{
  "region": "upper_center",
  "relationship": { "kind": "above", "target_element_id": "…" },
  "size": "supporting",
  "collision_policy": "avoid_protected_regions",
  "safe_area": "delivery_default"
}
```

The resolver should consume the output canvas, safe rectangle, actor aspect ratios and alpha bounds, protected regions, layer order, and current scene state. It should emit resolved transforms plus a receipt containing the intent, resolver version, input snapshot, chosen candidate, rejected candidates, and unresolved limitations. If required evidence is unavailable, it may use a preset-only deterministic layout, but it must not describe that result as collision-verified.

## Release gates for broader semantic placement

- Agent workflows default to equivalent semantic intents; numeric fallback is explicit, measured, and accepted by the relevant schema.
- Preview and approval derive identical transforms from the same resolver version.
- Renderer and assessor consume the same resolved geometry.
- Frozen regressions cover centre-versus-edge ambiguity, safe-area changes, multiple actors, transparent assets, stale evidence, unsupported effects, and intentional overlap.
- Review UI explains intent and evidence status, with meaningful human precision controls where supported.
- Existing human manual placements migrate without reinterpretation.

## Evidence and implementation references

- [External spatial-reasoning and agent-design findings](../research/2026-09-12-spatial-reasoning-and-agent-design.md)
- [Spatial evidence architecture](../spatial-evidence-architecture.md)
- [Caption placement resolver](../../src/lib/timeline/captions.ts)
- [Agent proposal contract](../../src/lib/agent/timeline-editor-agent-apply.ts)
