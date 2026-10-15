# Export retrospective lifecycle

The proposed [agent activity integration](../architecture/agent-activity.md#retrospective-integration)
describes an automatic checkpoint supplement alongside editorial evidence. That part
is not implemented; the chat-only delivery review below uses a separate local packet
and does not change the lifecycle or adoption rules below.

The editor and `pnpm render` use `startRender` in `render-jobs.ts`. The low-level
`renderProjectVideo` is an encoding primitive for tests and instruments, not a delivery
entry point. New delivery entry points must use the tracked job lifecycle.

With learning enabled, persist an immutable checkpoint before encoding starts:
the exact export timeline, metadata, export-only mute set, history chapters,
proposal decisions, memory events, preferences and skill versions. A checkpoint
failure blocks starting that export, rather than silently omitting its retro.

Only a durably completed render job makes an export checkpoint runnable. Retros are
manual (decided 2026-10-11, [hosted style and cloud learning](../architecture/cloud-style-and-learning.md#4-manual-retros)):
a completed export freezes its checkpoint, marks it reviewable (`queued`) and uploads
its evidence, but nothing dispatches the local retro worker on its own. A person starts
a review from Memory → Export reviews (**Run review** on a saved checkpoint, or **Review
current edit**), or the DreamCut team reviews the uploaded evidence. Memory/attention
activity only resumes a review a person already started that a restart interrupted
(a record with a prior attempt). Failed/canceled renders never produce successful-delivery
lessons. Learning and the Codex review setting remain explicit opt-outs; the Memory page
shows when review is paused. Interrupted workers retry the same checkpoint up to
three attempts, then require manual retry. Other worker failures remain visible
and manually retryable; they do not invalidate an already completed video.

The regular runner saves each schema-validated batch and synthesis pass under
`memory/retro-passes/<checkpoint-id>/`. Retry reuses a pass only when its
checkpoint revision, exact prompt/evidence, output schema and configured worker identity
match. Corrupt or newly invalid results are recomputed; failed passes are never cached.
Completion and lesson adoption still happen through the existing final validation path.
This avoids repeating completed model work without dropping evidence or raising retry
limits. Oversized indivisible evidence still fails visibly; the separate slices pilot
is not enabled by this cache. See [efficiency benchmarks and regression protection](../architecture/agent-efficiency.md).

The read-only worker receives privacy-limited projections of all recorded history
chapters, proposal outcomes, user/system events, and final clip state, in bounded
batches. It must not silently keep only the latest edits or claim to have watched
video. It should infer plausible editorial reasons from changes, corrections,
reversals and the final effective state even when no reason was written. Every new
finding includes a labeled reasoning basis, rationale, confidence and alternative
explanations. An approval establishes acceptance, not a general taste rule by itself;
an agent-written summary is not human speech. Synthesis checks proposed
refinements against the frozen skill contents. Attempt results are retained for
diagnosis; only schema-validated, checkpoint-cited findings are adopted.

Findings are not skill edits. Reusable improvements are pending candidates in
Memory → Retros. Their preview and approval use the same additive merge. Approval
is a separate human action; the worker never grants itself write authority.
An honest zero-improvement result is preferable to inventing a rule. Directly
authorized skill updates must be recorded as such, not presented as pending work.

Personal style uses promote-first learning: one evidenced creator choice can become
active locally and carry into the next applicable project. Do not require two
independent corrections. The Codex review setting defaults on for new profiles (it
gates manual runs; nothing starts automatically); preserve existing opt-outs. Persist preferences through the shared writer so STYLE.md stays
in sync. Unless the creator enables `auto_apply_preferences`, conflicting findings are suggested for reconciliation, retaining existing
active guidance and counterevidence. Discarded experiments, technical defaults, and
inactive effect parameters are not personal taste. Synthesis receives final clip
state as well as batch summaries; final effective state overrides historical settings.

September 20 attribution/inference update: wrapped editor mutation routes capture
same-origin browser requests as human, marked MCP requests as agent, and opaque
requests as unknown. This is request provenance, not authenticated identity or
authorization; browser automation shares the editor surface. Approved-proposal
snapshots preserve agent authorship and the initiating actor separately. History,
events, chapters and retrospective packets retain this attribution. Historical
unknowns are not relabeled. The project-wide assembly lease is not actor evidence.

New inference-bearing preferences can activate when high-confidence, backed by a
human-attributed cited chapter/event, and without reported counterevidence. Weak,
unknown-actor or conflicting findings stay suggested. Confidence is model judgment,
not a semantic proof; the runner must examine alternatives. Existing saved findings
without the new reasoning field retain their prior compatibility behavior. Inferred
skill improvements retain their reasoning and require the same separate approval.
No historical retro or preference is automatically rerun/migrated by this update.

The explicit profile option `auto_apply_preferences` applies future validated personal
preference findings automatically, including inferred or conflicting findings. It
preserves evidence, reasoning, scope and document history. Within one scope, later
style entries supersede earlier conflicting entries. Existing pending suggestions
are not bulk-promoted. Learning opt-outs, evidence validation, failed-export gates
and separate shared-skill approval remain unchanged.

The [slice coordinator](../wiki/retro-coordinator.md) is proposed architecture only.
Current manual dispatch and sequential-batch execution are unchanged.

Regression coverage: `editing-retro.test.ts`, `editing-memory.test.ts`, and
`render-jobs.test.ts` cover evidence retention, privacy projection, frozen
checkpoints, completion/recovery gates, no dispatch on export completion, duplicate
dispatch, pending promotion, and exact preview/approval equivalence.

## Cloud export sharing

When the profile has `learning` on and `cloud_sharing` not set to false (the default;
Memory → Settings → **Share editing history to improve DreamCut (never media)**), a durably completed
export posts its checkpoint's `buildRetroEvidence` projection to the `ingest-export`
Supabase Edge Function ([export-sharing.ts](../../src/lib/local-store/export-sharing.ts),
[function](../../supabase/functions/ingest-export/index.ts)). This is the same
privacy-limited evidence the local worker reads: no media, source URLs, local paths
or caption transcripts. The packet carries a random per-install `install_id`
(pseudonymous, not anonymous), project and job IDs, and the checkpoint revision.
Each job's outcome is recorded under `memory/cloud-uploads/`; later exports in the
same project retry failures up to five attempts. Upload failure never affects the
video or the local retro. `DREAMCUT_CLOUD_INGEST_URL=off` disables sending.

When the editor is signed in to DreamCut (Memory → Settings → DreamCut account), the
same packet goes to the account's authenticated `POST /api/v1/evidence` instead, and the
install ID is claimed by the account (`POST /api/v1/installs/claim`, at sign-in and
before the first account upload; the claim is recorded in `cloud-sync/install-claim.json`).
Signed out, packets keep the pseudonymous path. Retry semantics are the same for both.

## Review agent effort and time to a reviewable proposal

Use [agent-workflow-review](../../.agents/skills/agent-workflow-review/SKILL.md) for
first-pass correctness, elapsed time and token-efficiency questions. Its independent
[standard](agent-workflow-review.md) owns evidence and comparison requirements. Delivery
is one invocation point; explicit task reviews do not require an export. Select useful
tracks through [learning-review](../../.agents/skills/learning-review/SKILL.md), preserving
this lifecycle's opt-outs and reusing existing findings.


## Review first-proposal tuning coverage

Evaluate whether the original proposal offered the controls and ranges the creator
needed to reach the requested outcome. Follow the [control-selection audit contract](inspector-information-architecture.md#audit-tuning-and-improve-selection): distinguish
missing dials from missing capabilities, misleading labels, range limits and broken
behavior. Use final approved overrides, linked feedback and proposal revisions;
report intermediate tweak/reset/abandonment history as unavailable when it was not
captured. Do not infer satisfaction from approval or an untouched control. Route
selection lessons to open-edit-proposals and parameter-specific lessons to the owning
craft skill; UI/telemetry gaps belong to implementation work.

## Capture editing evaluation candidates

An enabled, agent-led delivery retrospective invokes
[editing-eval-curation](../../.agents/skills/editing-eval-curation/SKILL.md) to identify
zero to three reusable editing decisions under the [evaluation contract](editing-evaluation.md).
Use frozen evidence and recorded corrections; do not add another retrospective, model
trial or delivery gate. Token/cost accounting belongs to run telemetry; candidate review
captures intent, constraints, capabilities, starting state and outcome evidence.

This is a manual skill hook. The automatic worker's schema, prompts, candidate persistence,
deduplication and Memory UI are not wired yet. Do not inject candidate fields into its
existing validated output. Respect learning and worker opt-outs; disabled review does not
silently spawn a replacement. No candidate is a valid outcome.


## Chat-only tool-candidate review

During enabled delivery retros, invoke the standalone
[tool-candidate-review skill](../../.agents/skills/tool-candidate-review/SKILL.md)
in export mode. The [tool-candidate review contract](tool-candidate-review.md) owns
scope, evidence packets and chat-only presentation. This delivery hook retains learning
and agent-retro opt-outs and requires a completed export with its matching checkpoint.
Missing candidate evidence never blocks delivery. Do not switch modes to bypass an opt-out.

Independent task reviews can invoke the same skill on an explicit request without an
export. Neither mode creates automatic-worker fields, app findings, notifications,
preferences or skill changes. The existing editorial retrospective remains separate.
