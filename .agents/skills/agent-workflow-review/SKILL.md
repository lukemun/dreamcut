---
name: agent-workflow-review
description: Review first-pass correctness, time to a useful result and token efficiency for an editing-agent task. Use independently on request or as a selected retrospective track; distinguish measured improvements from hypotheses.
---

# Review agent workflow

Read the [independent review contract](../../../docs/standards/independent-reviews.md). Work from a bounded task, decision, project revision or evidence packet. No export or finished session is required for an explicitly requested review. Report findings in chat; review alone does not authorize adopting them.

Read the [workflow review standard](../../../docs/standards/agent-workflow-review.md).
Use captured activity, actual requests/feedback, proposal revisions, outcome evidence and
OTel usage where available. Session capture omits conversation prose: obtain direction
from recorded feedback or the explicitly scoped current chat, not invented intent.

Reconstruct the bounded sequence: requested outcome, initial interpretation, tools and
inputs, first reviewable result, validation, human corrections and final known outcome.
Separate changed creative direction from preventable misunderstanding or execution error.
A first draft is not a first-pass success without relevant checks and acceptance evidence.

Review three dimensions:

1. Correctness: missed constraints, wrong tools, unsupported operations, late validation,
   incomplete control coverage and avoidable correction rounds. Identify the earliest
   point where available evidence could have prevented the mistake.
2. Time: repeated discovery/preparation, retries, serial independent work, missed caching
   and excessive waiting. Compare input identities and review questions before calling
   repeated work waste. Separate human/model/tool wait and overlapping execution.
3. Tokens: repeated unchanged context, oversized results, redundant reads and unnecessary
   model calls. Use actual response usage for a properly scoped task; never charge an
   entire mixed-purpose chat to one edit. Preserve tokenizer/provider/cache differences.
   Missing usage or request composition remains unknown; text length is not token burn.

For desktop chat sessions, run `pnpm learning:evidence <project-id>` first. Each listed
episode (`profiles/default/activity-journal/episodes/`) has one turn in order: the request,
the contract the model saw, its reasoning summaries and text, every tool call with its
arguments and result (rejections included), and the proposals it staged; outcomes and the
project's history show what the creator did next. Older turns have only the conversation
journal (tool calls in order) and the agent's transcript (user turns, token totals). Use
these to reconstruct the sequence and the cost. Use existing `pnpm model-usage --help` and activity reports; do not add session cumulative
counts to native OTel response counts. The current usage reader may have missing timestamps
and incomplete task joins; report coverage rather than claiming exact attribution. We do
not yet have an efficiency scoring engine or complete prompt-component accounting.

Return zero to three opportunities: evidence, likely cause with alternatives, owning
skill/tool/implementation, bounded change, expected benefit (measured or hypothesis),
and comparison test. Preserve baseline inputs/configuration and measure first-pass
acceptability, correction rounds, elapsed time and total attempt cost together. Do not
optimize tokens by dropping required context, quality checks or human review. Route missing
capabilities to tool-candidate-review and instruction defects to skill-review.
