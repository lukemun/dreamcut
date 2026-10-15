# Session learning hooks — minimal architecture proposal

Status update 2026-09-20: **minimal local pilot implemented and handler-tested; exact hook trust/runtime activation pending verification**. See [implemented closeout contract](../standards/session-learning-hooks.md), which supersedes the proposed details below where they differ. This document authorizes no skill edits, preference promotion, rendering or timeline changes.

The pilot uses a Python lifecycle adapter and an explicit TypeScript feedback CLI bridge into the existing ledger, not a new MCP tool. It links existing saved evidence first, permits no-learning/unresolved outcomes, and requests at most one repair per pending cycle. The retrospective projection now retains review-mark notes, proposal briefs/rationale when populated, and resolution reasons with provenance labels. Unknown context payloads remain privacy-limited. No historical reviews were rerun or learned preferences modified. The remaining architecture below is design scope, not a claim that every component shipped.

## Decision in one sentence

Add a small Codex adapter that makes conversational corrections accountable to the existing Editing Memory ledger; keep learning decisions in the existing retrospective and human-review paths.

The problem is not another memory database. It is losing “why I changed this” between a conversation and the edit history. A hook can require that feedback was handled; it cannot prove the agent understood taste correctly.

## Reuse, don't duplicate

DreamCut already has individually hashed memory events, frozen retrospective checkpoints, evidence-ID validation, personal preferences and reviewed skill candidates. These are the authorities to extend. [session closeout contract](../standards/session-learning-hooks.md).

- `projects/<id>/memory/events/`: durable learning evidence, including new conversation-feedback events.
- Profile `STYLE.md`: active personal taste authority; `preferences.json` retains settings, provenance and non-active/project records.
- Existing skill candidates, skill files and per-skill evolution logs: shared technique improvements and their approval trail.
- Existing export/manual retrospective: deeper synthesis. Do not start an LLM job on every tool call or every Stop.

Retain current policy: one clearly evidenced creator choice may become an active preference; conflicting evidence stays suggested. Shared skill changes still need human approval. Hooks must not silently change either policy. The earlier “all inferred preferences need review” wording in historical design notes is not the current implementation. [Current contract](../standards/export-retrospective-contract.md), [adoption code](../../src/lib/local-store/editing-memory.ts).

```text
Codex conversation + project identity
              ↓
small local hook adapter → pending turn receipt
              ↓
agent classifies feedback → existing Memory event
              ↓
Stop checks receipt exists (bounded repair if missing)
              ↓
existing export/manual retrospective
              ↓
personal style policy OR human-reviewed skill improvement
```

## Smallest implementation

One repository-owned adapter (`scripts/session-learning-hook.mjs`, proposed), one `.codex/hooks.json`, and a narrow Memory bridge. No daemon, database, dashboard, platform crawler, new general agent, or dependency on Reach&Reason.

The bridge adds a narrowly scoped `editing_feedback_record` tool backed by the existing store. It accepts a classification or evidence record, never a preference status, skill write, approval, render command, or timeline mutation. A local command entry point to the same handler lets the hook flush queued records when the editor server is unavailable. Reuse schemas/writers; do not create a parallel HTTP implementation.

### When it fires

| Event | Automatic work | Explicit limit |
| --- | --- | --- |
| SessionStart / resume | Open the private session receipt; report unresolved turns; load applicable style after project binding. | No project inferred from the foreground browser or most recently modified folder. |
| UserPromptSubmit | Register a turn ID and mark its feedback classification pending; inject a short reminder. | No full transcript copied, LLM call, or automatic style promotion. |
| PreToolUse / PostToolUse | On known DreamCut tools, bind/confirm project ID, retain tool-use and proposal/revision references, distinguish attempt from result. | No generic click/JavaScript treated as proof of a change or human approval. |
| Stop | Verify the turn's disposition and any evidence receipt; request one bounded repair for missing records. | Never export a video, approve a proposal, or rewrite a skill to satisfy closeout. |

Codex supplies lifecycle callbacks once the definitions are trusted. The model still interprets feedback and calls the bridge; the Stop check makes missing classification visible rather than relying solely on an instruction to remember it. Supported tools are not exhaustive. [Official hook coverage](https://learn.chatgpt.com/docs/hooks#tool-coverage).

## Binding and capture contract

Bind a session to a project from an explicit validated `project_id` on a known editor tool, or a user-confirmed choice. Store project identity per turn; a switch never relabels old receipts. Multiple projects in one turn get separate records. Without an unambiguous project, retain `unbound` locally and ask only when a correction needs a destination. No writes to a guessed project.

Every user turn in a bound editing session needs one disposition: `feedback_recorded`, `no_learning`, or `unresolved`. A read-only question or ordinary instruction may be `no_learning`; no artificial lesson is required. Repo coding/admin work is outside editorial capture unless explicitly linked to an editing correction. Missing context is `unresolved`, not success.

For an actual correction, the bridge records:

```text
schema_version, event_id, recorded_at
session_id, turn_id, project_id
kind: creator_preference | skill_candidate | one_off | bug | unclear
summary, attribution: agent_reported | human_confirmed
source_turn_hash, related_tool_use_ids, proposal_ids, timeline_revision
scope_hint, evidence_refs, counterevidence_refs
supersedes_event_id (optional), disposition
```

These are candidate classifications, not adopted rules. Record the user's reason separately from the agent's interpretation. A concise user-supplied excerpt can be retained only under the local feedback-capture setting; otherwise store a labeled summary and turn reference. Do not call an agent reconstruction a verbatim quote. Without retained source text or human confirmation, a hash proves neither meaning nor authorship; retrospective input must preserve that limitation and avoid treating the summary alone as a confirmed creator preference.

Example: “Those captions are too busy; use shorter phrases for this reel.” Record the correction, project and affected proposal/revision. Keep the explicit project limit. Do not infer “always use small captions” or update caption-craft automatically.

## Durability and audit trail

Use `profileDir()/session-learning/<session-id>/` for private adapter receipts and unresolved/unbound items. This is a delivery buffer, not a second preference store. A committed feedback event lives only in the existing project memory ledger; its session receipt contains the resulting event ID and payload hash.

- Derive stable IDs from session, turn, project and ordinal. Replayed callbacks return the same receipt. Same ID/different payload is a conflict, not a silent overwrite; amend with a new event and `supersedes_event_id`.
- Persist pending state before acknowledging capture. Write one immutable file per event using the existing atomic-write pattern; lock the small session index against concurrent callbacks.
- Crash between ledger write and acknowledgement: retry with the same ID and verify the same payload. Never double-learn from retry. Multiple agents preserve their own identity; they must not share an unqualified “current project” variable.
- Record classifier/adapter version and result state. Validation checks schema, destination, reference existence and idempotency, not the semantic quality of the lesson.
- Store minimal local content with private directory/file permissions. No media, credentials, full transcripts or raw tool output in the spool or telemetry. Keep pending evidence until resolved; prune only acknowledged duplicate transport payloads under an explicit retention policy. No deletion of canonical learning evidence.

Audit question: “Why did the next edit use this style?” Follow preference/skill → retrospective finding → feedback/proposal/history event → original turn reference and revision. Unknown links remain visible. Local hashes detect accidental changes, not a malicious same-user rewrite.

## Closing and learning without runaway work

Stop requests **one** documentation-only continuation when a bound editing turn lacks a disposition or its claimed ledger event is missing. Persist the repair count across continuation turns. If still missing, show an incomplete warning and retain the pending receipt. On the next session, surface it once; never loop forever or resist an explicit stop/interruption. Crash recovery uses the already-durable spool, not reliance on newer Interrupt/SessionEnd hooks.

Writing a feedback event does not immediately rewrite style or skills. It becomes evidence for the existing export/manual review. For no-export editing sessions, offer the existing manual review; do not trigger paid analysis automatically. A direct “remember this preference” request can use a separately authorized preference workflow, recorded distinctly from inference.

No lesson is a valid review outcome. Deduplicate a feedback event and its resulting proposal/history changes as related evidence, not multiple independent confirmations. Unsupported inferences remain observations. Skill approval previews the exact current-file merge and appends evolution once; new routing/default/gate changes retain the existing human approval requirement. [Skill evolution standard](../standards/skill-evolution.md).

## Boundaries and tradeoffs

- Project-local hooks apply to interactive DreamCut work, not every Codex session. Resolve the checkout dynamically; do not hard-code one developer's absolute path.
- The existing retrospective worker uses a temporary directory and `--ignore-user-config`; do not attach this adapter to it or assume it inherits global telemetry. That avoids a review generating another review of itself. [Worker source](../../src/lib/agent/worker-runner.ts).
- Hooks perform fast local checks. The collector is optional observability and is never the authority for whether feedback was saved. Local persistence does not imply offline LLM inference.
- No full conversation capture means weaker independent verification of intent. This is an explicit privacy tradeoff; human-confirmed feedback and existing proposal decisions are stronger evidence.
- Manual GUI changes remain covered by existing editor history, not magically by Codex hooks. An interrupted session may have a pending correction; that is not evidence it reached the next export checkpoint.

## Rollout and acceptance

First implement report-only behavior and review/trust those definitions before running them. Prove CLI and desktop callbacks with real receipts. Then obtain approval for the one-repair closeout mode, review any changed scripts, and re-trust changed definitions before enabling enforcement. Do not claim enforcement from installation or unit tests alone. [Trust contract](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).

Acceptance cases:

1. Known project + explicit correction → one cited Memory event; unrelated question → no-learning receipt.
2. Missing binding/project switch/multiple projects → no cross-project feedback leakage.
3. Duplicate callback, simultaneous agents, or crash after ledger write → one canonical event; conflicting replay stays unresolved.
4. Missing closeout → one real Stop repair; second failure remains incomplete without a loop. Explicit interruption is respected.
5. Existing style conflict → suggested/reviewable outcome; one-off stays scoped; agent-reported paraphrase alone never becomes a confirmed human choice.
6. Skill candidate → no skill change before human approval; exactly one evolution entry after approval.
7. Failed/canceled export → no successful-delivery lesson; existing queued review recovery remains unchanged.
8. Disabled learning/hooks, unavailable editor, corrupt record and unsupported browser path → visible limitation, no invented success.
9. No network request from hook code; sensitive fixture values absent from telemetry/receipts except an explicitly opted-in feedback excerpt.

Review status: author self-check only; no independent design review, implementation or new runtime test in DreamCut. This architecture is not a deployment authorization. Next decision: approve this narrow capture-and-closeout slice before implementation; leave automatic session retros and richer feedback UI out of v1.
