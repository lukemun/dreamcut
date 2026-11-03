# Playback reliability contract

Preview smoothness is a separate release gate from export correctness. A correct still,
timeline formula, or MP4 does not establish uninterrupted real-time playback.

## Architecture and ownership

- One persistent decoder per playable clip/source. Speed changes update its source-time
  map and playback rate; they must not remount the decoder or reload its source.
- Source windows and frame-quantized speed boundaries are shared by preview and export.
  `speedStepFrame` preserves the discrete speed-step model. It is not a continuous ramp
  interpolator. Adding smooth ramps requires a shared integrated time map first.
- The player owns seek, pause, playback intent, and the current timeline frame.
  During playback, the persistent audio mixer supplies the media clock; otherwise
  an active audible in-composition media element supplies it. Animation-frame wall
  time is the fallback when no media clock is available. Media clocks never modify
  saved timing or the export clock.
- The mixer reports readiness to the player. Waiting pauses audible playback together
  with the timeline; resuming must not manufacture another forced seek. Ended media
  relinquishes clock authority. Decorative sound effects cannot own or stall it. Speed-stepped video participates in buffering even when its audio is detached. Playback intent stays distinct from temporary buffering, so waiting does not trigger pause-style exact seeking.
- Silent picture follows small drift through a bounded temporary playback-rate correction (0.5–1.5× the requested rate), avoiding decoder restarts. Errors over 250 ms still request a seek. These corrections are preview-only; source timing and export samples remain unchanged.
- Follower drift is measured in timeline seconds, accounting for source playback rate.
  Corrective seeks are at least 250 ms apart in both the composition and separate mixer. An authored rate change alone does not reset the picture cooldown: the integrated source clock stays continuous, including densely sampled ramps. Silent followers retain their bounded rate correction across those samples. Explicit user seeks bypass that cooldown,
  wait for an in-flight seek, and converge to the latest requested target.
- Media synchronization runs on each player tick independently of composition-frame changes. A held frame must not suspend follower correction; this loop updates media controls without re-rendering the scene graph.
- Paused audio cannot own the running preview clock. After a buffering pause,
  transport must be able to advance and retry playback rather than pinning itself
  to the paused decoder timestamp. The separate mixer warms the current and next
  two seconds of audio instead of opening every future audio download at refresh.
  An advancing in-composition audible clock is never drift-sought toward the
  quantized frame it supplied itself; paused positioning and explicit seeks still
  converge exactly. External-clock followers retain their drift correction.
- Decoder/resource lifetime belongs to the player session. No global decoder pool or
  cross-project clock; cleanup must remove mixer callbacks, listeners and audio nodes.
- Mounted still images hold playback until `decode()` succeeds; changing their source
  or unmounting cancels the old readiness requirement. Active silent videos must have
  a decoded first frame before transport advances, even when they do not own the audio clock.
  Hidden premounts warm without blocking the current shot. After first decode, silent
  follower corrections do not re-enter the initial-readiness gate; audible clock
  owners retain their coordinated buffering gate. Startup picture readiness excludes
  audio delegated to the separate mixer.
  These waits use the existing coordinated waiting/resume events so picture and audio
  pause together. `tsx scripts/verify-playback-contract.ts --cold-start` exercises
  delayed images, silent video, and layered video without modifying a project.
- Use verified small preview proxies, preserving their source mapping. Original or
  processed render authorities remain authoritative for export.

Background warmup starts when the project composition loads and follows the playhead,
without a Play request. Retained image warmers explicitly decode images, prioritizing
the current shot; upcoming audio seeks its real trimmed source start while paused.
Keep warmup bounded, never autoplay to prime a decoder, and retain the mounted-media
readiness gate—background preparation is not itself proof that the visible frame is ready.

## Required evidence

Changes to speed mapping, player clocks, decoder ownership, buffering, proxy timing,
or preview audio must run `pnpm verify:playback`, relevant unit tests, and the renderer
contract. CI runs the playback instrument beside the renderer gate and retains JSON receipts and server logs as a build artifact.

The synthetic browser instrument runs both embedded audio and a separate editor mixer. It exercises 0.25×–4× speed steps, out-of-order seeking,
replay, 2× transport, the actual TimelineComposition/Player, decoder identity, and an encoded export
with retimed audio. It never writes a project timeline. Its receipt is
`testing/results/playback-contract/latest.json` and `mixed/latest.json`; preview measurements are retained in timestamped `attempt-*.json` files, with the latest attempt in `attempt.json`.

For the short reference fixture require one video decoder, no source reload across
speed boundaries/replay, p95 timeline drift under 100 ms and maximum under 250 ms,
fewer than 20 seeks per decoder across the three runs (including setup and explicit seeks), completion within the fixture deadline, balanced waiting/
resume events, exact encoded frame count, an audio stream with duration and non-silent, bounded-level tone windows across the rate changes, and exact decoded source-frame identity before/after speed boundaries. Source-frame identity is tested against the nearest decoded source image; color/effect parity remains the separate renderer contract. These are acceptance
bounds, not aspirational labels. Preserve failed measurements and fix their cause;
do not loosen thresholds merely to pass. Report actual values and workload/browser.

These tests do not prove subjective audio quality, all devices, continuous ramps,
network stalls, long edits, or unlimited compositing layers. Add a regression case
for the specific failing workload before claiming it fixed. Repeat with delayed
media and multiple overlapping clips when those paths change. Keep manual listening
and mouse/touch acceptance separate from instrumented timing evidence.

## Escalation path for workloads that cannot play live

The next architecture tier is a derived preview cache; it is **not shipped by this
change**. Cache keys must include source hash, source window, timing map, relevant
effects, output dimensions/fps, and renderer version. Prepare only the required
range, verify picture/audio timing, and invalidate when any dependency changes.
Show preparation state instead of silently displaying a stale cached edit. Preview
caches must never replace the original source, mutate a timeline, or become export
authority. Add parity and stale-cache tests before enabling automatic selection.

Diagnostics should distinguish decoder starvation, expensive frame composition,
corrective-seek loops, and missing assets. Measure the failing cause before adding
another buffering toggle or relaxing sync tolerances.

## Decoder recovery and architectural boundaries

Follow the [application layering guide](../architecture/application-layering.md).
Keep policy deterministic and adapter actions explicit. Background preloading is a
hint; actual mounted readiness owns release of a playback wait.

A paused decoder stuck below future-data readiness with an idle network and no
seek/data progress may receive one load retry after two seconds at the same source
target (four seconds for an unfinished seek with no loading progress). Recovery never autoplays, never reloads a healthy/playing/downloading decoder,
and never bypasses readiness. Metadata resynchronizes the source target. Dispose
recovery observers with their media owner; export has no preview recovery watcher.
The same policy applies to in-composition media and the separate audio mixer.
Explicit user Pause retains exact positioning; a temporary buffering pause retains
Play intent and its drift tolerance. Test these distinct transitions.

`verify-playback-contract.ts --recovery` (also `--mixed`) injects an idle metadata-only
stall and requires one reload, restored playback and balanced waits/resumes. This
fault-injection test does not establish the cause of every organic decoder stall.

When an external mixer has no usable clock, in-composition narration may own the
clock even though the mixer callback is installed. Narration following an actual
external clock uses bounded rate correction for small drift and a 250 ms corrective
seek threshold; explicit seeking remains exact. Waiting preserves that follower
policy. This prevents small source corrections from repeatedly entering the buffer
state. The bounded rate correction is preview-only and preserves pitch where the
browser supports it; verify audible playback separately from timing measurements.
