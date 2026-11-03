---
name: author-workflows
description: Design or improve multi-step workflows with explicit inputs, outputs, evidence, and recovery. Use for reusable pipelines, analysis stages, reviewers, and evaluation loops.
---

# Author a workflow

Define the output and each stage's input, owner, tools, artifact, acceptance check, and
failure/retry behavior. Begin with the smallest sequence that can do the work. Add parallel
agents only for independently useful tasks when authorized by the calling environment.

Separate expensive evidence acquisition from cheaper interpretation and recomputation:

1. Extract evidence from a source with identity, location/time, and honest unknowns.
2. Derive per-item interpretations while retaining their evidence and match basis.
3. Compute set-level measurements reproducibly from those records.
4. Produce recommendations against an explicit goal without changing descriptive evidence.

Name the phase and provenance for each output field. Cache against real input identities
and dependencies. A rule change should rerun its dependent analysis rather than silently
relabeling old evidence or reacquiring unchanged sources.

Design inspection before execution: another person must be able to tell which stage
introduced an error and which output was accepted, revised, rejected, or left incomplete.
Keep deterministic validation and semantic review distinct. A reviewer must receive the
artifact and criteria needed to judge it, and must not be treated as infallible.

Verify normal, missing-input, retry, and relevant boundary cases. Keep non-authored inputs
fixed in comparative evaluations. Report stages actually executed and remaining gaps.
Route corrections to their home under "Where lessons go" in [AGENTS.md](../../../AGENTS.md) and preserve evolution records.

## Research and freshness

Before substantive changes relying on external guidance, read the owning evolution log
and use [research-deliverable](../research-deliverable/SKILL.md) to refresh relevant vendor
guidance and original research. Keep sourced findings separate from the application
decision; map each finding to its owner and record keep/update/experiment/defer/reject.
State source-review coverage and behavioral-test coverage separately. New publication dates
do not establish local effectiveness; retire or narrow rules when verified results regress.

## Evaluation contract

Use [EVALS.md](EVALS.md) when changing routing or behavior. Record actual execution coverage separately from structure checks.
