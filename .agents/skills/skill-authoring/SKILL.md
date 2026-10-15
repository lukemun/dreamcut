---
name: skill-authoring
description: Create or revise repository-owned DreamCut skills for contributors and editing agents. Use when turning a reusable workflow into a discoverable skill or correcting an existing skill's procedure and verification.
---

# Author a DreamCut skill

Read the [knowledge architecture](../../../docs/agent-knowledge-architecture.md),
[skill index](../README.md), and [skill evolution standard](../../../docs/standards/skill-evolution.md).
Use [prompt-authoring](../prompt-authoring/SKILL.md) for writing and checking instructions.
This procedure is repository-owned and requires no agent vendor's installed skill pack.

## Choose the scope

Identify the user request that should activate the skill, its required inputs, useful
output, and what proves success. Inspect nearby skills before adding another one.
Extend an existing skill when the task and construction method are already covered.
Use the knowledge architecture to place shared rules in standards, optional looks
in style recipes, and personal preferences in their scoped store.

For a correction, identify both the owner of the contract and the workflow responsible
for invoking it. If the contract already explains the right behavior, repair the
invocation or implementation that missed it. Read the target skill's Purpose and
evolution history before deciding whether a lesson belongs in its instructions.

Choose a craft skill for a reusable procedure or a routing skill for selecting existing
procedures. A router should link to the craft guidance rather than copy it. A skill
cannot supply missing editor functionality by describing it; use
[recreate-effect](../recreate-effect/SKILL.md) when capability development is required.

## Write the smallest useful package

Create `.agents/skills/<name>/SKILL.md`, using a descriptive lowercase hyphenated name.
Required frontmatter is `name` and `description`. The description says when to use
the skill; distinguish neighboring tasks where ambiguity would cause misrouting.

Write instructions for another capable agent with access to this repository:

- State the outcome and scope, then the decisions that materially affect correctness.
- Specify required inputs, missing-input behavior, actual execution entry points,
  output artifacts, and verification. Preserve existing user authorization and stage.
- Link canonical contracts rather than restating them. Verify linked tools, commands,
  schemas, and supported behavior against current code. Label proposed capabilities.
- Use flexible guidance for creative choices and exact steps where timing, source
  identity, safe writes, or other fragile contracts require them.
- Keep observed facts, assumptions, user choices, and inferred causes distinct.
  Include actionable failure/partial states; successful execution is not automatically
  a verified result.
- Include only references, examples, and helpers that reduce repeated work or explain
  a consequential choice. Put substantial conditional detail in linked references.
  Add executable helpers when deterministic work warrants them and test those helpers.

Use portable relative links and examples with replaceable inputs. Private files,
credentials, absolute workstation paths, and globally installed vendor helpers must
not be hidden prerequisites. Declare optional dependencies and unavailable states.
Do not redistribute a third-party skill without checking its license and attribution;
write repository guidance for DreamCut's actual workflow.

Add `evolution.md` with a Purpose describing the intended outcome, boundaries,
and observable success. Record the dated observation, decision, and actual verification
using the evolution standard. Register the skill in the index and update relevant
incoming links. Optional agent-specific metadata supplements the canonical skill;
it must not be required to understand or execute it.

Keep current instructions in `SKILL.md`, lived observations in the evolution log,
and any maintained evaluation contract in an optional linked reference. Create an
evaluation companion only when there is a real suite to maintain. Runtime prompts
are implementation artifacts; their owning skill explains how to author and assess them.

## Validate routing and behavior

Check frontmatter, unfinished placeholders, relative links, and actual skill discovery.
Run the repository skill-purpose and skill-catalog checks:

```bash
pnpm exec tsx --test src/lib/local-store/skill-purpose.test.ts src/lib/local-store/editing-memory-skill-catalog.test.ts
```

Review a representative matching request, a neighboring request that should route
elsewhere, and a missing-input case. Trace what the agent would read, do, and verify.
For substantial execution procedures, use a bounded practical trial when authorized;
report a written walkthrough as a walkthrough, not a successful execution test.
Run new helpers against suitable fixtures. Do not execute media generation, timeline
changes, exports, or publication merely to validate instructions without authorization.

Apply the evolution standard's human-review requirement to relevant changes, accounting
for authorization already given in the conversation. Do not introduce a second approval
request for work the user has already authorized.

Report the skill's location, routing scope, supporting resources, checks performed,
and any execution gap. Files on disk and successful discovery do not prove every
agent session has refreshed its available-skill list or that the workflow was exercised.
