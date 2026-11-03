# Script-to-tool review — 2026-09-30

## Scope and decision

Inventory all non-ignored files under `scripts/`, including tests, workers and support
files. Compare against the published MCP catalog and inspect shortlisted implementations,
API owners and mutation boundaries. The [inventory](script-inventory.json) contains one
record per file, its disposition, source hash and advisory direct-write marker. This is
not a line-by-line correctness audit of every script or a measured frequency ranking.
Priorities reflect the requested editing-operator goal and current capability gaps.
The audit itself did not implement tools. The first batch has since been implemented; see the status below.

Use capability families, not one script per tool. Keep specific project builders and
repair scripts internal. Existing tools already cover import, source images, cutout
preparation/corrections, proposals, assembly/auditions, spatial assessment, rhythm and
four review instruments. Improve those owners instead of duplicating their APIs.

## Implementation status

The batch is now exposed through `media_readiness`, `timeline_evidence`,
`cutout_treatment_prepare`, `speech_prepare`, `asset_preparation_status` and
`caption_proposal_compile`. Caption generation returns an operation; general speech-cut
planning remains deferred. Shared dispatch accounting and typed-error support are in place;
legacy errors and provider telemetry gaps are not all migrated.
See [implementation and verification limits](../architecture/agent-preparation-tools.md).

## First implementation batch

| Order | Capability | Existing implementation and actual gap | Implementation boundary and acceptance |
| --- | --- | --- | --- |
| 1 | **Media readiness and recovery** | `media-preparation.ts`, `prepare-media.ts` and the media-preparation HTTP route exist. Import queues preparation, but the MCP catalog lacks a general prepare/status/retry interface for existing media. | Add bounded asset preparation/status/retry, reuse jobs and show failed stages plus exact next steps. Separate playback readiness from optional content analysis; preserve opt-outs. Ready requests must reuse work; missing previews block placement. Include the known low-fps duration failure as a regression/blocker case, not a reason to weaken validation. |
| 2 | **Proposal/timeline image evidence** | `run_instrument` runs frame-state and returns reports; `source_evidence` delivers source images. `frame-state-contact-sheet.py` packages timeline report images separately. | Extend evidence delivery to consume a completed frame-state/proposal report and return bounded, labeled image pages with revision/option/frame hashes. Use manifest paths, never globs. Stale reports fail with regeneration instructions. No export and no inferred motion approval. |
| 3 | **Reusable cutout treatments** | `prepare-outline-mask.ts` and `scratchpad-cutout.ts` implement reusable cutout-derived preparation. Several narrower alpha/edge utilities also exist. | Extend the cutout capability family with supported outline/Scratchpad preparation; new immutable receipt, source clock, cached reuse, validated alpha and preview. Keep visual styling in native adjustable parameters where supported. Do not expose every distance-field/aperture helper separately; widen supported modes only when a real task warrants it. |
| 4 | **Speech preparation and caption proposal compilation** | `transcribe.ts`, `align.ts`, `captions-from-alignment.ts` and `rough-cut.ts` hold useful behavior, but the latter two have direct timeline-write paths. | Implement in two increments: transcript/MFA jobs with explicit review/unknown-word blockers; then a pure caption/cut compiler returning ordinary proposal operations. Never wrap the direct apply paths. Preserve word boundaries, source handles and approval. Test missing MFA, incorrect transcript version, rejected proposals and source-clock preservation. |

The first three support frequent preparation/review needs and the recent cutout work.
The fourth is broader engineering with a stronger correctness gate. Frequency and
latency savings still need task evidence; do not present this ordering as measured ROI.

## Shared prerequisite: reliable recovery and accounting

The new tools have a common structured
error adapter and tests for selected next actions, typed states and safe retry behavior.
Legacy failures still need migration. Registry validation does not prove that runtime
behavior. Actual MCP dispatch accounting now records call/session IDs, tool/contract
version, terminal outcome, latency and cache disposition. Background job state is separate.
This is shared infrastructure, not another editing tool or a new collector.

Current collector configuration retains `tool_name`/`tool`, `call_id`, success and duration.
The usage reader counts recognized `codex.tool_result` events. Activity capture separately
records Codex/Claude session call/result records and deduplicates its generated reports.
Do not sum those two data sources. Current limitations include missing source timestamps,
no general per-tool usage breakdown in the model-usage report, limited provider event
normalization, and no automatic project/proposal join. A shell wrapper's source text does
not prove each nested tool executed. This needs work before usage becomes a reliable
ranking signal for this registry. Private observed totals remain outside this public report.

## Defer; do not expose scripts verbatim

- **Semantic reframing:** `reframe.ts` has a reusable compiler and a dry-run mode, but
  its normal path writes the timeline. Consider a proposal adapter after the first batch;
  supported keyframe operations already exist and focal evidence must be grounded.
- **Media analysis/search:** scene, image, face and music/SFX analysis are plausible
  families. First review the existing analysis jobs/context/annotations API and settings;
  do not create a parallel annotation system or one tool per detector.
- **Audio transformations:** denoise and stem separation require a concrete editing case,
  qualified runtime and quality checks. Not a first-batch blanket CLI wrapper.
- **Music/SFX audition builders:** several are project-specific and write timelines.
  Existing `audition_create` and proposal alternatives already own comparison workflows.
- **Alpha footprints/spatial helpers:** check `spatial_assess` and preparation ownership
  before introducing another agent interface.
- **Rendering, code checks, benchmarks, seeds and walkthrough probes:** retain their
  delivery/developer/eval entry points. Export requires explicit authorization; it is
  not a shortcut for ordinary image inspection.
- **Project-named builders, one-off repairs and asset experiments:** no tool promotion.
  Extract a general primitive only when independently evidenced and contract-tested.

## Follow-through

Each implemented increment updates its capability record and evolution log, includes a
success and recoverable-failure eval, and measures the same model-plus-harness task before
and after where claiming improvement. Existing review skills continue to surface task-based
candidates in chat. This explicitly requested repository audit is a maintained engineering
artifact; it does not enable unattended tool promotion or change delivery/retro settings.
