# Nontechnical creator judge

Use this reviewer through [editor-ui-design](../SKILL.md), following the existing
[fresh-eyes acceptance contract](../../../../docs/standards/editor-feature-integration.md#fresh-eyes-acceptance-check).
The reviewer evaluates whether an older creator unfamiliar with coding can learn
and complete the task. Do not equate age with incapacity or pretend an agent trial
represents actual older users. Report observed barriers and the limits of the proxy.

## Prepare the independent review

Give a fresh reviewer only the starting app view, the plain-language outcome,
normal user-facing documentation, approved synthetic media and a disposable fixture.
Pass required tool-operation and safety rules, but no source code, internal paths,
implementation rationale, expected click sequence or prior findings. When auditing
documentation alone, provide the user-facing pages as evidence and mark live task
completion unverified. Do not launch a reviewer when the session prohibits delegation.

For a full documentation audit, the coordinator inventories Guide, onboarding,
README user instructions, recipe help, tooltips and linked creator documentation.
List developer/agent documents separately; judge their audience boundaries and any
accidental exposure to creators, not whether every internal contract teaches novices.
Record reviewed and unreviewed pages so a sample cannot pass as a full audit.

## Reviewer brief

> Evaluate this task for a first-time creator with no coding knowledge, with
> particular attention to older users' readability and interaction needs. Use only
> the supplied user-facing help and visible interface. Before trying the task, say
> where you expect to start based on the labels. Attempt it without coaching and
> report what you actually observe. Do not repair the product or inspect hidden
> state. Stop before any external charge, publication or change outside the fixture.
> Separate unclear wording, missing UI functionality and inconsistent interaction.
> Do not invent capabilities or assume a chat command is a visible UI workflow.

Audit these questions for the affected task:

- Can the user tell what the section is for, what they need and what to do next?
- Do help instructions match actual visible labels and lead to a reachable action?
- Are text, contrast, controls and focus legible at normal and increased zoom, with
  keyboard access and without relying solely on tiny icons, hover or color?
- Are unfamiliar editing terms explained where needed, without requiring coding,
  filesystem knowledge or an agent to interpret them?
- Does the UI explain selection, progress, completion, errors and recovery? Can the
  user tell whether media is imported, merely selected or placed on the timeline?

For onboarding or media audits, include this outcome-only task:

> Bring these three videos from your computer into the project. Find and preview
> them, select two to work with, then change that selection without losing any files.

Inspect whether this has a discoverable file chooser with multiple selection,
recognizable previews/names, a visible selected count and destination, predictable
cancel/retry behavior, and clear separation from timeline placement. These are
acceptance questions, not assertions that the controls already exist. A missing
chooser is a product gap; adding more prose or a terminal command does not fix it.
Related entry points should use the same selection and import behavior.

## Findings and handoff

Return a ranked table with: task/page, observed barrier, evidence, user impact,
pass/fail/unverified, suggested remedy, owning surface/document and retest outcome.
Record wrong turns and help required. Keep placement, wording/readability and task
completion verdicts separate. A screenshot supports appearance, not successful
interaction. For non-editing tasks use the relevant cancel/remove-selection recovery;
for committed edits apply the standard's Undo check.

The coordinator maps findings to code/document owners after the independent trial.
Report in chat; if a saved report was requested, use the repository's existing audit
location and retain private screenshots/media locally. Do not commit personal media.
An updated skill is a workflow instruction, not an installed automatic judge or
proof that the UI passed. Report unavailable tooling and untested tasks explicitly.
