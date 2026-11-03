# Skill evolution

How repository skills are authored, changed, and recorded. Point here when doing skill work.

Use [skill-authoring](../../.agents/skills/skill-authoring/SKILL.md) for the authoring
procedure and [prompt-authoring](../../.agents/skills/prompt-authoring/SKILL.md) for
instruction quality. This standard remains the authority for the lifecycle and logs.

## How the authoring pieces fit together

1. The knowledge architecture identifies the owner: skill, standard, recipe, preference,
   runtime implementation, or project direction.
2. `skill-authoring` constructs the discoverable procedure and its verification path.
3. `prompt-authoring` checks the instructions the receiving model actually sees.
4. The skill's evolution log preserves its Purpose, observations, decisions, and evidence.
5. Review decides whether to update the procedure, fix its caller or implementation,
   or retain an observation for later. Verification measures the relevant outcome.

## Authoring conventions

- Canonical skills live in `.agents/skills/<name>/SKILL.md`. Add new skills to the [skill index](../../.agents/skills/README.md); never fork per-agent copies.
- Frontmatter carries `name` and `description`. The description is the routing trigger: write it as the "use when" condition.
- Two kinds of skill:
  - **Craft skills** do the work (video-compositing, caption-craft). They hold domain rules and verification steps.
  - **Routing skills** classify a request and delegate (motion-graphics). A routing skill holds no craft rules of its own; it points at craft skills and defines the revision and verification path.
- Standards live in `docs/standards/`; skills reference them, never duplicate them. Procedures live in their canonical skill; do not copy them into agent-specific policies.

## Evolution lifecycle

1. **Capture the observation.** What happened, which skill, what the skill said versus what was needed. Point at the retro, audit, checkpoint, or session that produced it.
2. **Decide the scope.** A local rule change stays here. Cross-product promotion requires evaluation in more than one repository; this repository must remain self-contained.
3. **Change the skill.** Keep the edit minimal and in the skill's own voice.
4. **Log it.** Add a dated entry to the skill's `evolution.md` (below). An "(Earned DATE)" inline annotation may stay as an in-text marker, but the decision record lives in the log.
5. **Verify.** Run the verification the skill names (frame-state, verify:effect-primitives, typecheck, tests). No static eval fixtures are required for craft skills: instruments plus human review are the evaluation. Grader-like skills (code-review, pr-review) may add `evals.md` later if the fixtures earn their keep.
6. **Human approval** for behavior changes with wide blast radius: routing changes, new gates, new defaults, renamed rules.

## evolution.md

The sole canonical log is beside SKILL.md, named `evolution.md` (for example,
`sound-design/evolution.md`). The folder identifies the skill. Do not create named
`<skill-name>.evolution.md`, uppercase `EVOLUTION.md`, or parallel logs.
Preserve existing records when consolidating legacy logs.

Purpose describes the desired outcome, scope boundaries, and observable success,
not a summary of today's tools or an additional source of implementation restrictions.
Retros must read this Purpose and evolution history; the frontmatter routing description
is not a substitute. Missing purpose is an explicit limitation, not permission to invent one.
Equivalent lessons from different retros are one review decision with combined provenance;
repeated wording is not independent evidence of a recurring failure.

Every skill has one. It is not a changelog written after the fact; it is the instrument of the retro ritual. It opens with the skill's purpose, which is the yardstick every observation is judged against: does this observation show the skill failing its purpose (update the skill), or is it worth recording without changing the skill (log it)?

```markdown
# <skill-name> — evolution log

## Purpose
<what this skill is for, its scope boundaries, and what good looks like.
The frontmatter description is the routing trigger ("use when"); the purpose
is the yardstick ("what it must achieve").>

## 2026-09-19
- **Observation:** ...
- **Decision:** updated | logged (what changed and why, or why not; alternatives considered)
- **Verification:** ... (for updates: what proved it)
```

Entry kinds:

- **Updated:** the observation showed the skill failing its purpose. Record what changed, why, and what verified it.
- **Logged:** the observation was considered and deliberately did not change the skill (one-off, out of scope, needs recurrence before it becomes a rule). These entries are the memory that turns a repeat into a pattern: a rule change is promoted only after it fixes a recurring failure.

Do not backfill history; the "(Earned DATE)" annotations and git history are the archive. But every skill gets its Purpose section now: without the yardstick, the retro has nothing to measure against. Seed purposes from the skill's existing description and body; the maintainer reviews them, because a purpose is a judgment, not a summary.

## What this doc does not require

- No per-skill `evals.md` by default. See step 5 above.
- No central changelog. The skill is the unit of change; its log travels with it.
