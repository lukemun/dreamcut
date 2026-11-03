# DreamCut wiki

Start here to understand the research behind DreamCut and the reasons for its design choices. These pages are stored with the code and readable directly in GitHub or a Markdown editor.

## Spatial evidence and agent perception

| Read | Purpose |
| --- | --- |
| [Software architecture](../architecture/README.md) | System map and separate technical documents for persistence, spatial reasoning, effects, UI, proposals, playback, and knowledge |
| [Spatial evidence](spatial-evidence.md) | The problem, our interpretation of the research, and the proposed L1–L4 model |
| [Spatial reasoning: research to architecture](../architecture/spatial-engine.md) | Start here for the text-first spatial reasoning principle, two-way engine, supporting file map, implementation gaps, and research rationale |
| [Semantic spatial authoring failure modes](spatial-authoring-failure-modes.md) | Why agents express layout intent instead of coordinates; incident record, mitigations, and rollout gates |
| [Semantic spatial layout guide](spatial-layout-guide.md) | Named 3×5 anchors and visual previews of reusable multi-actor group layouts |
| [External research findings](../research/2026-09-12-spatial-reasoning-and-agent-design.md) | What the primary sources report, separate from our recommendations |
| [Spatial-reasoning paper update](../research/2026-09-27-spatial-reasoning-frontier-update.md) | Selected primary visual, multi-image, and interactive papers checked on 2026-09-27 |
| [Source records](../research/raw/spatial-evidence/README.md) | Citations, short excerpts, and examined source scope |
| [Architecture proposal](../spatial-evidence-architecture.md) | Components, data ownership, contracts, alternatives, and rollout |

## Related systems

- [Context limits and media-intake architecture](context-and-media-intake-architecture-reference.md): why source preservation, preparation, annotation, and selective retrieval are distinct layers; backed by [long-context and video findings](../research/2026-09-27-context-and-media-evidence.md).
- [Visual editing failure-mode coverage](agent-failure-mode-reference-map.md): paper-backed failure modes, what DreamCut currently does, and what remains unaddressed; backed by [primary-source findings](../research/2026-09-27-visual-editing-failure-modes.md).
- [Agent knowledge architecture](../agent-knowledge-architecture.md): why operating rules, standards, skills, style recipes, personal preferences, design knowledge, and code enforcement are separate layers.

- [Personal editing style](personal-editing-style.md): editable private STYLE.md, scoped defaults, and separation of taste from skills.

- [Engineering standards](../standards/README.md) and [repository skills](../../.agents/skills/README.md): shared coding and review entry points for all agents.

- [Editorial assembly harness](editorial-assembly-harness.md): parent workflow for turning script, talking-head media, and visual direction into one reviewable assembly; backed by the [agent/skill/workflow findings](../research/2026-09-16-agent-skill-workflow-design.md).
- [Timeline living spec](../timeline-living-spec.md): existing editor semantics.

## How to read and maintain the wiki

**Evidence**, **interpretation**, **proposed design**, and **implemented behavior** must remain distinguishable. A convincing design document is not evidence that a capability has shipped.

For new research, follow the [research-deliverable skill](../../.agents/skills/research-deliverable/SKILL.md) and [research folder convention](../research/README.md). Preserve source records, write findings with inline citations, then update topic articles and design records. Use relative repository links so another checkout can follow them.

Each topic declares its status, review date, evidence links, known weaknesses, and update triggers. When findings change, trace their downstream links and update affected recommendations. Keep dated findings and review outcomes; do not silently overwrite historical evidence. Decisions remain proposed until a human design review records acceptance, amendment, or rejection.

## Change log

- 2026-09-12: Created this wiki from the spatial-reasoning and agent-system-design investigation. Imported the research-deliverable skill with documented local adaptations. Spatial architecture is proposed, not implemented or approved.


- [PR review standard](../standards/pr-review.md) — automated checks, evidence-based review verdicts, and the local repair loop; [source findings](../research/2026-09-14-pr-quality.md).
