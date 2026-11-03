# Editing agent and harness authoring

Applies to new model runners, eval harnesses and changes to their tool access or prompts.
Use [tool authoring](tool-authoring.md) for individual capabilities and
[editing evaluation](editing-evaluation.md) for benchmark case promotion. This contract
is model-independent; it does not select a new model or authorize another service.

Each runnable configuration must identify:

- Task scope, model/provider settings, prompt/skill versions and tool catalog version.
- Context supplied: source windows, current revision, applicable personal preferences,
  proposal state, evidence and source authority. Mark missing inputs explicitly.
- Actual modalities: which image/audio/video artifacts reach the model. File references
  and image counts are not proof of visual interpretation.
- Tool allowlist and authority: read/preparation/proposal access, bounded assembly grants,
  sandbox/output directories, spending/network limits and human review boundaries.
- Budgets and stopping conditions: bounded attempts and duration; polling backoff;
  deterministic input failures stop until corrected. Unknown or repeated failure surfaces
  a blocker with retained work, rather than an unbounded repair loop.
- Session/run/project/proposal correlation and capture coverage. Never infer exact project
  ownership from a mixed-purpose chat or count wrapper code as completed nested calls.
- Resettable eval fixture, expected artifacts, independent checks and human visual questions.

Prefer a deterministic workflow when the choices are already known. Let the model select
supported operations and editorial intent; deterministic owners calculate geometry, timing,
validation and writes. Add specialist agents only when the task warrants them and the user
or operating instructions authorize delegation. Do not build a new agent for each script.

A production editing operator must not silently fall back to source-code edits or shell
mutation when tools are insufficient. Surface the missing capability for the coding workflow.
Development and eval modes must make their differing permissions explicit. Restoration of
an isolated test fixture cannot become permission to restore a human's working project.

Compare model + prompt + tools + harness together. Freeze their versions when comparing
runs; report successful final state, retries/recovery, calls, wall time, available token
usage and evidence quality separately. Include a missing prerequisite, a stale revision,
and a correction request alongside the happy path. Do not treat tool success as editorial
success or a proposal as human approval. Record changes in the owning capability evolution
log or harness architecture; keep execution traces private.

Existing research and partial implementations are described in
[agent workflow research](../research/2026-09-16-agent-skill-workflow-design.md) and
[model evaluation architecture](../architecture/agent-model-evaluation-plan.md).
These requirements apply going forward; they do not certify existing runners retroactively.

## Generation preparation handoff

Expose `asset_generation_prepare` to fill the visible Generate form with context,
prompt, references, model and settings. It creates no provider job and returns
`next_action: human_review`. Instruct the agent to stop and wait for explicit user
approval before generating. A preparation request is not submission approval. The
user may edit the draft and click Generate themselves, or approve it in chat, after
which the agent calls `asset_generation_submit` with their words.

This is a lightweight tool/workflow instruction, not a security boundary against
an unrestricted coding agent. No voice-confirmation system or approval-token
service is required. The restricted editing harness exposes preparation but no
provider-submit tool; the existing UI continues to own generation submission.
