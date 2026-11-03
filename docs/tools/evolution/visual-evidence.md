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
- **Entry point:** `pnpm check:effects --reference <record-path>` validates offline authored evidence. Whole-video routing is in video-reference-analysis; template-authoring consumes bounded construction records. No new detector, automatic extraction, media import or approval authority.
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

## 2026-10-27 — Proposal files may be stored proposal records

- **Observation:** In one session `pnpm frame-state <id> --proposal-file projects/<id>/proposals/<proposal>.json` refused the stored record ("Unrecognized keys: proposal_id, created_at, status, proposal, …"), and the usage line did not list `--proposal-file`. The agent extracted `.proposal` with Python and reran.
- **Decision:** `frame-state` and `render-preview` read either a proposal or a stored record (`src/lib/agent/proposal-file.ts`); the usage lines name both.
- **Verification:** `src/lib/agent/proposal-file.test.ts`.

## 2026-10-28 — frame-state draws a 25 fps project's frames from the right moment

- **Observation:** Checking a Speed Entrance & Exit card on a 25 fps project, frames at 1.64–1.72 s showed the standing pose although the report listed only the exit clip there. frame-state numbered frames at the project's rate (`frameFor`) but gave the still renderer no fps, which then counted at 30: frame 43 meant 1.72 s to the report and 1.43 s to the renderer. Every frame of a non-30 fps project was drawn early, and the still cache kept those pixels.
- **Decision:** `stillComposition` (src/lib/instruments/frame-state.ts) builds the renderer's composition with the project's fps and duration in those frames; scripts/frame-state.ts uses it.
- **Verification:** `frame-state.test.ts` (1.72 s at 25 fps is frame 43 and the composition counts 25); re-rendered, the frames show the walking pose leaving at 1.64 s and blurred at 1.68 s. Earlier frame-state evidence from 25 fps (or other non-30) projects showed the wrong moments and should be re-rendered before it is trusted.

## 2026-10-28 — frame-state draws HDR footage as the editor shows it

- **Observation:** On an iPhone HLG take, frame-state showed the live footage far redder than its cut-outs (face 170, 75, 68 against 175, 119, 101; a correct HLG→SDR conversion gives a red/green ratio near 1.5, the live frame 2.27). The original walk with no card was just as red. The clip's original `.MOV` is its render source until the full-resolution authority is made at export; the browser tone-maps that file itself and the grade shader then decodes it as HLG a second time. The editor previews from the code-value proxy and export builds the authority first, so only frame evidence was wrong, and it reported a colour jump at every hop that the creator would not see.
- **Decision:** `frameCheckRenderSources` (src/lib/local-store/export-render-sources.ts) draws a clip's authority once it exists and otherwise its code-value preview proxy; frame-state uses it and names proxy-drawn sources in `limitations`.
- **Verification:** `export-render-sources.test.ts` (deferred authority draws the proxy, a made authority draws itself, SDR footage untouched, timeline unchanged). Re-rendered, the last live frame and the first cut-out frame match (face 177, 119, 101 against 175, 119, 101). Frame evidence from HDR originals before this change showed oversaturated colour and should be re-rendered before colour is judged.

## 2026-10-28 — render-preview draws HDR footage as the editor shows it too

- **Observation:** The frame-state HDR fix above left `scripts/render-preview.ts` (workshop
  previews and Templates demos) drawing HDR originals the old way, so an iPhone take would turn
  over-red there as well (in a session retro that is not part of the repository).
- **Decision:** render-preview picks sources with `frameCheckRenderSources`, like frame-state,
  and its receipt lists `hdr_drawn_from_preview_proxy`.
- **Verification:** `scripts/preview-render-sources.test.mjs` requires both scripts to draw from
  those sources (fails on HEAD's render-preview); `export-render-sources.test.ts` covers the
  helper. No preview was rendered: that would render the creator's project.

## 2026-11-02 — reference_match: frame-match a reference against its takes and a candidate

- **Observation:** Rebuilding the course effect Cup Jump depended on knowing which source windows, speeds and layers the course's finished demo used. No tool could measure that. Eyeballing had given an earlier effect (House Pond) a take start 0.62 s too early, so the windows were measured with a private Python script instead (capability gap signal db909acc).
- **Decision:** `reference_match` (visual-evidence family). It compares grayscale frames on a 108-px-wide grid. Owner: `src/lib/media-analysis/reference-match.ts`; route: `analysis/reference-match`.
  - `mode: takes` reports, per region, which take and take frame each reference frame shows, as segments with source seconds and a fitted speed. Runs that fit one straight line are one segment. Others split where the two sides fit best, taking the earliest split on a tie. A still region is one static segment: its frames tie with many take frames and it splinters into static pieces.
  - `mode: candidate` compares a frame-state report's stills with the reference at the same times, per region. It returns a timing offset per still and a side-by-side image.
  - Results are cached under the project's instruments folder by input hashes. The tool is read-only.
- **Verification:**
  - `reference-match.test.ts`: 1× then 1.5× then a cut; separate regions; unmatched frames and still plates; refused tiny regions.
  - On the Cup Jump course demo against its three takes (disposable copy `cup-jump-speedstep-check`), the tool found the whole construction unaided in 1.3 s:
    - top of frame: jump take 3.5–4.6 s at 1×, then 1.5×, cut at 1.367 s to the splash take from 1.633 s;
    - cup: a static clean-plate cup;
    - bottom: the splash take from 0.267 s throughout.

    These match the private script's findings.
  - Candidate mode on the one-clip Cup Jump card's frame-state report: all 13 stills at timing offset 0; the 1.5× frames read higher in the top region.
  - Registry, schema portability, agent parity and feature checks pass.
- **Limits:**
  - Agent sessions started before this change see the tool after their MCP server restarts (tools load at startup).
  - Grayscale identity and timing only (no colour, sound or motion between frames).
  - Where a speed change starts can read one frame either way.
  - Candidate mode reads frame-state reports; `run_instrument` renders a pending card by id since the entry below.

## 2026-11-02 — run_instrument renders a pending card by id

- **Observation:** Agents could not measure a card's preview through MCP, because `run_instrument` refused `--proposal-file` and `--option`. Four skills (color-grading, effect-authoring, product-walkthrough, video-compositing) recorded this as a parity gap and pointed at the `pnpm frame-state` CLI. It also blocked `reference_match` candidate mode for agents.
- **Decision:**
  - `frame-state` accepts `--proposal <saved proposal id>` with an optional `--option`. It renders that pending card in this project, as its preview shows, including the dial tuning the creator saved. The report's `preview` records `proposalId` and `tuning`.
  - `run_instrument` allows `--proposal` and `--option`, checked against an id pattern. File paths (`--proposal-file`, `--out`, `--base`) stay refused.
  - Resolved cards are refused: measure the timeline instead.
  - The four skills now name the MCP call, and their recorded gaps are removed (agent parity: 0 violations, 13 recorded gaps).
- **Verification:**
  - `mcp/tool-errors.test.mjs` covers the new flags and the refusal of a path as an id.
  - On the disposable Cup Jump copy, `proposal_create` on the stable editor staged the one-clip speed-step card with no dial failures and with the new splash Start dial. `frame-state --proposal <id>`, with the exact arguments `run_instrument` builds, rendered it. The stable editor's `reference_match` candidate route graded all 10 stills at timing offset 0 and returned the side-by-side image.
  - With a saved tuning on the disposable card (first part at 2×), the render followed the tuning (`preview.tuning` recorded it). `reference_match` flagged the jump running 13–15 frames ahead of the demo, its search limit; the tuning was then reset to none.
  - Not yet checked: the MCP `run_instrument` call itself in a restarted session.
