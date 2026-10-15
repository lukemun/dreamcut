---
name: editor-media-preprocessing
description: Prepare proxies and reversible derived media such as stabilized video or enhanced voice for DreamCut editing.
---

# Editor media preprocessing

Read `../open-edit-proposals/SKILL.md` before timeline work.

Follow the [mandatory preview proxy contract](../../../docs/standards/preview-proxy-contract.md). Every video needs a measured, size-limited preview proxy before interactive playback. Never use original-source fallback to unblock review. Missing or oversized proxies require preparation; export retains its separate authority.

For still-frame extraction, cutout RGB, masks and other image derivatives, decode the
original full-resolution render authority at the mapped source frame. Never cut an
image out of a playback proxy. Preserve native dimensions and record the original
source hash, source frame/time, alpha recipe and any intentional transform. Proxies
remain disposable playback assets; they do not become image or export authority.

Never overwrite originals. Record provenance, keep render-authority media distinct from preview proxies, and make derivation deterministic where practical. Validate duration, dimensions, frame rate, channels, and synchronization.

Audio waveforms are source-analysis artifacts, not a side effect of browser playback. For local timeline audio (including music/SFX catalog sources), use the server waveform preparation path (`POST /api/projects/<id>/timeline/peaks/prepare`, `{ sources: [...] }`). It decodes the complete source with ffmpeg, caches by source bytes and peak recipe, and publishes to the project's peaks cache under the original source URL. Trims and repeated instances share that artifact. Browser extraction is only a fallback; it must not be the sole path for locally supported formats such as Opus. Cache repair does not change the timeline or require editorial approval. Editor reconciliation must not discard in-flight analysis merely because unrelated elements refreshed.

Run media preparation immediately after ingestion and before assembly or audition placement. Return a ready media package containing the archival source, full-quality render authority, preview picture, mapped speech-audio authority when present, and validation receipt as defined by the proxy contract. Do not wait for playback to reveal missing derivatives. Optional scene/person analysis is independent of this readiness gate.

Managed imports and uploads now enqueue this preparation automatically. Read the import result's `preparation` state or the Assets response; wait for `ready` before placement. Existing or failed sources can use the Assets **Prepare preview / Retry** action or the preprocessing-only `POST /api/projects/<id>/media-preparation` with `{ "source": "<media-relative-path>" }`. Receipts live in `preprocess/media-preparation/`. This operation does not adopt the package into an existing timeline: propose those binding changes separately. Do not run a second proxy job while its package is `preparing`.

Existing timeline preview loads also queue missing local proxies and temporarily resolve ready packages without modifying the saved timeline or export source. Let this cache-repair path finish before checking playback; preparation completion refreshes the mounted editor automatically. Do not require an editorial proposal merely to rebuild or resolve a disposable preview cache. Proposals remain mandatory for durable source, timing, treatment or audio-authority changes.

Preview transport must keep one speech clock during decoder starvation. With detached speech, audio is the clock authority; synchronized picture and alpha cutouts are tightly corrected followers and must not use video `pauseWhenBuffering`, because Remotion can stall its frame clock while the independent audio keeps advancing. Only audible muxed video owns a video buffering pause. Before initial Play, require future data to remain stable for one second on the actual mounted media. For every upcoming video boundary, reserve warmup capacity eight seconds ahead, seek the exact incoming proxy window to initiate decode, and premount the actual Player video five seconds early. Keep the warmer cache bounded and proxy-only. Do not require `HAVE_ENOUGH_DATA`; browsers may never report it while paused. A preload request or completed file alone is not readiness proof; run the continuous freeze-classification playback probe across representative cuts.

Prepare one complete source proxy for reversible source-window edits. Every requested pixel transformation must supply its full-quality result and matching preview before adoption; a finished full-quality cutout alone is not editor-ready. Keep preprocessing separate from timeline construction, and record preparation failures explicitly rather than treating a queued job as ready.

Do not preprocess an ordinary editorial trim into a new media file. Import or reference the complete available source clip, place that source-backed clip on the timeline, and store the edit as reversible `trim_start`/`trim_end` values. Preprocessing is reserved for transformations that change the pixels or signal, not for choosing when an otherwise unchanged clip begins or ends.

Derived moving cutouts must retain editable source handles around the requested visible interval whenever the original contains them (two seconds before and after by default). Put the handled derivative on the timeline as a normal source-backed clip with real `trim_start`/`trim_end`; do not generate only the exact displayed interval and thereby force a new preprocessing pass for every small entrance adjustment. The receipt remains mapped to the unchanged original source clock.

Preprocessing may create files, but adopting a derived source in the working timeline must be a previewable proposal.

## Semantic analysis is a separate stage

Use [media-intake's analysis router](../media-intake/references/analysis-routing.md) to
choose what to inspect and how densely. Proxy transcoding, waveform extraction and
deterministic detector tracks do not produce VLM descriptions. When semantic analysis
is requested, the workflow calls `visual_analyze`, polls its durable job and links the
result alongside the technical readiness receipt. It may reuse the operator's loaded
model with a separate preset/context. Do not launch it implicitly on every transcode.

Preparation readiness and annotation coverage remain distinct even when one workflow
runs both. Analysis writes derived evidence only; neither a successful transcode nor a
model description authorizes an edit, segmentation, audio enhancement or approval.
