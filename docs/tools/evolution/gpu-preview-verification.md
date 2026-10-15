# GPU preview verification evolution

## Browser compositor and matched export

The GPU verification capability now covers CanvasKit composition, the retained custom WebGPU development path, production scene projection and GPU export. Synthetic fixtures exercise transforms, masks, grading, captions, source clocks, transitions, cancellation and bounded cleanup.

`verify-gpu-preview.ts` checks visible effect response, repeated seeks, complete packets and encoded output through production wrappers. `verify-playback-contract.ts` tests transport and audio, including retiming. `verify-gpu-proposal-preview.ts` uses an isolated synthetic project to check proposal preview and failure recovery without approving changes to a creator project.

Working-cut inventory and performance trials are read-only and produce private receipts. Synthetic results cannot establish performance on every device or effect combination. Source selection, proxy quality and output encoding must be recorded when comparing frames. Preview and export use the same renderer selection; unsupported GPU output must fail visibly rather than silently changing renderer.

Regression owners include frame sample disposal, sequential decoder reuse, image/source preparation, lookahead budgets, caption raster ownership, retained intermediate surfaces and complete-frame publication. The registry and script inventory name the current implementation owners.

## 2026-10-10: golden scenes and seek measurement

`verify-render-goldens.ts` renders six fixed composite scenes through Standard and CanvasKit
export capture (`pnpm verify:render-goldens`). The scenes cover opacity, transform, a difference
blend, a fade transition across its window, a caption and an entrance animation. The script makes
three checks:

- **Renderer agreement.** GPU against Standard on the same machine, with p99 ≤ 4 and mean ≤ 1
  channel levels. Measured on macOS arm64: p99 ≤ 1, mean ≤ 0.15.
- **Regression.** Each renderer against committed per-platform goldens in
  `testing/goldens/render-scenes/<platform>`, with p99 ≤ 2 and mean ≤ 0.25. Measured: exactly 0.
- **Sensitivity.** A 6% opacity perturbation must fail the golden check. Measured: p99 9.

A platform without goldens checks renderer agreement only. To add goldens, bless with
`GOLDEN_BLESS=1`. The script is not in CI yet, because Linux runner tolerances are unmeasured.

`benchmark-gpu-seeks.ts` (`pnpm benchmark:gpu-seeks`) runs a fixed 60-seek pattern on a
production-shaped proxy, followed by three seconds of playback. It reports the harness clock and the
editor's own `GpuSeekMetrics` and playback counters. With `BENCHMARK_MAX_SEEK_MS` set, it fails on a
slow seek.

On its first run the benchmark found a stall on every load. The replay cache recorded paused frames.
Creating its first hardware H.264 encoder held back every newly created WebCodecs decoder for about
5 s, so the first scrub after load took 4.7–5.2 s. The fix has two parts: replay now records only
playback frames, and it prefers software H.264. The table compares the slowest seek before and
after, with 3 s playback in both cases (88 presentations, 0 skipped frames, 0 stalls, 2 replay
segments recorded):

| Preview size | Slowest seek, old code | Slowest seek, fixed |
| --- | --- | --- |
| 320 | 4.7–5.0 s | 28–91 ms |
| 720p | 4,974 ms | 81 ms |
| 1080p | 5,218 ms | 158 ms |
