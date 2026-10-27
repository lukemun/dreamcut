# Agent preparation and evidence tools

The shortlist now has eight bounded MCP interfaces in addition to the existing cutout
and source-evidence tools. Their underlying owners are registered in `docs/tools/registry.json`.

| Tool | Result and authority |
| --- | --- |
| `audio_waveform_prepare` | Full-source waveform cache for active audio or verified managed imports before placement. Returns duration/peak count, with per-source recovery errors. No timeline changes. |
| `media_readiness` | Prepare/status/retry on an existing project video, using the existing preview worker. Hash verification prevents stale ready results; retry rebuilds a failed/stale package. No optional analysis enablement. |
| `visual_analyze` | Configurable local VLM observations from source samples, an image or verified timeline evidence; saved jobs and provenance. See [visual analysis](visual-analysis.md). No timeline or catalog mutation. |
| `timeline_evidence` | Six labeled image cells per page from a completed frame-state report. Checks project-media/render-code fingerprint, proposal-file identity and image hashes. Returns actual MCP image content. No export. |
| `cutout_treatment_prepare` | Cached, immutable outline-frame or Scratchpad preparation from a verified raw cutout. No timeline placement. |
| `speech_prepare` | English transcription or offline MFA alignment of sources up to ten minutes, with supplied reviewed text. Unknown pronunciations and unavailable local runtimes block alignment; no fallback or model download. |
| `asset_preparation_status` | Job state, artifact hashes, failure text and separate preview state. Lookup success is not job success. |
| `caption_proposal_compile` | Scoped `replace_captions` operations from a completed alignment job, current speech source and a caption look (or explicit style). Optional written text maps the script's written words onto the aligned spoken words as display substitutions; `word_limit` 1 to 4 and `timing_mode` cover one-word and highlighted captions. Over 250 captions it returns several operations applied in order, with linked review controls. Preserves source timing and uses the existing pause-aware grouping owner. Does not save or apply the proposal. |

Waveform preparation is synchronous, accepts 1–20 sources, and processes them sequentially.
It reuses the existing source-byte/recipe cache and in-flight extraction deduplication;
each FFmpeg extraction has a 120-second timeout. Partial success retains completed
caches. Unused external references and catalog items require a managed import first.

Speech/treatment jobs live in project `instruments/agent-preparation/<id>/`. Each request
has an input/source/implementation fingerprint and an admission lock. A detached worker
owns one job and rechecks inputs before completing. Repeat requests reuse queued/running
work or verified artifacts; failed attempts require explicit retry. Subprocesses have
30-minute timeouts (SAM 2 cutout tracking scales with frame count; see cutout preparation). There is no cancellation API. Dead worker state becomes failed on
inspection; a queued job resumes on another preparation request. Completed video output
must additionally reach preview readiness before adoption.

The existing CLI implementations remain internal. The caption and rough-cut scripts'
direct-apply paths are never called. General speech cut planning is still a future
capability; caption compilation is the implemented proposal adapter. The compiler does
not guess a style or mark a transcript reviewed. Normal proposal preflight, control
selection and human approval still follow compilation.

Frame-state now fingerprints the current timeline, metadata, referenced project media,
and local render/timeline code. Proposal reports additionally fingerprint the proposal
file and its referenced project media. Older reports without this stamp must be regenerated.
Non-project remote/catalog resources and external render dependencies are not fully
fingerprinted; inspect/re-render when they change. Stills never certify motion or sound.
Fingerprinting reads source bytes and adds I/O; no end-to-end speedup is claimed.

## Recovery and dispatch accounting

`mcp/tool-runtime.mjs` preserves typed application recovery payloads as MCP error results.
New prerequisite/staleness failures include specific actions. Legacy errors retain a
message and a conservative generic recovery response; they have not all been converted.

The MCP server posts one terminal dispatch event to `/api/agent/tool-events`, with a fresh
call ID, session/request IDs, optional explicit project ID, tool/version, duration,
outcome, job state and reuse flag. Only metadata is stored, under the local profile's
`tool-events/` directory. `pnpm tool-usage` or GET on that route returns a per-tool report;
identical call IDs are deduplicated. These counts are separate from provider OTEL and
session activity capture and must not be summed with them. No new collector is required.

Only refreshed MCP processes run this instrumentation. Interrupted processes or an
unavailable recording endpoint can lose events. Recording failure cannot retry or turn
a completed edit into a failed edit. No hidden shell operations are inferred. Retention
is currently manual; these metadata files are not governed by collector log rotation.
The existing model-usage report continues to own observed provider token accounting.

## Verification scope

Focused tests cover state reuse, path rejection, stale source/image evidence, caption
operation generation and unchanged timelines, dispatch outcomes and deduplication.
Synthetic outline and Scratchpad jobs exercised real FFmpeg processing and verified
reuse. Scratchpad preview dimensions now preserve the source aspect ratio instead of
forcing portrait output. These tests do not establish real-footage matte quality.
A synthetic spoken clip also completed local Whisper transcription and offline MFA alignment.
Full ASR/MFA quality and model-version compatibility require real-speech evaluation;
fixture-based caption compiler tests do not certify the alignment model.

The live MCP smoke delivered a frame-state sheet as image content and recorded a media-readiness dispatch in the per-tool report. No working edit was applied.
