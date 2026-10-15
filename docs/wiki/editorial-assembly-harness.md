# Editorial assembly harness

Status: parent skill and conversational harness implemented locally on 2026-09-16; dedicated runtime agent not implemented.

Runtime update (2026-09-18): a [shared worker execution layer](../import-processing-harness.md)
now serves import processing, skill maintenance, and editing retrospectives. Import has a durable
per-project queue and invokes `media-process` through Codex by default or a configured trusted
adapter. This is not yet a persistent end-to-end editorial assembly manager.

Evidence: [Agent, skill, and workflow design findings](../research/2026-09-16-agent-skill-workflow-design.md).

## Decision

DreamCut should treat end-to-end script-led video assembly as one parent workflow owned by the editorial assembly harness. The parent skill is `editorial-assembly`; specialist skills remain composable procedures for cuts, audio, captions, asset selection, timing, typography, compositing, spatial layout, and delivery.

This is a manager pattern: the user talks to one editor agent, while the harness retains responsibility for the integrated process and evidence. A specialist should not independently own the final timeline because cuts, captions, visual timing, layout, and audio all share the same speech clock and review state.

The workflow should be deterministic at its major gates and agentic inside them. Input registration, alignment requirements, proposal-only mutation, human approval, and delivery authorization are fixed gates. Beat interpretation, visual metaphor, asset selection, composition, and refinement require editorial judgment.

## Current system boundary

The running Codex task supplies the agent inside the harness. The harness is the larger system: repository instructions, skills, filesystem context, Timeline MCP tools, read-only instruments, proposal gates, Editing Memory, and access to the human reviewer. Repository skills specialize the agent; they are not separate persistent agents.

Editing Memory also owns library-wide skill maintenance. One user action starts a manager pass across all core skills, bounded specialist workers only for selected skills, and an independent evaluator. That workflow produces one version-pinned review bundle and cannot change reusable instructions until a human applies it.

`talking-video-editing` describes the editorial domain but does not own an end-to-end intake-to-review contract. `editorial-assembly` now supplies that missing parent contract.

A dedicated runtime agent becomes worthwhile when DreamCut needs persistent resumable execution independent of the conversation, its own typed job state and journal, automatic retries, explicit concurrency, or a deployed evaluation surface. Until those requirements exist, a second agent would duplicate the conversational agent without improving the harness discipline.

## Assembly contract

```text
script + source video + visual direction + delivery target
                         │
                         ▼
              intake and authority receipt
                         │
                         ▼
        interpretation plan + intent decomposition
                         │
                         ▼
            speech clock and dialogue spine
                         │
                         ▼
        beat map + scene states + asset manifest
                         │
                         ▼
       one integrated, editable assembly
                         │
                         ▼
      timing / spatial / caption / audio evidence
                         │
                         ▼
                   human review
                         │
            approval, revision, or rejection
                         │
                         ▼
          delivery only on explicit request
```

Every stage must preserve a shared authority chain from source speech to cuts, visible mouth movement, captions, and transcript-anchored visuals. A fresh first assembly is built directly inside a separately created `agent_workspace`; an existing human-owned timeline receives one integrated proposal. In both routes, coordinated actors remain separately editable timeline elements.

The timeline also preserves **lane locality**. A coordinated visual idea is stored as one contiguous, top-first visual-lane block: hero, supporting actors, paired context actors, then plate/background. Numeric lane suffixes are stable identities rather than a sorting instruction. Assembly and revision therefore preserve unrelated lane order while moving the related lanes together. This makes the layer stack describe the scene the editor is actually manipulating and prevents paired elements, such as a viewer and phone, from drifting several tracks apart. Required compositing order takes precedence; exceptions belong in the scene-state plan.

## First-assembly route

`assembly_create` is the generic intake boundary for a new script-led edit. It freezes the initial brief and source inventory, refuses to overwrite an existing project, and creates the target with the one-way `agent_workspace` grant. The harness may then use direct semantic timeline tools until the first human edit. That edit permanently converts the project to the normal proposal-gated model. A rebuild of an existing cut therefore creates a separate target rather than reopening authority on the working project.

## Required intermediate artifacts

| Artifact | Purpose |
| --- | --- |
| Intake receipt | Names the source video, reviewed script/transcript, visual direction, reference edit, target canvas, and unresolved inputs. |
| Editorial intent plan | Preserves the raw request, mark evidence, intent atoms, grouping decisions, assumptions, task acceptance checks, and later task-to-operation mapping. It is the trace used to detect dropped or misread instructions. |
| Dialogue map | Records selected takes, removed false starts, forced-aligned boundaries, breaths, and the resulting speech clock. |
| Beat map | Maps exact spoken phrases to visual jobs, entrances, holds, exits, and continuity decisions. |
| Scene-state plan | Names the complete actor set, hierarchy, protected regions, and layer order after every visual boundary. |
| Asset manifest | Separates available, imported, generated, and still-missing assets with provenance. |
| Proposal receipt | Carries the integrated option, expected revision, rationales, and spatial assessment limitations. |
| Review evidence | Includes normal-speed playback, representative combined states, current-timeline frame-state after approval, caption checks, and audio checks. |

## Evaluation plan

Build a frozen task suite from real failure cases. The first cases should include:

- several assets independently centered and allowed to accumulate;
- a spoken statistic incorrectly baked into image cards;
- a paragraph build that loses the reference style;
- a dialogue cut that desynchronizes captions or a talking-head derivative;
- a stale proposal after one sibling is approved;
- a multi-mark request where independent instructions are silently dropped;
- two marks that describe one shared outcome but are incorrectly treated as unrelated edits;
- one mark that contains several independently verifiable requests;
- a layout with no captions where spatial assessment returns not applicable;
- a scene whose transparent asset bounds make rectangle-only overlap misleading; and
- a correct intentional overlap that must not be automatically rejected.

Grade both the trace and the outcome. Deterministic checks should cover intent-atom coverage, task disposition, task-to-operation mapping, timeline validity, source-clock bindings, proposal gating, actor timing, and caption type. Compare user corrections with the preserved interpretation revisions so repeated grouping or omission failures can become harness improvements. Rendered geometry and human-calibrated rubrics should cover hierarchy, rhythm, visual coherence, and fidelity to direction. Run multiple trials before treating a skill change as an improvement.

## Update triggers

Revisit the dedicated-agent decision when the parent skill needs to run outside an active Codex conversation, when assembly jobs must resume across hosts, or when evaluation shows that skill-level orchestration cannot reliably maintain stage state.
