# Prepare, poll and retry an existing media asset — evolution

Capability: `media-readiness`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Prepare, poll and retry an existing media asset. Project-scoped cached preparation; respect optional analysis settings; no import or timeline mutation.

## 2026-09-30 — initial capability registration

- **Observation:** Repository script/catalog audit found this capability family. This
  is code/discovery evidence, not measured editing frequency or a new runtime trial.
- **Decision:** Prioritize a reusable interface; no tool implementation is claimed by registration.
- **Version:** Initial registry record; existing tool/recipe versions are unchanged.
- **Verification:** Catalog membership and owner/evolution paths checked by `check:tools`.
  Runtime behavior was not re-certified by this inventory.
- **Acceptance for next change:** Existing ready asset reuses work; failure identifies stage; retry preserves job/source identity; missing preview blocks placement.
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

## 2026-09-30 — prepare imported audio before placement

- **Observation:** Waveform preparation required active timeline membership, blocking
  analysis of imported sound alternatives before human approval.
- **Change:** `audio_waveform_prepare` and the existing HTTP endpoint share one owner.
  Unused sources require same-project managed-import provenance, matching bytes and
  real-path containment. Active timeline sources retain their existing authority.
- **Boundary:** Only waveform caches change. No placement, approval, gain or original
  media writes. Requests accept at most 20 sources, processed synchronously with the
  existing 120-second extraction timeout. Partial failures retain completed caches.
- **Verification:** Synthetic audio integration exercises unused imports, cache reuse,
  unchanged timeline/metadata, malformed requests and unsafe/stale-source rejection.
  MCP contract coverage checks compact results and structured partial-failure recovery.
  Existing extraction tests cover concurrent deduplication and byte invalidation.
- **Version:** Existing waveform recipe and tool error schema 1 are unchanged.

## 2026-10-02 — browse while full-quality preparation continues

- **Change:** The detached worker prepares validated HDR browsing previews before
  pending full-quality jobs and runs at lower CPU priority. It reuses the Apple SDR
  conversion stage for the final package; running encodes finish before reprioritization.
- **Boundary:** Early readiness permits source playback and marks only. Placement
  still requires the complete validated package. Failed final preparation retains
  the browsing preview and exposes retry. SDR and alpha media retain their existing path.
- **Verification:** Synthetic HDR integration covers early playback with audio, marks,
  placement rejection, failure retention, final parity and changed-source invalidation.
  Independent browser acceptance verified keyboard playback and marking while pending.
  Typecheck, editor UI, tool contracts and both playback fixtures passed.
- **Version:** Existing tool names and full-quality preparation recipe are unchanged;
  preparation records gain optional browsing-preview and stage fields.

## HDR-alpha preparation repair — verified 8-bit route

- Owner: `prepareEditorMedia` and the existing color-managed-pair helper. Unregistered
  HDR VP9-alpha cannot enter the opaque AVFoundation input path directly.
- Boundary: prepare new versioned authority/proxy files and receipts; preserve the
  archival source and leave timeline/proposal state unchanged.
- Proposed route: opaque full-resolution RGB bridge through the approved Apple
  color conversion, then reattach the original cadence-mapped alpha plane. Validate
  render alpha bytes, proxy alpha/RGB parity, dimensions, frame count and duration.
- Acceptance: a synthetic unregistered HDR-alpha import completes through the real
  preparation worker with transparency and the source hash intact. No readiness
  claim until that integration passes. macOS remains the existing HDR prerequisite.

- Implemented recipe `apple-hdr-sdr-alpha-authority-v1`: opaque ProRes RGB bridge,
  existing Apple SDR conversion, lossless VP9-alpha authority and a separate VP9
  preview. Embedded audio survives in the authority; preview audio remains separate.
  Unsupported high-bit-depth alpha fails explicitly instead of silently reducing it.
- Synthetic integration passes for 30 fps and fractional 30000/1001 sources,
  including a 6.6-second case. It verifies the cadence-mapped alpha-plane hash,
  distributed RGB/alpha proxy SSIM, dimensions, counted frames, audio presence,
  source preservation, unchanged edit files and temporary-stage cleanup.
- A full-size source exposed a frame-rate/duration mismatch after the color stage.
  Explicit 30 fps output and a non-repeating, shortest alpha merge address that
  boundary. Both full-size failed assets now pass: 198 frames/6.6 seconds at 30 fps,
  exact cadence-mapped alpha and minimum sampled RGB/alpha SSIM 0.979973/0.992135.
  Original/authority/proxy hashes and unchanged timeline/metadata were verified.
  No tolerance was relaxed. Higher-precision alpha remains explicitly unsupported.
- Retries now clear the prior attempt's error before entering the queued state.
  Regression coverage checks both the returned and persisted retry record.
# Shared still-image previews — 2026-10-07

Timeline hydration now prepares local JPEG/PNG stills through a serial, at-most-64
job queue. The `editor-still-v1` cache emits lossless PNG at the existing selected
preview-quality bounds, preserves alpha, normalizes EXIF orientation and converts
to sRGB. Source size/mtime/ctime, recipe and quality identify a cache entry; receipts
record source/output SHA-256 and dimensions. Output hashes are checked before reuse.
Corrupt outputs rebuild. Unsupported/failed inputs retain their original playback
source, with failure metadata; failed recipes are not endlessly retried by polling.
Distance-field image treatments bypass this photographic preparation.

The disposable `runtime_still_preview` binding is stripped from saved timelines
but retained in the canonical playback plan and its cache identity. Standard, GPU
and Rust resolve the same prepared image. Rendering/export continues to resolve
the original source. The existing preparation refresh loop updates ready bindings;
there is no new user-facing renderer mode or timeline mutation.

Tests cover quality tiers, EXIF orientation, transparency, no upscaling, source
preservation, corrupt-cache repair, source replacement, canonical playback binding,
and Standard/GPU/Rust preview versus export selection. The prepared-PNG synthetic
72-frame proof passes unchanged at raw 0.354629 / encoded 0.640303. Broad checks pass
2,273 tests, one skipped. This does not certify every ICC profile or HDR still format;
supported preparation is limited to ordinary JPEG/PNG and bounded decoded size.

Follow-up failure coverage verifies that rejected 16-bit PNG and malformed JPEG
inputs retain the original source even for short stills that would otherwise enter
the legacy image-optimization route. Failed preparation carries an explicit
preserve-original binding. Source replacement can recover, duplicate requests share
one job, and linked local-library sources remain supported. The bounded job queue
and verified-output cache now survive module reloads as process-wide state.
The broad gate passes 2,274 tests with one skipped.

## Disposable caption-video preview evidence

Timeline/proposal hydration validates an explicitly selected caption preview even
when no picture actor references that file. `runtime_media_fill_preview` records
server-measured proxy evidence, alpha and source-pair identity; it never changes the
selected preview or export source. It is stripped from durable writes and invalidated
on either source URL changing. This extends existing preview validation rather than
adding an editing tool or granting timeline mutation. Tests cover measured VP9 alpha,
remote/missing evidence rejection, stable-URL replacement revision and source-safe
runtime merges. Standalone GPU pixel and playback proofs consume this same owner.
