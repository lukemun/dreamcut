# Deliver source images and inspect edit state — evolution

Capability: `visual-evidence`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Deliver source images and inspect edit state. Read-only inspection and derived evidence; no export or approval.

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

## 2026-10-01 — Configurable local visual analyst

Added `visual_analyze` within this family, reusing source/timeline evidence owners. Presets, explicit sampling, host-selected backends, immutable observation jobs and usage receipts replace repeated ad hoc interpretation setup. The older frame-vision shell script remains internal historical workflow, not a separate public tool. See [architecture and verification scope](../../architecture/visual-analysis.md). Synthetic Qwen image/video trials passed after enforcing per-cell output coverage; real editorial quality and other models remain unqualified for this new workflow.


## 2026-10-02 — Shared reference evidence

- **Decision:** Add one validated reference-analysis record for bounded effects and full videos. Full-video sections partition the source; occurrences link reusable effects while retaining examples. Global and effect typography reuse the measured text schema.
- **Entry point:** `pnpm check:effects --reference <record-path>` validates offline authored evidence. Whole-video routing is in video-reference-analysis; recreate-effect consumes bounded construction records. No new detector, automatic extraction, media import or approval authority.
- **Verification:** Synthetic positive and negative cases cover intervals, source bounds, duplicate IDs, unknown links, repeated effects and required typography. Content accuracy and session-wide speed remain unmeasured.


Desktop runtime adaptation: the MCP server now launches its fixed allowlist of local
TypeScript helpers with the current Node/Electron executable and tsx, rather than
package-manager scripts absent from the packaged manifest. Existing tool schemas,
allowlists and human approval/workspace gates are unchanged. Selection rejects
unknown scripts; output retention is bounded during capture; timeout terminates the
helper before returning failure. Shared runner tests cover those boundaries. This
launcher change alone does not qualify every helper’s codecs, browser/model runtime
or editorial result.

The rebuilt relocated app passed the allowed project-health instrument through its
real MCP connection with empty HOME and bundled/system-only PATH. Its initial test
extra argument was rejected by the existing harness; acceptance uses the supported
invocation without relaxing that boundary. Timeline bytes remained unchanged.
Frame-state browser/authentication and other instruments still require qualification.


2026-10-09 — Local helper descendant cleanup: the shared fixed-command runner
now owns a private POSIX process group and terminates it on timeout or helper exit,
including descendants that retain output pipes. Real nested-process fixtures cover
both paths and reject invalid/overflowed deadlines. Tool authority and result shape
are unchanged. This covers ordinary completion and timeout, not abrupt MCP/host death;
Windows retains immediate-child termination and is outside the initial desktop scope.

2026-10-09 — MCP input closure now aborts active fixed local helpers and rejects
new helper launches after closure. An AbortSignal connects transport lifetime to
the existing private-group cleanup owner; disconnected transports suppress late
responses. Tests cover a running helper with nested output-pipe descendants and
pre-aborted admission. Forced MCP termination and service-owned HTTP jobs retain
separate lifetimes and are not covered by this change.

2026-10-09 — Fixed local MCP helpers now register their private process group
with the existing IPC-lifetime crash guard. The canonical guard/watchdog live in
`mcp/`; desktop entry points delegate to them and packaging copies those canonical
modules into the host too. Forced MCP death terminates a running helper and nested
child in real source and relocated-package fixtures. Eighty targeted tests and
tool registry checks pass. No tool authority changes. Separately detached children
and service-owned HTTP operations are not covered by helper-group ownership.

2026-10-10 — `run_instrument` (audit F9): `extra_args` is now a per-instrument flag
allowlist (`mcp/instrument-args.mjs`); `--out`, `--base`, `--proposal-file` and `--option`
are refused with a reason, values reject path separators, and project ids must be folder
names. A non-zero exit is an MCP error (`INSTRUMENT_FAILED`, or `INSTRUMENT_CHECK_FAILED`
when qc/preview-readiness ran and reported failing checks) with redacted, 2,000-character
output tails. Success returns parsed JSON reports, or a capped output tail plus frame-state's
`report_path` relative to project instruments with a ready `timeline_evidence` call.
Tested in `mcp/tool-errors.test.mjs`; not yet replaced by fully typed fields
(`at_seconds[]`, `warm_renderer`) as the audit proposed.

## 2026-10-24 — shared helper cleanup

The shared local script runner now signals an owned process group at most once after successful cleanup. See [the implementation decision and regression evidence](media-intake-generation.md#2026-10-24--idempotent-helper-group-cleanup). Command and editing authority are unchanged.
