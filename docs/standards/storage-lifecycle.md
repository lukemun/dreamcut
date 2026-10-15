# Storage lifecycle and disk-pressure safety

Status: required design contract for new storage-producing work; shared runtime enforcement is not yet implemented. See [implementation plan and current coverage](../architecture/storage-management.md). This document does not authorize deleting existing user data.

## Ownership before cleanup

Every durable output needs an owner and a declared lifecycle:

| Class | Examples | Deletion policy |
|---|---|---|
| User/project authority | Originals, managed imports, generated media, approved full-quality derivatives, timelines, metadata, history, proposal assets, recipes | Never automatic cache eviction. Preserve references, audit and recovery guarantees. |
| Rebuildable cache | Validated preview proxies, browse previews, thumbnails, waveform peaks, analysis images | Eligible only with a proven available source/recipe, no active lease and no authority/reference obligation. Invalidate readiness before regeneration. |
| Job scratch | Decoded batches, intermediate encodes, temporary microphone recordings, failed partial outputs | Bounded job directory, atomic final promotion, cleanup on success/error/cancel; recover abandoned jobs after crash. |
| Shared runtime | Whisper models, media engines, app resources | One installation-level copy where possible; not one copy per project. Remove obsolete versions through an upgrade policy, not cache cleanup. |
| Development output | Checkout build trees, test packages, installer staging | Developer-only; do not ship with the installed app or count as ordinary customer cache usage. |

A path named cache or an old modification date is insufficient evidence of disposability. Paid/generated media may be impossible to reproduce. Full-quality HDR/color/alpha authorities and editable intermediate sources may be essential, even when derived. Retained proposal/history references count. Approved-render cleanup still follows the existing human-approval and render-audit contract.

## Admission and bounds

Before a managed copy, proxy, extraction, analysis, render, model download or update:

1. Resolve the actual destination volume for scratch and final output; never assume the boot disk is the destination.
2. Measure available bytes and reserve estimated peak additional storage atomically across concurrent jobs/processes. Count temporary plus final output, encoder overhead, atomic replacement overlap and any retained previous artifact. Cross-volume jobs reserve on both volumes.
3. Reclaim only registered, unlocked, rebuildable entries. If there is insufficient room, keep the current usable artifact and explain required versus available space. Offer another destination, a lower *preview* tier where supported, or cancellation.
4. Recheck headroom while writing; bound batch/file counts and bytes. A preflight alone cannot protect against other applications filling the disk. Handle ENOSPC without corrupting existing data.
5. Release reservations and scratch on every terminal path. Recover expired reservations using owner identity and liveness checks; age alone must not terminate or delete live work.

Initial product defaults to implement and benchmark: 5 GiB free-space reserve per destination volume; warn below 10 GiB; total disposable-cache cap `min(10 GiB, 5% of volume capacity)`. These are proposed product defaults, not established platform requirements. The budget covers all cache families collectively, rather than giving each family its own 10 GiB allowance. Existing protected data may exceed it: stop growth and report that condition, never delete protected media to force the number under budget. User-configured cache caps must not disable the free-space reserve. Large intentional final outputs require sufficient estimated room, not a small arbitrary file-size cap.

## Resolution, cadence and frame extraction

- Preserve original bytes and full-quality render authority. Never silently degrade exports to solve disk pressure.
- Preview uses the existing [proxy contract](preview-proxy-contract.md), its validated quality tiers, source clock, color/alpha and audio mapping. This policy does not lower its required cadence or authorize partial proxies where consumers expect complete media.
- Browsing thumbnails and general semantic analysis use small compressed images and sparse/adaptive sampling. Start from the consumer's required pixel size and time windows; zoom or motion analysis can request additional evidence. A sparse sample cannot establish continuous motion, mask quality or word-boundary correctness.
- Avoid persistent full-resolution PNG sequences as the normal preview or analysis representation. Prefer compressed video and on-demand decode; use pipes or bounded batches when the algorithm needs individual frames. FFmpeg supports image streams through `image2pipe`; applicability and output quality remain consumer-specific. [FFmpeg format documentation](https://ffmpeg.org/ffmpeg-formats.html#image2_002c-image2pipe).
- Frame-accurate masks, tracking, optical flow and export can require every frame. Reduce *simultaneous retained frames*, not temporal correctness. Use validated mask encodings/alpha formats; lossy JPEG is not an alpha or precise-mask replacement. Full-quality zoom/crop/detail evidence may require source resolution.
- Proposed scratch target: at most 32 decoded frames and 256 MiB per batch, whichever is smaller; default per-job scratch ceiling 2 GiB. Algorithms requiring more must declare and reserve the larger requirement. Bound bytes as well as count, including foreground/background/mask copies and GPU-to-CPU buffers. These values require benchmark qualification before becoming runtime defaults.
- Retain source hash, recipe/model version, dimensions, pixel format, source-time mapping and quality tier with each derivative. Reuse matching outputs; do not silently accumulate equivalent copies for each retry.

## Eviction and recovery

Use one storage index with size, owner, class, source/recipe identity, last successful access, active leases, dependencies and readiness. Evict least-recently-used eligible entries under a process-safe lock. Revalidate source availability and references immediately before unlinking. Do not follow symlinks outside registered managed roots. External-reference media and arbitrary Downloads folders are outside automatic cleanup authority.

Cancellation/crash recovery must not sweep another process's active directory. Temporary microphone files contain sensitive data; clean abandoned owned recordings once the prior owner is proven dead, without logging their contents. Old cache variants can be removed after a validated replacement is committed and no reader holds the old one. Immutable shared originals can be deduplicated by content identity; mutable files must not be joined with unsafe hardlinks. Project portability and provenance must survive deduplication.

## User controls and diagnostics

Provide a Storage view with originals, generated media, caches, scratch and shared models; show reclaimable bytes separately from logical size. APFS clones and sparse files can make summed sizes differ from actual recoverable space. Provide a safe Clear rebuildable cache action, user-selected cache location, job size estimates and clear low-space recovery. Do not promise a clear-cache action removes user media or sign-in data. Electron HTTP cache controls cover that cache only, not arbitrary media files. [Electron session API](https://www.electronjs.org/docs/latest/api/session#sesgetcachesize).

## Required acceptance

Exercise concurrent reservations, two volumes, external disk disconnect, cancellation, process crash, lost leases, unknown free-space results and ENOSPC during write/rename. Unknown free-space results must not silently grant an unlimited job. Test repeated import/analysis/preview to demonstrate bounded storage growth and cache reuse. Test retained history/proposal sources and missing originals to prove cleanup preserves recovery. Compare proxy pixels, alpha, source clock, seek and audio sync before/after regeneration. Use synthetic fixtures; never delete creator assets to test eviction. Report measured peak bytes, retained bytes, actual freed bytes and any unexercised platform.
