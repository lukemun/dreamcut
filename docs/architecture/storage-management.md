# Bounded storage for DreamCut

Status: authored design and implementation backlog, not a claim of app-wide enforcement. Governing [storage lifecycle contract](../standards/storage-lifecycle.md).

## Current evidence

Repository inspection on 2026-10-09:

- `src/lib/media-analysis/cache-budget.ts` defaults analysis derivatives to 20 GiB, tracks active leases/running jobs and provides eviction. `src/lib/media-analysis/worker.ts` invokes enforcement around completed job processing. This is a subsystem budget, not an app-wide free-space reservation system.
- `src/lib/local-store/prepare-waveform.ts` caches peaks by source identity and cleans its temporary directory in `finally`. The inspected owner does not itself expose a global byte budget.
- The [preview contract](../standards/preview-proxy-contract.md) distinguishes archival originals, full-quality render authority and preview derivatives. Browsing has a validated 640-pixel path; the [playback architecture](playback-rendering.md) documents the 960-pixel default transparent proxy. Preserve these owners instead of introducing a competing resize path.
- `desktop/dictation.mjs` cleans normal transcription scratch in `finally`; abrupt-process cleanup remains a gap. `desktop/package.mjs` and `make-installer.mjs` have developer-build disk preflights; those do not protect normal customer media jobs.
- `src/lib/local-store/media-thumbnails.ts` (2026-10-10) owns browsing thumbnails served by `?w=160|320|640` on the catalog and project media routes: rebuildable cache at `<projects>/.cache/thumbnails/<sha256>.webp`, keyed by recipe, source path, size, mtime and width, plus the frame index for an optional video `t` (seconds, quantized to 30 fps; added 2026-10-10 for storyboard cards, the default poster key is unchanged); LRU byte budget 512 MiB (`THUMBNAIL_CACHE_MAX_BYTES`); persistence skipped below the 5 GiB free-space reserve or when free space is unknown; atomic temp-then-rename promotion, owned-name-only eviction. Originals, proxies and render paths are untouched. Not yet counted in a shared cross-family budget.
- `src/lib/local-store/visual-catalog-cloud.ts` (2026-10-27) owns the shared visual catalog clips downloaded from DreamCut Cloud: rebuildable cache at `<profile>/cache/visual-catalog/<file>`, bounded by the catalog (at most one copy of each listed file, about 0.45 GB for the current 29 clips); files the catalog no longer lists and temporary files of ended processes are removed before each download. A download needs the file size plus the 5 GiB free-space reserve, streams to a temporary name while hashing, and is renamed into place only after its SHA-256 matches; ENOSPC and failed checks leave nothing behind. The SFX cache (`sfx-catalog-cloud.ts`, `<profile>/cache/sound-catalog/`) shares the download step (`catalog-cloud-download.ts`) with a 256 MB reserve and no pruning. Neither is yet counted in a shared cross-family budget.
- Measured 2026-10-21 across 127 local projects: 15 GB of original sources had grown to 127 GB.
  Cutouts were 42 GB, encoded as lossless VP9 (about 615 Mb/s for 4K phone footage, 25 times its
  HEVC source). `media/.prepared` was 34 GB, of which 23 GB were render authorities (SDR conversions
  of HDR sources, and lossless HDR-alpha authorities whose receipt proves exact alpha bytes). The
  rest was mostly retained browsing colour stages and superseded previews.
- Cutout authorities (`custom-cutout.ts`, scratchpad outlines) now encode at VP9 CRF 18, about 31 Mb/s
  at 4K; the measurements are recorded in the [cutout evolution log](../tools/evolution/cutout-preparation.md).
  The SAM 2 masks stay lossless as evidence, so corrections re-encode from source and masks.
- HDR-alpha authorities (`apple-hdr-sdr-alpha-authority-v2`, 2026-10-22; `ffmpeg-hdr-code-alpha-authority-v2`
  since 2026-10-26, same encoding) encode at VP9 CRF 18 and
  prove alpha within a measured tolerance instead of by exact hash, about 14 times smaller (262 MB
  to 18 MB for a 6.6 s 4K cutout). Existing v1 packages keep their lossless files until re-prepared.
- Preparation (`prepare-editor-media.ts`) now supersedes its own earlier generations once a package is
  ready. It retires the full-resolution browsing colour stage, reuses the browsing audio track and
  removes earlier files under the source's `.prepared/<recipe>/<hash>/` that no record in any project
  names (`retireSupersededPreparation`, `media-references.ts`). A generation a job never published
  (failure, or a quality change mid-job) is removed. A render authority any timeline, history, proposal
  or evidence record names stays. The scan reads every project's JSON records, about 2 s for 6.9 GB.
- Preview audio clocks (`ensurePreviewAudioClock`, `media/audio-effects/*.preview-audio.m4a`, 2026-10-25)
  are keyed by the treated file's path under the projects root plus its size, whole-millisecond mtime
  and recipe, so moving the projects folder or a profiling clone reuses them. Before that the key was
  the absolute path, and each move left one copy behind (6 orphans, 10.6 MB, on one measured project);
  those are not removed. A clock found under its old absolute-path name is hard-linked to the new name,
  adding no bytes, because timelines may store the old name.
- Audio treatment outputs (noise reduction, voice enhancement, loudness, detach and reversed preview
  sound under `media/audio-effects/`, 2026-10-25) use the same relocatable key, now with the mtime
  rounded to the millisecond (fs.cpSync copies land within a microsecond of it on either side).
  Older names (absolute-path keys, and clocks keyed with a truncated mtime) are hard-linked, never
  removed. Each treatment that analyses audio keeps a small `<name>.<ext>.analysis.json` receipt
  (noise window, loudness measurements, the output's size and mtime), so a cache hit runs no FFmpeg.
  On 2026-10-25 21 files (1.03 GB) across 6 projects were named by no project JSON record, an upper
  bound that includes runtime-only preview clocks; none were removed.
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

Export pages' Google Fonts (2026-10-26) are a rebuildable cache owned by `src/lib/render/render-font-cache.ts`
at `<profileDir()>/cache/render-fonts/`: one file per stylesheet (keyed with the browser's user agent,
refetched after 30 days) or font file (keyed by its versioned URL), capped at 64 MiB with least-recently-used
eviction, and not written below the 5 GiB free-space reserve. Deleting it only makes the next export
download its fonts again.

The export chunk cache (`projects/<id>/preprocess/export-chunks`) is disposable and
DreamCut-owned: content-checked H.264 chunks and per-chunk sound samples from that project's
latest GPU export. Each successful export keeps only the chunks it used, so it holds about
one export's worth of bytes per project; deleting it only makes the next export render in full.

The preview proxy probe receipts (`projects/<id>/preprocess/preview-proxy-probes.json`) are a
rebuildable cache owned by `src/lib/local-store/preview-proxy-validation.ts`: successful ffprobe
results keyed by a hash of the proxy path, its size, mtime and the probe version, at most 512
entries (a few KB). Paths are hashed so the proxy cleanup scan does not count them as references.
Deleting the file only makes the next timeline read probe each proxy again.

The edit chapter heads (`projects/<id>/preprocess/edit-chapter-heads.json`) are a rebuildable
cache owned by `src/lib/local-store/editing-memory.ts`: for each history snapshot, its chapter
without the clip changes, which editing memory, feedback coverage and the paged memory page read
(time, operation, category, summary, start, attribution, linked proposal and feedback ids, change
counts and the four header fields its label is built from; labels themselves are computed live),
keyed by the snapshot's name, size, mtime, its readable predecessor and a version. It lists only
snapshots still in `history/`, at most 10,000 (a few hundred bytes each; 61 KB for 129
snapshots), and is skipped above that. The edit chapter changes (`preprocess/edit-chapter-changes/`,
same owner) hold each chapter's clip and context changes, one file per snapshot that yields a
chapter, which the full memory view, export checkpoints and chapter detail read; a file is used
only when its stat key, predecessor and version match its head. Files for removed snapshots are
deleted on the next rebuild, writing stops at 256 MiB per project or below 5 GiB free on the
volume (57 MB for 52 chapters of ~8,000 captions; growth is bounded by `history/`), and the
remaining chapters are then diffed from history. Without a file, chapter detail diffs just that
snapshot and its predecessor. History stays the authority; deleting either cache only makes
the next read parse the snapshots again.

## Implementation order and owners

1. **Inventory and read-only report.** Partly implemented (2026-10-21): `pnpm storage-report [project-id ...] [--json]`
   (`src/lib/local-store/storage-report.ts`) classifies every file under each project's `media/` as
   referenced (original, edit record, current render authority or evidence-only), rebuildable (a
   current package's preview, audio or browsing file whose source is available) or orphaned (named by
   no record in any project). It sizes the other project folders by owner and reports volume headroom.
   It decides from records, never from folder or file names, and deletes nothing. Still to do: the
   writer registry below, and classification inside `analysis/` and `instruments/`. Enumerate writers in media import, media preparation, analysis stages, prepared preview, waveform/thumbnail production, render/export, dictation and model installation. Register directory ownership and classification; identify orphaned, pinned and rebuildable data without deleting anything. Report both allocated/logical sizes where supported and actual volume headroom.
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
