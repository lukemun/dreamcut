# Tool-candidate review

The [tool-candidate-review skill](../../.agents/skills/tool-candidate-review/SKILL.md)
owns evidence selection, comparison against current tools and chat presentation.
The goal is to identify reusable operations a future tool-only editing agent needs,
not to reproduce every action taken by a coding agent.

## Invocation and authority

- **Standalone:** an explicit task-review request, with a bounded task ID/description
  and optional project. No export or checkpoint is required. This read-only review is
  independent of automatic learning/retro settings; it never enables them. Do not
  trigger it merely because a session ended, capture is enabled or a delivery hook is off.
- **Export:** the delivery skill's enabled retrospective hook. Learning and agent retros
  must be enabled; a completed export and matching checkpoint are required. Missing
  evidence never blocks delivery. Do not silently downgrade this to standalone mode.

Both modes select exact calls rather than import an entire chat or infer ownership from
its last open project. Exclude unrelated development. Record relevance as agent attribution,
not a user quotation or causal proof. Existing tools, missing wrappers, genuinely new
capabilities, one-off work and uncertain investigations are distinct outcomes.

## Evidence and output

`pnpm tool-candidates --selection <private-json>` prepares export evidence;
add `--standalone` for an explicitly requested standalone review. The selection JSON must
match that mode. `pnpm activity-retro` remains a compatible command alias. The helper
joins selected results and rejects missing calls, duplicates and ambiguous result identity.
Missing results remain unknown; capture gaps and truncation remain visible.

Content-addressed packets live under the workspace's private activity capture directory:
`tool-candidate-evidence/<task-id>/` for standalone or
`retro-evidence/<project>/<checkpoint>/` for exports. They freeze selected records,
not a live log reference. New evidence produces a new packet; old packets/checkpoints
are never rewritten. Standalone packets cannot claim a checkpoint. Export packets may
include delivery verification after their checkpoint and explicitly identify that limit.
No automatic expiry or retention pins are implemented. These packets remain private.

Review happens in the current chat, without another model/service being invoked. Cite
packet and event IDs for zero to three useful candidates. Include the outcome/workaround,
existing tool coverage, proposed bounded inputs/outputs and an acceptance check. Do not
call every shell command a feature gap or infer execution from code text alone.

Do not create editor UI entries, Memory findings, notifications, preferences or skill
changes. Candidate discussion does not authorize implementation. The helper freezes
facts; the skill performs the review. This is not unattended candidate generation.
