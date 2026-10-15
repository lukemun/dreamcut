---
name: skill-review
description: Review whether a shared skill or instruction helped an agent achieve the task, and propose evidence-backed improvements. Runnable without delivery; use skill-authoring only when changes are authorized.
---

# Review shared procedures

Read the [independent review contract](../../../docs/standards/independent-reviews.md). Work from a bounded task, decision, project revision or evidence packet. No export or finished session is required for an explicitly requested review. Report findings in chat; review alone does not authorize adopting them.

Read the relevant skill's SKILL.md, Purpose and evolution log, the
[knowledge architecture](../../../docs/agent-knowledge-architecture.md) and
[skill evolution standard](../../../docs/standards/skill-evolution.md).

Compare the actual instruction/version available to the agent with recorded behavior
and outcome. Distinguish missing or ambiguous guidance, guidance not followed, missing
tool capability and runtime enforcement defects. Reading a file is not evidence that the
procedure was followed; current instructions may differ from those used in the task.

For a material finding, identify the smallest correct owner: repair a caller that missed
existing guidance, clarify a skill where judgment is needed, or change deterministic
validation where prose cannot enforce correctness. Keep optional aesthetics and creator
taste out of universal procedure rules. Do not create a new skill just to repeat a standard.

Return zero to three proposed changes with source evidence, exact target section, concise
candidate wording, counterexamples and a representative verification case. Mark inferred
causes and version gaps. A one-off mismatch need not become a general rule.

Stop at review unless changes are explicitly authorized. For authorized edits use
[skill-authoring](../skill-authoring/SKILL.md), preserve evolution history and verify routing
and behavior. Do not invent export evidence or use the automatic retro adoption path for
standalone findings. Existing export skill candidates retain their existing approval path.
