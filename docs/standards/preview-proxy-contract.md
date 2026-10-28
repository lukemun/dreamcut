# Mandatory video preview proxies

## Generation result review

The generation Results panel plays the original generated file so creators can judge the delivered quality. It must not substitute the timeline proxy or wait for proxy preparation. Use metadata-only preload to avoid loading every full-quality result upfront. The timeline Player and its related preview surfaces continue to require validated proxies as specified below.

## Preparation precedes assembly

The required workflow is **ingest → prepare media → validate readiness → assemble → preview → export**. Playback validation is a final defense, not the place to discover or generate ordinary proxies.

Media preparation is a separate responsibility from editorial assembly and optional content analysis. Import preserves the original and establishes source identity. Preparation produces browser media for that complete source clock. Assembly consumes a ready media package and applies source windows; it must not perform transcoding or require per-clip proxy creation. Scene detection, transcription, and person detection must not determine whether proxy preparation can start or whether a completed proxy is ready.

Each ready package must identify:

| Role | Consumer | Authority |
| --- | --- | --- |
| Archival original | Recovery and reprocessing | Unchanged imported bytes and source hash |
| Full-quality picture | Render/export | Original SDR footage; for opaque HDR, a full-resolution code-value authority (`ffmpeg-hdr-code-authority-v1`) whose HLG/PQ values the grade shader decodes, made when an export first needs it (below) |
| Preview picture | Player, preload, thumbnails, frame holds, framing inspector | Measured, size-limited derivative of the picture authority |
| Speech audio | Preview speech clock and caption alignment | Timing-identical audio mapped to the same source clock; exactly one audible path |
| Preparation receipt | Assembly gate and verification | Source/recipe hashes, URLs, dimensions, cadence, duration, frame count, color/alpha validation and source-time mapping |

Source browsing may use a separately validated `browse_preview` while the package
is still preparing (or after full-quality preparation fails). This 640-pixel,
30 fps SDR derivative is for workspace playback, thumbnails and source marks only;
it never authorizes assembly, proposal placement or export. HDR browsing tone-maps
with FFmpeg `lut3d` and a cube generated from the editor's own output transform
(`src/lib/color/ffmpeg-cubes.ts`), so it matches the timeline at identity grade, with
measured size, cadence, source-duration, decode and source-hash checks, plus separate
audio-only playback.
The final package still requires preview/render parity before it becomes ready.

The detached worker prioritizes missing browsing previews between full-quality jobs
and runs below normal CPU priority. A full-quality encode already in flight is not
interrupted. Source browsing retains its preview on heavy-stage failure and provides
Retry; workspace polling updates media readiness without replacing editing drafts.
SDR media, including SDR alpha, retains the existing complete-package preparation path.
Opaque HDR becomes ready from its preview alone: `ffmpeg-hdr-code-preview-v1` decodes the original once
(VideoToolbox on macOS, software elsewhere), applies the authority's matrix-only code-value conversion
at the preview size and encodes H.264 (VideoToolbox, falling back to libx264), with SSIM parity against the
same conversion of the source decoded in software. The package then names the original as `render`, keeps
that receipt as `preview_color_management` and marks `render_authority` `deferred`; placement binds the
original with the receipt's `source_encoding`. A long 4K phone clip is placeable in minutes instead of
waiting about its own length, and tens of GB, for a full-resolution encode that placement never reads.
Export asks for the authority (`requested`) and waits; the worker makes it next to the proxy, verifies the
kept proxy against it, and moves `render` to it. Every renderer then reads the authority for clips placed
before it existed (`export-render-sources.ts`); later placements bind it directly. A failure is recorded on
`render_authority`, fails that export with the reason, and is retried by the next export. The worker checks
estimated authority size plus a 5 GB reserve against free space first.
8-bit HDR-alpha media, including a cutout cut from HDR footage, uses `ffmpeg-hdr-code-alpha-authority-v2`:
the same matrix-only code-value conversion as opaque HDR, with the source alpha merged back unchanged
on the shared 30 fps clock, encoded as VP9 CRF 18 and tagged BT.709, and the same `source_encoding`
as the footage, so the grade shader decodes a cutout and its footage alike. (It replaced
`apple-hdr-sdr-alpha-authority-v2`, which tone-mapped the cutout to SDR so it never matched its footage;
packages made by it are prepared again.)
Its receipt must prove, over every cadence-mapped frame, that the render alpha stays
within the measured tolerance of the source alpha (`ALPHA_AUTHORITY_TOLERANCE`:
soft-edge mean error at most 2/255 overall and 3/255 in any frame, no pixel off by
more than 96, and no more than 0.001% of fully clear or fully opaque pixels moved by
more than 24), plus distributed preview RGB/alpha parity. A source whose alpha CRF 18
cannot hold within that tolerance gets a lossless authority, measured the same way.
Packages made by the superseded SDR alpha recipes are prepared again when next requested. The full-resolution
VP9-alpha authority and preview remain distinct; originals remain archival. Higher-precision alpha requires a preserving recipe and must not silently
fall through an 8-bit conversion. macOS is still required for this Apple color path.


Preparation states are `imported`, `preparing`, `ready`, or `failed`. Only `ready` video assets may enter an assembly or audition. A copied file, queued job, completed analysis job, or an existing filename alone does not establish readiness. A failure must identify the failed preparation stage and permit retry without reimporting or changing timeline timing.

Ordinary trims reuse the source's complete proxy and its source handles. Cutout, stabilization, Scratchpad, and other transformations that change pixels produce a new full-quality derivative **and its preview counterpart before adoption**. A compound produces its own continuous preview while preserving the member sections for export. Source or recipe changes invalidate the affected package; generating a replacement must not overwrite URLs currently in use.

For an existing project, prepare missing packages first and adopt any required source/audio bindings through the existing reviewable edit path. Never weaken the playback guard as a migration shortcut.

Preview-cache repair is distinct from adopting a new editorial source. Loading an existing timeline queues missing local preview packages and resolves completed packages through transient `runtime_preview_*` props. The editor polls preparing packages and merges only this cache metadata, preserving in-flight edits. These props are stripped before persistence and ignored by compound signatures; render always retains the timeline's existing source authority. No proposal is required to regenerate disposable preview caches. A durable source, treatment, audio-authority or timing change still requires review.

Play is a measured readiness transition, not an optimistic command. At every initial start, seek, or remount, the authoritative Player clock stays paused until the actual mounted media settle. The ordinary path requires future data continuously for 750 ms. A faster path requires two consecutive 50 ms samples where every active decoder has `HAVE_ENOUGH_DATA`, is not seeking, has no error, and has one contiguous buffered range covering the current time through the next half-second (or the finite media end). A readiness value alone does not authorize this path. Browsers that do not report `HAVE_ENOUGH_DATA` while paused retain the ordinary path. The Player resource gate remains authoritative for effects and non-DOM resources. Sample mounted media, not only separate warmers; timeout may surface status and retry controls but never bypass readiness.

Upcoming cuts have a separate forward-readiness obligation. Resolve the same validated proxy and source window the Player will mount, begin bounded cache/decode warmup eight seconds before the boundary, and premount the actual incoming video node five seconds before it. Busy layered scenes must reserve warmup capacity for imminent video cuts so long-running backgrounds cannot crowd them out. Warmers are disposable and bounded; they never authorize an original-resolution fallback or an unbounded decoder cache.

Speech has exactly one preview clock owner. When audio is detached, the audio node owns time and every speech picture—including synchronized alpha cutouts and otherwise hidden source picture—follows it with tight drift correction. Those follower videos must not use `pauseWhenBuffering`: Remotion can stop its frame clock while independently mounted audio continues, producing the very mouth/caption drift the pause intended to prevent. Only a video carrying its own audible embedded speech may pause the shared timeline for its own buffering. Verify this with a continuous playback probe; a preload request or completed file alone is not proof.

### Implementation boundary

Managed path imports and browser uploads enqueue a dedicated preparation worker immediately. Its durable per-source records live in `preprocess/media-preparation/`; optional content analysis is not a dependency. The worker builds a complete 30 fps preview at the selected quality (640-pixel opaque and 960-pixel alpha defaults), preserves transparency, extracts preview audio when present, and uses the color-managed pair for HDR alpha and the deferred code-value authority for opaque HDR (above). It validates decode, duration, dimensions, cadence, frame count, alpha metadata and unchanged source identity before marking the package ready. Outputs use new versioned URLs rather than overwriting media in use.

The Assets shelf shows preparation and retry state. New video placement through the editor API and proposal creation requires a ready package and binds its separate render, preview and audio authorities. Existing files can be explicitly prepared with `POST /api/projects/<id>/media-preparation` (`source` is a project-media-relative path). Existing timeline bindings are not silently rewritten: adoption still requires a reviewed edit. Specialized derivative pipelines must supply their own validated pair or prepare their generated source before adoption; this import worker does not replace their source-sync receipts. The runtime measured-proxy guard remains a second defense.

Every timeline video must declare `props.preview_source_url`. The interactive player and its warmup path must never silently fall back to `source_url`. This applies to camera footage, cutouts, stock footage, generated videos, and compound previews in both workspace layouts. Still images are unaffected.

A declared `props.preview_audio_source_url` is a dedicated browser clock and therefore **must be audio-only**. Voice enhancement, normalization, denoising, stabilization, or any other treatment may retain a full-quality muxed video as render authority, but must packet-copy or encode its timing-identical speech into a small seekable audio container for preview. Pointing the preview-audio field at the full render MP4 is forbidden: even when an `<audio>` tag can play it, the browser may parse and range-read the video track and stall the Player. Readiness fails closed when a dedicated preview-audio URL contains a video stream. The only permitted muxed-clock architecture is the explicitly receipt-bound single-muxed preview defined by the readiness contract; it owns picture and sound together and does not masquerade as a dedicated audio URL.

Before mounting a video, the server measures the local proxy and supplies transient validation bound to its URL. Missing, unreadable, remote/unverified, or oversized proxies fail closed with **Prepare preview**. Declaring a URL or naming a file “proxy” does not establish compliance. Measurements are cached by file path, size, modification time, and change time. Validation is editor infrastructure, not export authority.

- Opaque video: legacy/default validation permits maximum 1280-pixel long edge and 720-pixel short edge. Explicit Full HD and 4K preparation tiers permit 1920 × 1080 and 3840 × 2160 bounds respectively, preserving aspect ratio without upscaling. The server-measured validation carries the completed package tier; a requested setting alone cannot authorize an oversized file.
- Alpha video (including when Full HD or 4K is selected): maximum 960-pixel long edge and 540-pixel short edge.
- Presenter compound generation: target maximum 640-pixel long edge.
- Preprocessing must preserve source timing and use the composition cadence, a suitable browser codec, and recorded provenance. Opaque HDR sources use the code-value authority and proxy pair, tagged BT.709 so browsers pass the HLG/PQ values through unconverted; the receipt's `source_encoding` becomes the clip's `source_color_space`. HDR alpha sources still use the SDR color-management pair.
- Warmup must resolve the same validated source and compound projection as the player.
- Upcoming video boundaries reserve a bounded eight-second warmup runway and the actual Player video node premounts five seconds early. Warmup must seek the incoming source window so it primes decoded picture data, not metadata alone.
- Export continues to resolve `source_url`, independently of preview validation.

Legacy projects receive no original-video fallback exemption. Prepare and adopt compliant proxies before playback. The readiness instrument reports missing proxy declarations as blockers. This policy does not promise that resolution alone eliminates all stalls; decoder concurrency, audio synchronization, and actual playback still require verification.

Higher-resolution tiers are prepared H.264 derivatives, not original-file playback or native-frame-rate previews. Preparation retains the completed file’s quality separately from a pending quality request so an upgrade or downgrade failure can preserve a valid previous preview. Source and export authority remain unchanged.
