# Agent workflow review

Use the independently invokable [agent-workflow-review skill](../../.agents/skills/agent-workflow-review/SKILL.md) under the [independent review contract](independent-reviews.md). No export is required for an explicit task review.

## Evidence and improvement criteria

Retrospectives assess how the agent worked as well as what the creator liked.
The goal is a shorter request-to-reviewable-proposal loop with the same editorial
quality, evidence coverage, and approval guarantees. Review the agent's repeated
reads, tool calls, checks, retries, and preparation work for avoidable effort.
Repetition alone is not waste: changed inputs, a new review question, a failed
check, or an unresolved concern can justify doing the work again.

Use existing session/tool receipts, instrument metrics, proposal timestamps, and
failure records when available and authorized. Cite the relevant records and their
scope; timeline history alone does not establish what checks ran or how long the
agent spent. Distinguish observed elapsed time from estimates, agent/tool work
from waiting for the creator or an external service, and wall-clock delay from
summed parallel call durations. Missing execution evidence is a coverage gap,
not proof that work was efficient or unnecessary.

For each material opportunity, record:

- **Observed work and cost:** the repeated sequence, its purpose, evidence IDs,
  and measured duration/call count where available; otherwise mark cost unknown.
- **Why it may be avoidable:** what changed between runs, what new evidence each
  run supplied, and whether an applicable contract required it. Separate necessary
  validation, useful investigation, and supported candidates for redundant work.
- **Bounded improvement:** the owning skill, standard, or tool; the proposed change;
  and the conditions that require the work to run again. Examples include reusing
  valid receipts, narrowing a check to affected media, batching independent reads,
  or fixing a recurring tool failure instead of repeating its workaround.
- **Verification:** compare a comparable request before and after the change for
  time to a reviewable proposal, work performed, and correctness/coverage. Preserve
  required checks and report estimates as hypotheses until measured. A faster
  draft that causes more correction rounds is not demonstrated improvement.

Reuse evidence only when its relevant inputs, versions, scope, and review question
remain valid under the owning contract. For frame-state, unchanged pixels permit
reuse for the same question; a new question requires inspecting the frames it
needs. This review never waives mandatory preflight, alignment, source preservation,
revision validation, or human approval. If a required procedure is itself wasteful,
propose an evidenced change to that procedure and its enforcement rather than
silently skipping it.

Keep this assessment proportional: use existing evidence, record no opportunity or
insufficient evidence when appropriate, and avoid adding a fresh profiling or
review loop to every conversational edit. Workflow efficiency belongs in shared
procedures or tooling, not My Style. Improvements follow the owning review and
adoption policy; a finding does not apply its own fix.

This is review guidance, not a claim that the automatic worker currently receives
complete agent execution traces or measures proposal latency. New telemetry,
worker inputs, and automatic analysis require separate implementation. It does not
add a retro trigger or change explicit session-closeout timing.
