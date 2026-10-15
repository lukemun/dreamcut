---
name: prompt-authoring
description: Write or revise DreamCut agent instructions and image/video generation prompts. Use when authoring a reusable task prompt, skill instructions, or generation direction with explicit inputs, grounded references, and observable acceptance criteria.
---

# Author a prompt

Preserve the user's intent while making the requested output, available evidence,
constraints, and success criteria clear. This skill authors instructions; executing
the resulting task follows its own workflow and the user's authorized scope.

## Establish the prompt's consumer

Identify whether the recipient is a tool-using editing/coding agent, a read-only
analysis worker, or a media generation model. Inspect its actual input, tool, context,
and output contract. Do not promise it can see pixels, hear audio, use references,
call tools, or return structured fields that the integration does not provide.

For durable task instructions, use [skill-authoring](../skill-authoring/SKILL.md).
For generation, read [generation direction](references/generation-direction.md).
Then read the applicable craft reference: [still prompts](references/still-prompts.md)
for images and edits, or [video prompts](references/video-prompts.md) for motion,
transitions, and sequence direction. These are required branches of this skill,
not optional background reading.
For execution and iteration, use [generated-asset-workflow](../generated-asset-workflow/SKILL.md),
which owns draft review, retry decisions and delivery-quality promotion.
Model-specific capabilities and syntax must come from the current integration or
current official documentation; do not turn a provider convention into a universal rule.

## Compose useful direction

Start with the concrete outcome and artifact. Supply only the context needed to
achieve it, including asset roles, inspected evidence, user preferences, and relevant
contracts. Mark reference content as data rather than executable instructions.

Make constraints specific: what must remain fixed, what may change, and which limits
matter to the result. Use positive, concrete directions where possible. Retain explicit
prohibitions when they prevent a real mistake. Resolve contradictory requirements or
identify the conflict; adding emphasis does not resolve it.

For a sequence, name order, ownership, timing anchors, and intermediate states. Avoid
pronouns when several people or objects could own an action. For visual direction,
describe subject, action, composition, and treatment only to the extent supported by
the user's intent or inspected media. A filename is not visual evidence.

Give the agent decision criteria and a completion check. Reserve rigid steps for
operations whose ordering or mechanics are necessary. Request observations, evidence,
assumptions, and concise decisions useful to review; do not ask for exhaustive private
reasoning. Deterministic measurements and validation belong in tools and schemas.

Use a compact structure when helpful:

```text
Outcome: What to produce and for whom.
Inputs: Actual assets, roles, evidence, and relevant context.
Direction: Required actions or appearance, including sequence and scope.
Constraints: What to preserve and the material limits.
Output: Artifact or schema the consumer really supports.
Acceptance: Observable checks and how to report unresolved parts.
```

Omit irrelevant fields. Add an example only when it clarifies a consequential ambiguity;
mark example values as replaceable. Avoid repeated mandates, praise, vague quality
adjectives, and unrelated edge cases. Missing information should trigger a focused
question only when it changes the outcome materially; otherwise disclose a bounded
working assumption. Never fabricate an input, user reason, or verification result.

## Check and improve

Trace each material user requirement to the prompt. Check unsupported tool claims,
ambiguous references, scope expansion, contradictions, and invented details. Validate
structured output with the integration's schema rather than prose expectations alone.

Inspect the complete assembled prompt, including caller instructions, tool descriptions,
examples, and retrieved context. A clean template can still produce conflicting runtime
instructions. Name where the task stops and what evidence establishes completion.

When execution is authorized, evaluate the actual artifact against the acceptance
criteria. Change the smallest instruction or input responsible for the observed
failure. Distinguish prompt ambiguity from bad source material, model limitations,
and missing product capabilities; repeated wording cannot fix every failure.
Preserve enough request/version information to compare attempts without retaining
credentials or unrelated private context. Do not infer general improvement from one
successful sample or report an unexecuted prompt as tested.

For reusable runtime prompt changes, retain the baseline and compare the candidate on
the same representative inputs, including ambiguity and relevant failure cases. Record
the prompt version, model/settings, available tools, and context used. Use independent
artifact checks where available; the model's own self-check does not establish quality.
Keep one-off prompt writing proportional to the task.
