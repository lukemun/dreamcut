# Measure observed calls, failures and coverage — evolution

Capability: `tool-accounting`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Measure observed calls, failures and coverage. Local diagnostics; no automatic project attribution or exactly-once claim.

## 2026-09-30 — initial capability registration

- **Observation:** Repository script/catalog audit found this capability family. This
  is code/discovery evidence, not measured editing frequency or a new runtime trial.
- **Decision:** Register existing implementation; audit remaining authoring-contract gaps incrementally.
- **Version:** Initial registry record; existing tool/recipe versions are unchanged.
- **Verification:** Catalog membership and owner/evolution paths checked by `check:tools`.
  Runtime behavior was not re-certified by this inventory.
- **Acceptance for next change:** Preserve existing authority tests; migrate recovery and accounting contracts with representative success/failure cases.
- **Evidence:** [Script audit and priorities](../script-audit.md). Private session
  traces remain outside this public log.

## 2026-09-30 — bounded tool implementation

- **Decision:** Added the shortlisted interfaces and a shared dispatch/recovery adapter;
  tool names and owners are recorded in the registry. No approval or export powers added.
- **Version:** Dispatch/error schema 1; agent preparation recipe 2. Existing tools retain
  their independent recipe versions.
- **Verification:** Focused boundary tests cover stale evidence, media state, caption
  operation generation without timeline writes, and deduplicated dispatch accounting.
  Synthetic outline and Scratchpad jobs completed and reused outputs. Full real-speech
  MFA/ASR quality and real-footage composite acceptance remain unverified.
- **Limits:** Legacy errors are not all migrated. New dispatch counts cover only the
  refreshed DreamCut MCP server, not arbitrary shell internals or all provider activity.


## 2026-10-08 — recoverable local audit and native usage reconciliation

- **Observed gap:** Bounded diagnostic capture could discard records after its storage
  budget, skip large source lines, and advance its cursor despite omission. Rotated
  OTel backups expired, so retained usage totals were not durable session totals.
  Unmetered Codex completion notices also inflated the missing-usage denominator.
- **Decision:** Remove event-storage caps and automatic OTel backup expiry; extend
  reads across large records; flush appends before cursor advancement; add archived
  rebuild/drain recovery and a separate native checkpoint report. Numeric usage is
  reconciled without persisting prose/reasoning or adding overlapping OTel totals.
- **Authority:** Existing local capture consent and repository scope; no timeline,
  approval, provider job or public upload authority. New diagnostics remain private.
- **Acceptance:** Oversized records, former-cap overflow, failed writes/retry, rebuild,
  duplicate checkpoints, counter gaps/resets, timestamp provenance and completion
  notice semantics have focused tests. Collector proof checks redaction, delivery,
  duplicate replay and restart retention. Real-session coverage is a private receipt.
- **Limits:** No exactly-once billing claim, automatic project/phase attribution or
  recovery of deleted original sources. Native Claude session token capture remains unsupported.
- **Managed workers:** Capture-enabled Codex and Claude workers persist private numeric
  usage receipts independently of the collector, including explicit unknown usage on
  failure. Chunk parsing and a fake executable integration are regression-tested.
  External adapters are not covered by these receipts. Overlapping worker, native
  session and OTel reports must not be added together.

2026-10-10 — Error-quality pass for audit findings F6–F10
(`docs/tools/audits/2026-10-10-agent-tool-usability-audit.md`). `mcp/tool-runtime.mjs`
now types failed editor responses (`httpFailure`): application `tool_error` still wins;
otherwise zod issues become `path: message` (regex bodies trimmed, UUID patterns read
"must be a UUID") with code INVALID_INPUT, and status/message select NOT_FOUND, CONFLICT,
NOT_AUTHORIZED, BUSY (429/503 or busy text), TIMEOUT (504/timeouts) or TOOL_FAILED with a
diagnostic ID. Untyped errors keep `retryable:false` except recognisable busy, timeout and
unreachable-editor conditions, which carry BUSY/TIMEOUT/EDITOR_UNAVAILABLE and
`retryable:true`. Passthrough text is redacted (projects dir → `projects`, repo → `<repo>`,
home → `~`), stack frames are dropped and text is capped at 2,000 characters. The live
server pre-checks published schemas for unknown fields (`unknownFieldHints`) and appends
rejected-field descriptions to application validation failures, matching the harness.
Validation: `mcp/tool-errors.test.mjs` (unit and live stdio server), all `mcp/*.test.mjs`,
`pnpm check:tools`, `pnpm typecheck`. Limits: routes still return untyped messages; the
cutout BUSY code is inferred from message text, not a route-owned `toolError`.

## 2026-10-24 — usage upload and capability-gap signals

- **Observed gap:** Tool totals and product signals stayed on the creator's machine, so product
  decisions rested on the developer's own usage. Work an agent did without DreamCut's tools (its own
  script, a shell command, a direct `timeline.json` edit) left no record at all.
- **Decision:** Completed days of per-tool totals (calls, failures, duration, error codes; no
  arguments or projects) and product signals upload through the editing-evidence sync under the
  existing sharing setting (`src/lib/local-store/usage-evidence-sync.ts`). Two signals were added:
  `outside_write`, recorded by the editor when project files change without a DreamCut write, and
  `capability_gap`, sent by the new core tool `capability_gap_report` when the agent works around a
  missing tool. The tool records only what the agent sends, strips paths and changes no project.
- **Version:** Product signal schema 1 (two new events); usage packet `dreamcut.product-usage.v1`.
- **Verification:** `usage-evidence-sync.test.ts` (completed days only, single upload, sharing off,
  backoff) and `outside-write-signal.test.ts` (direct edit recorded once; a server restart is not a
  write). Reporting depends on agents calling the tool; editor detection covers direct project-file
  edits only, not media an agent writes into the project.
- **Acceptance for next change:** Keep every uploaded field fixed-schema and argument-free; any new
  signal names the product question it answers in docs/architecture/desktop-data-layout.md.

## 2026-10-27 — session timelines for retros

- **Observed gap:** A retro of a long agent session needed a one-off extractor to see what the
  person asked, which calls failed and how long the agent spent writing each pasted payload. The
  activity capture normalises calls and results but drops messages, queued messages and
  compactions, and has no per-session reading.
- **Decision:** `pnpm session-timeline [<session-id|path>] [--from TEXT]` (contributor script, not
  an MCP tool) reads one Claude Code or Codex transcript from this checkout and prints a per-tool
  tally (calls, failures, characters sent, compose seconds) and a line-numbered timeline. Calls and
  results go through `normalizeActivity`, so redaction is shared; thinking is excluded. With no
  argument it lists recent sessions. The [session-retro](../../../.agents/skills/session-retro/SKILL.md)
  skill uses it.
- **Verification:** `src/lib/observability/session-timeline.test.ts` (Claude and Codex records,
  queued messages, compaction, redaction, compose time, missing start). On a real 108-minute
  session it matched a hand count of `proposal_create` failures. Large Codex logs are probed by
  their first 64 KB only.
- **Acceptance for next change:** Stay read-only and local; never write timelines outside the
  path the caller names, and keep thinking and credentials out.

## 2026-10-27 — retro evidence on a user's install

- **Observation:** The Proof-look session retro (`docs/audits/2026-10-27-proof-look-walking-man-retro.md`,
  git-ignored) could only be reconstructed from the agent's private transcript. An install kept no
  record of the selection at request time, of a generation draft, of a refusal's code, and an
  unknown-field rejection thrown before `dispatchTool` left no tool-events row at all. `tool-events/`
  was never pruned, against the storage-lifecycle bound product signals already follow.
- **Decision (owner-approved freeze exceptions A, D; E is a conformance bug):** Three product-signal
  events, ids and enums only (`mcp/product-signals.mjs`): `selection_read` on `editor_context_get` and
  `timeline_get` (item ids and kinds; a project file's id becomes a digest, never its name),
  `generation_drafted` on `generate_media` (kind, model, draft or approved; never the prompt) and
  `tool_refused` for typed non-retryable refusals that are not argument rejections (an authority gate,
  a stale id). `arguments_rejected` gains `error_code`. The unknown-field check now runs inside `dispatchTool`, so an argument rejection is one
  tool-events row with its code; the authority gates (local-media policy, human-only tools, family
  loading) still refuse before any accounting, as the code comment says. `tool-events/` and `product-signals/` share
  `src/lib/observability/day-files.ts`: 90 days / 50 MB, oldest whole days dropped when a new day
  starts, the newest day never dropped, no day file edited. The bug report (`BugReportButton.tsx`)
  offers "Attach this project's session evidence", off by default: the last 50 `memory/events`, the
  day's tool-events and product-signals rows for that project, proposal ids and statuses, the
  proposal-work attempts and the motion audit, read by `GET /api/projects/<id>/session-evidence`
  (local editor only) and listed in the dialog before Send. The outside agent's conversation is never
  included.
- **Verification:** `product-signals.test.ts` (new events keep no prompt, label, file name or price;
  summary counts), `mcp/product-signals.test.mjs` (a pre-dispatch rejection produces a tool-events row
  with `INVALID_ARGUMENTS`, and the signal carries the code), `tool-events.test.ts` (bound and
  per-day read), `session-evidence.test.ts` (one project's rows only, paths replaced, manifest
  counts). `pnpm check:editor-ui` passes; the dialog was checked on a disposable project copy.
- **Limits:** `selection_read` fires on the tool call, not on the creator's message, so a selection
  changed between the two is not seen. Refusals inside the editor that return a generic 500 still
  record `TOOL_FAILED`. The bundle names proposal ids and statuses only; the cards themselves are not
  attached. Rows that name no project (an early `editor_context_get`) are included with the project's.

