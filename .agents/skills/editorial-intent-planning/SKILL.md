---
name: editorial-intent-planning
description: Decompose a multi-command or multi-mark DreamCut request into coherent editorial tasks and preserve the interpretation as a durable plan before a proposal or first assembly. Use when several requests or marks may be independent, related, or ambiguous; skip it for one obvious isolated edit.
---

# Editorial intent planning

Use this skill before `open-edit-proposals` or `editorial-assembly` when a request contains several commands, refers to several marks, or needs a first-pass beat interpretation. Its job is to prevent dropped instructions and make the agent's reading of the request inspectable.

The plan is evidence and coordination, not timeline authority. It never authorizes proposal approval, delivery, rendering, publication, or direct mutation of a working timeline.

## 1. Preserve the request and editing context

Keep the user's request verbatim. Read the current timeline revision and every referenced frame tag. For each mark, retain its ID, time, source anchor, active elements, points, and note.

Inspect the local evidence needed to understand each marked region: nearby playback or frames, transcript or forced alignment, audible content, active elements, and adjacent edit state. A mark identifies a neighborhood, not an exact cut or effect boundary.

For a first assembly, create the project with `assembly_create` before writing the plan, then ground the plan in the saved assembly brief, source inventory, script or transcript, directions, and delivery target.

## 2. Atomize before grouping

Split the request into independently testable intent atoms. Do not assume one mark equals one task:

- one mark can carry several requested changes;
- one requested outcome can span several marks; and
- an unmarked global instruction can apply to every marked task.

Preserve the user's wording for each atom, then add a concise interpretation. Record assumptions instead of silently converting them into facts.

## 3. Form coherent work units

Group atoms when they share an editorial outcome, scene state, speech clock, required evidence, or atomic change. Split them when they affect separate regions or elements and can be implemented and verified independently.

Record why atoms were grouped or split. Each task must name its objective, marks, affected evidence, assumptions, dependencies, specialist skills, intended changes, and acceptance checks. Questions that materially change the edit remain explicit and unresolved.

Treat each independently reviewable editorial beat as its own proposal by default. Group atoms that share a scene state, speech clock, or payoff into that beat, but do not merge unrelated beats merely to reduce the proposal count. The human should be able to preview, adjust, accept, or reject one beat without accepting the rest of the sequence.

When beat proposals touch disjoint actors and ranges, create them together with `rebase_policy: "independent"`; the editor revalidates and rebases non-overlapping pending siblings after an approval. Keep any beats that share an element, lane-order decision, speech-clock mutation, or other atomic dependency in one proposal or stage the dependent proposal after review. Use proposal options only for genuinely different directions within one beat. Combine multiple beats only when the user explicitly requests one integrated review or separation would make either preview misleading or technically invalid.

## 4. Persist the interpretation

Before timeline construction or `proposal_create`, write a versioned JSON plan to:

`projects/<projectId>/analysis/editorial-intent-plans/<plan_id>.json`

Use the fields and lifecycle in [`references/plan-schema.md`](references/plan-schema.md). The artifact must include the raw request, evidence-bearing marks, intent atoms, grouping decisions, tasks, unresolved questions, route, and timeline revision. Do not store media binaries, transcripts, or rendered frames inside it; reference their durable artifacts.

When the user corrects the interpretation, update the same plan, preserve the correction in `revisions`, and make the latest task set authoritative for subsequent work. Do not erase the earlier reading.

## 5. Execute through the correct editor route

- **Existing or human-edited timeline:** read `../open-edit-proposals/SKILL.md` and create one independently reviewable proposal per ready beat, using independent rebasing only for disjoint edits.
- **New first assembly:** read `../editorial-assembly/SKILL.md` and build the beat-led plan inside the fresh `agent_workspace`.
- **Untouched agent workspace:** continue from the saved assembly brief and plan while the grant remains active.

After creating the proposal or assembly, update `execution` with its identifiers and map every task to its proposal and the operations, beats, or scene states that implement it. A task may be explicitly deferred, blocked, or declined, but it must not silently disappear.

## 6. Hand off an auditable result

Report the task decomposition, important assumptions, unresolved questions, and the proposal or assembly prepared from it. The plan is ready only when every intent atom has a task or an explicit disposition, and every completed task has an acceptance check and execution mapping.
