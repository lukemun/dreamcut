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
