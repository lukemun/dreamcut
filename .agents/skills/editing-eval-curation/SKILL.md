---
name: editing-eval-curation
description: Capture evaluation candidates from real DreamCut editing outcomes or prepare and refresh tool-based editing benchmark cases. Use during an enabled export retrospective or an explicit benchmark curation request, not to run model trials or develop effects.
---

# Curate editing evaluations

Build a gradual benchmark of models operating existing editor capabilities. Read the
[editing evaluation contract](../../../docs/standards/editing-evaluation.md) and relevant
[implementation plan](../../../docs/architecture/agent-model-evaluation-plan.md).
Candidate capture and runnable case preparation are separate stages.

## Capture from an explicit standalone request

No export or retrospective is required. Read the bounded request, actual pre/post edit
revisions, feedback, proposal outcomes and available activity/evidence. Checkpoint and
retro IDs are optional provenance; do not invent them or start a worker to obtain them.
Use the same candidate evidence contract and readiness labels below. Explicit curation
is separate from automatic learning settings and never enables them. Keep receipts private
and output in chat; no model trial or app finding is implied.

## Capture from a retrospective

Use the existing frozen export checkpoint, retrospective findings, original feedback,
proposal decisions and final overrides. Read evidence already available; do not trigger
another retro, new inference, media analysis or export solely to propose a case. Preserve
learning opt-outs. The delivery workflow may capture candidates manually; the automatic
retro worker does not yet have a candidate output field or persistence integration.

Select zero to three bounded decisions with useful coverage. Favor a new supported effect,
a meaningful correction, preserved timing, ambiguity, tool error recovery, or an ordinary
success that balances harder cases. Explain what each tests and distinguish missing editor
functionality from a model error. Do not select three near-duplicates just to fill a quota.

Record the contract's candidate evidence in the project-local document convention. Check
existing candidates for the same checkpoint/request/beat before creating a new revision.
Use evidence IDs and local references; do not copy footage or whole conversations into
shared docs. Mark missing pre-edit state, human acceptance or source evidence explicitly.
Capture useful incomplete candidates as `needs-evidence`, not runnable fixtures.

Add only a brief candidate count/IDs or none/insufficient-evidence status to the delivery
receipt. Candidate bookkeeping must not block delivery or change retrospective completion.
Do not pretend files appear in Memory UI or automatic workers will discover them.

## Prepare or refresh selected cases

When explicitly asked to curate the benchmark, review candidates against current supported
tools and the refresh policy. Select representative successes, corrections and failures.
Freeze the pre-request input packet and define deterministic invariants, permitted creative
alternatives and human-review questions. Keep outcome/reference evidence separate from
model-visible context. Preserve creator preference scope and source provenance.

Report each case as ready-for-runner, needs-evidence, capability-blocked, stale or retired,
with a reason and version. The [linked-spacing pilot](../../../docs/architecture/citadella-eval-pilot.md) supports
one bounded isolated Codex trial. Other cases still lack a general replay runner;
report that gap and do not equate structural grading with visual/audio acceptance. Preparing a case does not authorize running a
model, approving a proposal, modifying the working cut or publishing private footage.

Verify referenced files/revisions exist, the request and constraints are evidenced,
capabilities are actually exposed, input hashes are recorded for promoted cases, and no
answer leaks into the initial prompt. Written walkthroughs establish instruction routing,
not model performance. Route code/effect development to its owning implementation workflow.
