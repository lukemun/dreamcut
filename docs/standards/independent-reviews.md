# Independent reviews

Review procedures are independently invokable. Video delivery is one occasion to use
them, not their owner or a prerequisite. The
[learning-review router](../../.agents/skills/learning-review/SKILL.md) selects applicable
tracks; each track also accepts a direct request. These are agent procedures, not new
background workers, app screens, scheduled jobs or automatic adoption mechanisms.

## Scope and invocation

An explicit review request authorizes reading relevant evidence and reporting findings
in chat. No export, approval, completed edit or session closeout is required. A failed
attempt is valid evidence when labeled as such. Keep the scope to the requested task,
decision, revision or chosen sessions. Do not import a whole mixed-purpose conversation
or create a project merely to enable a review.

A delivery-triggered invocation preserves existing learning/agent-retro opt-outs and
completed-export gates where applicable. Reuse existing frozen evidence and worker
findings; do not start duplicate workers or silently use standalone mode to bypass
an opt-out. Explicit standalone review does not enable automatic learning. Existing
export-worker adoption rules remain unchanged; standalone reviews do not call them.

Delivery may select tracks supported by the evidence; it does not run every review.
No optional review blocks delivery. Session-closeout hooks remain quiet until the user
explicitly finishes the session; a review is not session completion.

## Independent owners

| Track | Skill | Question |
| --- | --- | --- |
| Editorial outcomes | [editing-retrospective](../../.agents/skills/editing-retrospective/SKILL.md) | Did the work meet the request; what explains corrections? |
| Correctness, speed, tokens | [agent-workflow-review](../../.agents/skills/agent-workflow-review/SKILL.md) | Could the agent reach a useful result more reliably and efficiently? |
| Tool needs | [tool-candidate-review](../../.agents/skills/tool-candidate-review/SKILL.md) | What reusable operation needs to be exposed or built? |
| Shared instructions | [skill-review](../../.agents/skills/skill-review/SKILL.md) | Which procedure, caller or enforcement should change? |
| Optional aesthetics | [style-recipe-review](../../.agents/skills/style-recipe-review/SKILL.md) | What repeatable look and parameters form an optional recipe? |
| Personal taste/bundles | [personal-style-review](../../.agents/skills/personal-style-review/SKILL.md) | What belongs in this creator's scoped preferences or saved styles? |
| Benchmark curation | [editing-eval-curation](../../.agents/skills/editing-eval-curation/SKILL.md) | Which bounded decision is a useful eval candidate? |

## Evidence and authority

Identify exact evidence references, versions and scope. Distinguish user direction,
observed actions/results and inferred causes. Missing logs, timestamps, visual inspection,
acceptance or intermediate tuning remain gaps. Reuse a frozen checkpoint if supplied;
otherwise record the relevant revision/hash and selected event IDs. Private receipts may
live in ignored `private/reviews/`; do not publish source conversations or media. Tool
review has its own bounded packet helper; the other tracks do not yet have a generic
snapshot runner and must not invent one.

Start from `pnpm learning:evidence <project-id>` for any project worked on in the desktop
app. It lists, without copying any text:

- the project's memory events (with hashes), proposal, history and retro counts
- every desktop chat conversation, current and archived, per agent:
  - the tool-call journal: each call's tool, status, arguments and result
  - unsettled calls
  - the agent's own transcript, with its user turns and token totals

Desktop records live in the app's user-data folder (`~/Library/Application Support/DreamCut`
on macOS) and in each agent's transcript store (`~/.claude/projects`, `~/.codex/sessions`).
Read them in place; they are private and must not be committed. The desktop chat runs
without hooks, so it produces no session-closeout receipts. Its feedback is still recorded
through the same project tools.

Return a compact chat report: scope, reviewed tracks, findings or insufficient evidence,
owner, evidence, uncertainty and next verification. Deduplicate one observation across
tracks. Correctness and accepted outcomes constrain efficiency; lower tokens alone do
not demonstrate improvement. Route taste to personal stores, optional looks to recipes,
reusable instructions to skills and deterministic behavior to implementation.

Findings are not changes. A review does not approve an edit, save a personal style,
activate preferences, rewrite skills or implement tools. Separately authorized adoption
uses each owner's existing path. New review skills stay out of the app Guide catalog;
no new review findings or notifications are inserted into the app. Existing Memory and
export-worker features remain unchanged.
