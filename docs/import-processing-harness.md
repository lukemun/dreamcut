# Import processing harness

## Agent-first retrieval

The creator describes footage to their agent. The agent interprets that request,
uses `video_search` to inspect subjects, summaries, sampled coverage and source moments,
then calls `library_present` with the selected project/asset handles and source hashes.
An optional moment must be one of the verified saved sample timestamps. The contract
does not depend on Codex: any compatible model client can use these same tools.

The presentation pulls up videos already registered in Library. It creates no new
Library entries or copies: the selection retains each item's owning project, imported
asset ID and source hash. It is a bounded, temporary view in an existing project's Library,
including sources from other projects. The open project shell reveals new selections;
Library shows their title, explanation and preview cards, without asking the creator
to enter a query. Selected moments load paused. Browse all videos dismisses the current
selection, guarded against erasing a newer handoff. The latest selection expires after
24 hours. If that project is not open, the tool returns its Library URL. Preparing a
selection does not prove that a browser has displayed it. Imported sources are checked
again when displayed; unavailable results produce visible warnings. No timeline,
original media, import, analysis job, approval or export is changed by presentation.

Manual Library filtering remains an optional browsing aid. The model interprets the
natural-language request; deterministic catalog retrieval remains keyword-based and
does not run a model in the UI or during playback.

Existing long-lived MCP connections must reconnect to load the new server definitions,
then refresh/register tools through the capability catalog. A running client retaining
an older tool list cannot discover the new tools merely from documentation. Fresh stdio
connections have been exercised end to end; this does not certify every model client's
schema-refresh behavior.

The read-only `video_search` MCP tool uses the same catalog projection as Library.
It accepts a query, optional project ID, offset and limit (default 8), and returns matching source
seconds with explicit sampled coverage. Source descriptions also enter project agent
context without requiring the independent detector pipeline to run first. Both
surfaces verify source identity and reject stale or corrupt description evidence.

Browser Media uploads enqueue one durable `media-process/import` job per registered asset.
This is separate from video preview preparation. Managed imports through the shared ingestion owner enqueue the same annotation workflow, including agent and generated-asset imports. Existing library items are backfilled only through an explicit Analyze whole video action.
The queue runs one job at a time per project in a detached process. A crashed in-flight job is
marked failed when the queue is next opened; retry is explicit. Closing the drawer does not cancel
a job. Media → processing shows status, errors, cancellation, and retry.

## Worker boundary

`src/lib/agent/worker-runner.ts` owns process execution, deadlines, cancellation and structured
results. Workflows own inputs, source checks and adoption. Import processing, skill maintenance,
and editing retrospectives share this runner. This is an initial shared execution layer, not a
general-purpose autonomous planner or distributed scheduler.

Codex is the default. Its signed-in CLI runs with user configuration ignored, ephemeral sessions,
and an explicit sandbox. Import jobs get a private scratch copy of the source, not write access to
the project. They invoke the `media-process` skill in import mode. Source hashes are checked before
and after; only validated data is saved by the host. No timeline mutation, approval or export is
part of this job.

Annotations are saved under `preprocess/media-process/<asset-id>/attempt-<n>/` as JSON and Markdown.
Speech additionally produces word-timed JSON, SRT, VTT and TXT. Job records under
`preprocess/import-jobs/` point to the successful artifacts. Missing skills/local transcription or
inspection tools fail visibly rather than producing empty success. Import never installs tools or
uploads originals to a transcription service. The configured agent provider receives the context
needed for inspection; this is not an offline-only guarantee.

## Configuration

- `DREAMCUT_CODEX_EXECUTABLE`: Codex executable (default `codex`).
- `DREAMCUT_MEDIA_PROCESS_SKILL`: path to the installed media-process SKILL.md; default
  `~/.agents/skills/media-process/SKILL.md`. The skill is user-installed, not bundled with this repo.
- `DREAMCUT_IMPORT_AUTOSTART=0`: disable automatic worker launch (queued jobs remain visible).
- `DREAMCUT_WORKER_EXECUTABLE`: optional trusted adapter executable instead of Codex.

DreamCut configuration uses the `DREAMCUT_*` environment-variable namespace. Variables from the
OpenEdit name (`OPENEDIT_*`) are still read as a fallback through `readEnv` in
[`src/lib/env-name.ts`](../src/lib/env-name.ts) (plain-Node twin: `mcp/env-name.mjs`); when both
are set, `DREAMCUT_*` wins.

A custom adapter receives a single JSON object on stdin: `protocol: "openedit-worker-v1"` (the
wire identifier keeps its original name so existing adapters continue to match it),
`prompt`, `cwd`, `schema` (JSON Schema), `timeoutMs`, and `access` (`read-only` or `workspace-write`).
It must enforce that access boundary or fail, and return only result JSON on stdout. Diagnostics
belong on stderr. The host enforces deadline/cancellation and validates the result. The executable
is server-owned configuration, never selectable by uploaded content or API callers. A tool-only
adapter is valid; it need not use an LLM. Configure only an adapter you trust to enforce isolation.

This version does not automatically reschedule failures, run a global cross-project concurrency
pool, or rewrite skills. Those remain separate policies. Library catalog annotation schemas are
not overwritten by import results: imported source annotations retain their own evidence and IDs. Video descriptions additionally publish source-hash context shared across projects; manually supplied Library labels remain separate.


## Video descriptions and retrieval

A video annotation is a sequence of observed frame descriptions followed by a separate
summary pass. `video-descriptions.ts` owns the sampling and validation policy: samples
at each integer source second plus the final sample 0.05 seconds before the end
(or halfway through a clip shorter than 0.1 seconds). This covers the source span,
not every encoded frame or continuous motion. A poster-only observation cannot satisfy
the contract. The host checks reported duration against FFprobe and rejects missing,
duplicate, out-of-order or out-of-range samples.

The second worker receives **all** descriptions in source order, with read-only access.
It returns the compact content summary, source-specific retrieval tags, and every input
observation ID. The host rejects omitted IDs. This establishes input coverage, not model
accuracy; frame observations and model summaries remain claims requiring appropriate
review. Summaries must not infer dialogue, identity or unseen motion from still samples.
An unavailable analyst or transcription prerequisite fails visibly; it never certifies
an incomplete clip as fully described. The bounded plan supports clips up to 9,998 seconds;
large prompts can still exceed a worker's context and fail rather than silently shrink coverage.

`video-description.json` is adopted only after validation. The source-context owner
publishes an immutable checksummed artifact and an append-only `video_descriptions`
dataset under the source SHA-256. Identical bytes imported into another project can
reuse that dataset without another worker call; completed jobs record the reused context ID. The catalog verifies source bytes, caches verification against
file identity/size/modification/change time, and refuses stale or corrupt descriptions.
Preview readiness and description readiness are independent.

Library → Videos searches summaries, specific tags, original filenames, and all saved
frame descriptions through the read-only `/api/video-search` route. The default scope
is the current project; All projects searches imported sources across local projects,
grouped by source hash. Results carry project links, description coverage, and matching
source timestamps. Matching moments seek a ready preview without changing the timeline.
Search is case-insensitive keyword retrieval, not semantic embeddings or a continuous
event detector. The modifiers beginning/start and ending/end restrict matches to the
first or last quarter of the source (for example, cat ending); cats also matches cat. Generic cultural context and negative usage instructions are excluded
from subject retrieval to avoid boilerplate false positives.

The route accepts `q`, optional `project_id`, `offset` and `limit` (1–100, default 50).
It returns `videos`, `total`, `next_offset`, and per-project read warnings. Up to 12
matching moments are included per video with the full match count; narrowing the query
retrieves other specific content. All stored observations are searched before this
presentation limit. Summaries and frame observations are never truncated into a lossy
fixed-length search string. A project read failure is visible, not an empty success.

Legacy manual labels remain useful hints but display Whole-video description pending.
The explicit Analyze whole video command queues an unprocessed source or upgrades an
old completed import job without overwriting its earlier attempt artifacts. Running
jobs deduplicate; source drift requires a fresh import. Analysis creates no timeline,
proposal, approval, export or replacement media. The existing processing drawer retains
cancel/retry controls. Synthetic regression fixtures cover missing end samples,
late-only subject discovery, cross-project reuse, source drift, and corrupt evidence.
