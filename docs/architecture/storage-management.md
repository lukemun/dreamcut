# Bounded storage for DreamCut

Status: authored design and implementation backlog, not a claim of app-wide enforcement. Governing [storage lifecycle contract](../standards/storage-lifecycle.md).

## Current evidence

Repository inspection on 2026-10-09:

- `src/lib/media-analysis/cache-budget.ts` defaults analysis derivatives to 20 GiB, tracks active leases/running jobs and provides eviction. `src/lib/media-analysis/worker.ts` invokes enforcement around completed job processing. This is a subsystem budget, not an app-wide free-space reservation system.
- `src/lib/local-store/prepare-waveform.ts` caches peaks by source identity and cleans its temporary directory in `finally`. The inspected owner does not itself expose a global byte budget.
- The [preview contract](../standards/preview-proxy-contract.md) distinguishes archival originals, full-quality render authority and preview derivatives. Browsing has a validated 640-pixel path; the [playback architecture](playback-rendering.md) documents the 960-pixel default transparent proxy. Preserve these owners instead of introducing a competing resize path.
- `desktop/dictation.mjs` cleans normal transcription scratch in `finally`; abrupt-process cleanup remains a gap. `desktop/package.mjs` and `make-installer.mjs` have developer-build disk preflights; those do not protect normal customer media jobs.
- `src/lib/local-store/media-thumbnails.ts` (2026-10-10) owns browsing thumbnails served by `?w=160|320|640` on the catalog and project media routes: rebuildable cache at `<projects>/.cache/thumbnails/<sha256>.webp`, keyed by recipe, source path, size, mtime and width, plus the frame index for an optional video `t` (seconds, quantized to 30 fps; added 2026-10-10 for storyboard cards, the default poster key is unchanged); LRU byte budget 512 MiB (`THUMBNAIL_CACHE_MAX_BYTES`); persistence skipped below the 5 GiB free-space reserve or when free space is unknown; atomic temp-then-rename promotion, owned-name-only eviction. Originals, proxies and render paths are untouched. Not yet counted in a shared cross-family budget.
- A focused search found no shared runtime destination-volume reservation owner across import, analysis, preparation and export. This is a scoped code audit, not proof that every writer was enumerated.

A separately inspected legacy workspace outside the repository contained two 2,641-file PNG sequences, with sampled dimensions 1080×1920 and combined logical size about 30.4 GiB. That establishes a costly representation, not which application created it or whether it is currently referenced. Its private path and media stay out of published documentation. No files were removed or rewritten.

## Chosen direction

Keep original/export quality. Make everyday preview and browsing cheaper, and bound the lifetime and simultaneous size of intermediate frames. Do not assume that lowering every source's resolution or skipping frames in tracking is acceptable.

A 1080×1920 RGBA decoded frame is 8,294,400 bytes before compression. Two streams over 2,641 frames represent roughly 40.8 GiB of decoded pixels. PNG sizes depend on content and compression; pixel-count ratios are not guaranteed disk savings. Halving both dimensions quarters the pixel count but may destroy useful mask/detail information. Streaming or batching addresses accumulation without changing image fidelity. Compressed video is the default candidate for repeated playback, subject to seek, alpha, timing and color validation.

Finished exports are creator-owned final outputs. Each one stays in its project's `renders/`
folder (existing retention rules) and is also added to one shared folder,
`~/Movies/DreamCut` on macOS or `~/Videos/DreamCut` elsewhere (`DREAMCUT_EXPORTS_DIR`
overrides), which Library → Exports lists. It is hard-linked when both folders share a volume,
so it costs no extra bytes; across volumes it is copied through a temporary name only with the
5 GiB free-space reserve. DreamCut never deletes, renames or overwrites files in that folder,
and failing to add one never fails the export (`src/lib/local-store/export-library.ts`).

The export chunk cache (`projects/<id>/preprocess/export-chunks`) is disposable and
DreamCut-owned: content-checked H.264 chunks and per-chunk sound samples from that project's
latest GPU export. Each successful export keeps only the chunks it used, so it holds about
one export's worth of bytes per project; deleting it only makes the next export render in full.

## Implementation order and owners

1. **Inventory and read-only report.** Enumerate writers in media import, media preparation, analysis stages, prepared preview, waveform/thumbnail production, render/export, dictation and model installation. Register directory ownership and classification; identify orphaned, pinned and rebuildable data without deleting anything. Report both allocated/logical sizes where supported and actual volume headroom.
2. **Shared admission service.** Implement destination-volume free-space checks and cross-process reservations under `src/lib/local-store/`. Node exposes `fs.statfs`; it supplies filesystem statistics, not a reservation or race-free guarantee. [Node filesystem API](https://nodejs.org/api/fs.html#fspromisesstatfspath-options). Integrate import/copy and the largest preparation writers first, then all job entry points. Desktop IPC should expose scoped status/actions, never arbitrary filesystem deletion.
3. **Bound scratch and stop PNG accumulation.** Migrate identified sequence-producing stages to pipes or bounded frame batches. Preserve exact frames and source timing where required. Validate outputs before promoting them, then remove only that job's temporary intermediates. Add abandoned-job recovery.
4. **Unified disposable budget.** Extend the existing analysis cache ownership/lease model to other disposable cache families; maintain one volume-level budget. Do not blindly apply the analysis unlink routine to authorities or unregistered derivatives. Upgrade migration indexes known entries before any automatic eviction.
5. **Storage UI.** Add storage usage, safe cache clearing, cache location and actionable low-space messages using the existing shared UI owners. New cache roots affect new jobs; existing locations migrate transactionally and remain readable until verified. User data retention and export approval contracts continue to apply.
6. **Release qualification.** Run the matrix below on macOS and Windows before claiming disk-pressure protection. Connect its receipts to installed-app release checks.

## Measurable acceptance

| Scenario | Required result |
|---|---|
| Long high-resolution import/analysis | Estimated/reserved peak respects remaining headroom; no unbounded full-clip image sequence |
| Repeated unchanged preprocessing | Matching artifacts reused; retained disk bytes plateau within policy |
| Several concurrent jobs | Combined reservations enforced; no each-job-observes-the-same-free-space race |
| Low disk / ENOSPC / disconnected drive | Safe stop; previous usable project/cache remains intact; no false ready state |
| Cancel / crash / restart | Own abandoned scratch reclaimed; active jobs and unrelated folders untouched |
| Full cache | Only proven rebuildable unlocked artifacts evicted; source/history/proposal media retained |
| Clear and rebuild preview | Same timing, alpha, color, seeking and audio behavior; exports retain full-quality authority |
| Shared model and source reuse | One model per installation/version; deduplication retains source provenance and portable project behavior |
| Installed app without developer tools | Policy applies in packaged macOS/Windows runtime, not only scripts or tests |

Proposed defaults and cleanup authority are explicit in the contract. No runtime defaults were changed in this authoring task. No performance or storage-saving percentage has been measured yet. The installer goal remains blocked on actual disk space; this design does not reclaim space by itself.
