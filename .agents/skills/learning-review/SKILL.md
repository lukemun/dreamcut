---
name: learning-review
description: Route a requested review or retrospective to independently runnable reviews of outcomes, workflow efficiency, tools, skills, style recipes, personal preferences or evaluation cases. Delivery is an optional invocation point, not a prerequisite.
---

# Route independent reviews

Read the [independent review contract](../../../docs/standards/independent-reviews.md). Work from a bounded task, decision, project revision or evidence packet. No export or finished session is required for an explicitly requested review. Report findings in chat; review alone does not authorize adopting them.

Select only the requested review questions; do not run every review for a narrow request.
For an explicit broad review, use the applicable tracks below and mark missing evidence
rather than inventing findings. Coordinate these procedures in the current chat; spawning
other agents is not required or authorized by this routing skill.

| Question | Owner |
| --- | --- |
| Did the edit meet the intent; what led to corrections? | [editing-retrospective](../editing-retrospective/SKILL.md) |
| Could we get it right sooner, with fewer tokens or retries? | [agent-workflow-review](../agent-workflow-review/SKILL.md) |
| What reusable app/tool capability is missing? | [tool-candidate-review](../tool-candidate-review/SKILL.md) |
| Which shared procedure or instruction should improve? | [skill-review](../skill-review/SKILL.md) |
| Is there a reusable optional visual treatment? | [style-recipe-review](../style-recipe-review/SKILL.md) |
| What is personal taste, or a saved personal parameter bundle? | [personal-style-review](../personal-style-review/SKILL.md) |
| Is this a useful benchmark case? | [editing-eval-curation](../editing-eval-curation/SKILL.md) |

Establish scope and evidence once, then pass references to selected tracks. Deduplicate
findings: a missing tool belongs to tool review, an ineffective procedure to skill review,
and creator-specific taste to personal-style review. Cross-link evidence instead of
making the same observation several independent recommendations.

When invoked by delivery, preserve learning/retro opt-outs, use the completed export's
checkpoint, and reuse existing editorial retro findings. Do not launch a duplicate
worker or all seven reviews. Select additional tracks only where existing evidence
supports a material question. Tool review uses export mode. Missing optional review
evidence never blocks delivery. An explicit standalone request is separate from that
hook and must not be invented to bypass an opt-out.

Return a compact combined chat report: scope, reviewed tracks, material findings,
owner, evidence, uncertainty and next validation. Report no finding/insufficient evidence
honestly. Keep token accounting separate from editorial taste. Do not schedule recurring
reviews, perform feature changes or close out a session merely because this skill ran.
