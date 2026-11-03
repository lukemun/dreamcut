# Agent tool authoring and evolution

Applies when adding or changing an agent-facing capability, including wrappers around
scripts. Register it in [the capability registry](../tools/registry.json), update its
capability evolution record and run `pnpm check:tools`. Existing entries marked
`legacy_review_pending` are discovery records, not certifications of this contract.

## Design around an editing outcome

Search the capability/effect catalogs before adding a tool. Reusable technical outcomes
belong in tools; named looks that compose supported operations belong in versioned
recipes, and known execution steps belong in deterministic owners. Register executable
recipes only with a bounded implementation and behavioral tests; descriptive references
must remain visibly non-executable. Use the [discovery architecture](../architecture/tool-discovery-recipes.md)
for profiles, fixed allowlists and client schema registration. Loading a tool family
changes exposure, never authority. Measure matched evals before claiming fewer tools
improve model quality, token usage or latency.

Expose a reusable operation that a tool-only editing agent needs. Prefer extending an
existing tool over overlapping names. Keep workers, tests, project-specific builders,
one-off repair scripts and arbitrary command execution internal. Share the deterministic
implementation with CLI/UI callers; do not make a shell command string the tool API.
Before implementation, record the existing owners, missing behavior, authority boundary,
expected reuse and acceptance case. A script's existence is evidence of implementation,
not measured demand or proof that it is safe to expose.

Describe when to use the tool, required inputs, units/clocks, output meanings and when
not to use it. Validate inputs at runtime; catalog schemas alone are insufficient.
Use project-scoped asset/receipt IDs, bounded windows and explicit modes. Reject unsafe
paths, stale revisions and incompatible source mappings. Keep creation, preparation,
preview, human approval and applied edits distinct. A tool never gains approval powers
because a script already writes a timeline; return supported proposal operations instead.
New editable parameters follow the editable-parameter contract.

## Portable tool schemas

One MCP catalog serves Claude, Codex and local/open-model runtimes. Every tool input
schema must register unchanged with all of them, so schemas stay within the portable
subset enforced by [tool-schema-portability.mjs](../../mcp/tool-schema-portability.mjs):

- Root `type: "object"`; inline every schema (no `$ref`, `$defs`, `$id` or nested `$schema`).
- Arrays use one `items` schema. Fixed-length lists use `minItems`/`maxItems`, never
  draft-07 tuple `items: [...]` or `prefixItems`; positions with different meanings
  become an object with named fields.
- Alternatives use `anyOf`. Express `oneOf`, `allOf`, `not`, `if`/`then`/`else` and
  dependency rules in the handler or application validator, and state them in the description.

Generated schemas pass through `toPortableToolSchema`, which losslessly rewrites
homogeneous tuples and refuses anything else. `pnpm check:tools` checks the full
catalog. A client rejecting one tool can silently drop it while others keep working
(Claude previously lost `proposal_create`; Codex needed a private projection), so
fix the shared schema rather than adding per-client adapters. Narrowing for a
bounded-grammar runtime belongs in the harness adapter and must be recorded with the run.

## Agent-usable features

A feature is not shipped to the agent until an agent can find it, understand it and
express it. Validation and renderer support alone are incomplete: on 2026-10-09 a clip
reverse field shipped with tests passing, and a local model could not use it (no field
description, no catalog route, an error that did not name the bad field).

- **Describe every field** an agent can send: meaning, units and clock, and the field to use
  instead when a natural guess is wrong (for example, speed stays positive; reverse is a separate
  flag). `pnpm check:tools` rejects an undescribed field unless it is in the frozen
  `docs/tools/undescribed-fields.json`, which only shrinks: describing a listed field requires
  removing it in the same change.
- **Add a feature case** to `docs/tools/feature-cases.json` in the same change as any new
  creator-facing feature. A new proposal prop without one fails `pnpm check:tools`. Each case lists
  at least two requests in a creator's words; each must reach its capability through catalog
  search (add `search_aliases` to the registry), name a described field, and carry an example call
  that the tool schema accepts.
- **Prove a model uses it, frontier first.** Run `pnpm eval:features --provider codex --case <id>`
  (and `--provider claude` when signed in) before handing the feature over, and report the pass rate
  and receipt from `private/eval-features/`. A majority of runs must pass. A frontier failure is a
  tool-design defect to fix in descriptions, aliases or error messages, never a reason to weaken the
  case. Then run the default local model (`pnpm eval:features --case <id>`) as a secondary check: a
  local-only failure marks a model-capability limit to record, not a reason to reshape the tool
  around the smaller model. Static checks are necessary, not sufficient. Every run is an
  activity-journal episode (its id is on the receipt); `pnpm episode <id>` shows a failed or slow
  run turn by turn, which is where to read what the model looked for and where the tool lost it.
- **Errors teach the fix.** Rejected arguments name each unknown field with the closest accepted
  ones and repeat the rejected field's description (`mcp/argument-errors.mjs`). Do not echo local
  paths, stack traces or full validator patterns.

## Results and recovery

Return compact structured facts, stable IDs and artifact references. Deliver actual
image content when visual inspection is required; a path alone is not image access.
State sampled coverage and missing evidence. Paginate large results. Keep source media,
full logs and private receipts local; never dump them into every call's response.

For new or revised interfaces, distinguish invalid input, missing prerequisite, busy,
stale input, unavailable runtime, transient failure and internal failure. Expected tool
failures use MCP `isError: true` with readable text and a structured payload when supported:

```json
{
  "schema_version": 1,
  "code": "PREVIEW_NOT_READY",
  "message": "The cutout exists; its preview is still preparing.",
  "retryable": true,
  "state_changed": false,
  "job_id": "existing-job-id",
  "recovery": {
    "action": "poll_existing_job",
    "tool": "cutout_status",
    "arguments": {"project_id": "example", "job_id": "existing-job-id"},
    "reason": "Reuse this job; do not enqueue another cutout."
  }
}
```

The MCP wrapper now preserves typed payloads supplied by application routes. Existing
errors without typed details use conservative generic recovery; migration is incremental. A successful status lookup may report a pending/failed job without
itself being a failed tool call. Distinguish lookup success from job outcome in telemetry.
Recovery must be valid, bounded and within existing authorization. Never suggest bypassing
review, disabling validation, installing a model, spending money or changing a timeline
merely to recover. Do not recommend automatic retries for deterministic bad input.
Unknown failures return a safe diagnostic ID; private details belong in local logs.

## Execution and evidence

Expensive operations need durable job IDs, status, explicit retry policy and bounded
execution. Specify restart/cancellation behavior and current limits. Repeated identical
requests must deduplicate running work and reuse verified artifacts when appropriate.
Fingerprint source bytes, relevant settings and implementation/runtime versions. Explain
what invalidates reuse; preserve versions already referenced by an edit.

Record tool name and contract version, call ID, session/run linkage, outcome, duration,
job/artifact IDs, and reused/new disposition where available. Keep a logical request,
retry attempt, status poll and background job distinct. Count actual dispatches; do not
parse requested code into supposed executions. Avoid double counting activity capture
and OTEL copies. Missing coverage remains unknown.

Test success, useful failure/recovery, duplicate requests, stale inputs and authority
boundaries. For changes claiming efficiency gains, compare the same task/harness inputs:
completion, first-attempt success, retries, calls, latency and available token usage.
A faster incorrect result fails. Link representative eval cases and record untested limits.

## Capability evolution

One log per capability family under `docs/tools/evolution/`; closely related tools share
one log. Record dated observations, source/eval references, decision, interface or recipe
version, actual validation and remaining limits. Separate implemented, proposed and
measured behavior. Keep private evidence outside Git and public summaries sanitized.
Do not append every invocation here: OTEL and activity capture own execution records.
Git remains code history; the evolution log explains why behavior changed and what proved it.

The registry validator checks discovery, file ownership and catalog coverage. It does
not establish runtime correctness or enforce recovery schemas; those require capability
tests and harness trials. Material interface changes need migration/deprecation notes.

Design rationale: [agent workflow research](../research/2026-09-16-agent-skill-workflow-design.md),
[Anthropic tool guidance](https://www.anthropic.com/engineering/writing-tools-for-agents),
and [MCP error guidance](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/errors.md).
