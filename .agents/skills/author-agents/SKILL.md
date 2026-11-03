---
name: author-agents
description: Design or improve runtime agent behavior, tool authority, context, and completion contracts. Use when building an in-product agent or diagnosing its observed failures.
---

# Author a runtime agent

Inspect the actual runtime, tools, schemas, authorization path, and observability before
writing instructions. Use [prompt-authoring](../prompt-authoring/SKILL.md).

Define the agent's outcome, input authority, available evidence, allowed actions, stopping
conditions, and user handoff. Separate untrusted source content from operating instructions.
Enforce stable permissions and data invariants in code. Specify missing-tool and incomplete
result behavior; instructions cannot supply a missing capability.

Inspect the assembled runtime prompt with caller context and tool descriptions. Keep
model/provider settings in their implementation owner. Persist concise decisions, tool
calls, results, and validation receipts; private chain-of-thought is not an audit artifact.

Diagnose from a reproducible trace. Classify instruction, invocation, tool, evidence,
state, and measurement failures before repairing them. Compare candidate behavior against
baseline on fixed representative inputs and relevant adverse cases. Use independent
outcome checks and preserve uncertainty about untested paths.

Keep experiments separate from the default path until reviewed and verified. Record local
observations in the owning skill's evolution log and route general lessons to their home under "Where lessons go" in [AGENTS.md](../../../AGENTS.md).

## Research and freshness

Before substantive changes relying on external guidance, read the owning evolution log
and use [research-deliverable](../research-deliverable/SKILL.md) to refresh relevant vendor
guidance and original research. Keep sourced findings separate from the application
decision; map each finding to its owner and record keep/update/experiment/defer/reject.
State source-review coverage and behavioral-test coverage separately. New publication dates
do not establish local effectiveness; retire or narrow rules when verified results regress.

Check final environment state or produced artifacts independently of the completion message.
Requalify relevant behavior when the model, tool interface, or harness changes.

## Evaluation contract

Use [EVALS.md](EVALS.md) when changing routing or behavior. Record actual execution coverage separately from structure checks.
