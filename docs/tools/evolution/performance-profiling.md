# Performance profiling evolution

Covers `pnpm profile:route`, `pnpm profile:summary`, `pnpm perf:check`, the CPU-profile and
DevTools-trace summarisers in `src/lib/instruments/`, and the profiling options of
`scripts/benchmark-preview-playback.ts` (owned by GPU preview verification). These are repository
development instruments: no MCP tool, no editing authority. Receipts, profiles, workloads and
baselines stay under `private/perf/`.

## 2026-10-25: profiling becomes the step after timing

- **Observation:** A card with 20 drawn pieces (about 1,000 strokes) took 24–42 s to preview. Stage
  timings pointed at the spatial assessment; a `node --cpu-prof` run of the route's own functions,
  in process, put almost all of it in ink outline generation that only a bounding box needed. Reading
  code first had not found it. Profiling the live HTTP server mixes every tab's polling into one
  profile, and the browser benchmark already saved `.cpuprofile` and trace files that nothing read.
- **Decision:** One in-process route profiler (`scripts/profile-route.ts`) imports each slow route's
  `GET` handler, or the library function behind it, and calls it directly under `node:inspector`.
  The first call is profiled as cold and the rest together as warm, each timed for wall and CPU.
  Frames are mapped to TypeScript through tsx's source maps, and saved profiles carry the mapped
  positions. It reads a copy-on-write clone by default, because some GET routes write (the
  first revision read in a process writes a write marker; the proposals list refreshes pending cards).
  Shared summarisers rank functions by self and total time, counting recursion once per sample, and
  read traces for long tasks, PipelineReporter frame states, DrawFrame intervals and GPU-process
  time per frame. The playback benchmark records GPU and frame trace categories, can trace the first
  seconds of playback (`DREAMCUT_BENCHMARK_PLAYBACK_TRACE_SECONDS`), caps long playbacks
  (`DREAMCUT_BENCHMARK_PLAYBACK_LIMIT_SECONDS`), and stores summaries in its report. The stable build ships no
  browser source maps, so browser positions are named by a code excerpt from the served chunk.
  `perf:check` runs both on configured real projects through a private stable server on a free port,
  takes an uninstrumented timing pass before a profiled pass, compares CPU time (server) and
  browser metrics against local baselines, and lists each regression's top functions with their
  change since baseline. It runs locally on a schedule, not in CI.
- **Validation:** Fixture tests for the summarisers (`cpu-profile-summary.test.ts`,
  `devtools-trace-summary.test.ts`). Real runs on a 9½-minute caption project, a sketch-pieces project
  and a project with a large pending card printed source-mapped server functions; machine-specific
  numbers are in the private receipts.
- **Limits:** Warm calls of polled routes may answer from their poll caches, as the editor does; the
  cold call is the rebuild. Trace categories perturb timing, so the profiled browser pass is not a
  timing measurement. Browser function names stay minified without source maps. Baselines are per
  machine and say nothing about other hardware. The default trace categories stay narrow (frames,
  `gpu`, timeline); adding `viz`, `disabled-by-default-gpu.service` or `disabled-by-default-devtools.timeline`
  pushed a 5 s playback trace past 512 MB. Traces stream to disk, and one over 400 MB is kept but not
  summarised. A timeline read can start still-preview preparation
  that outlives the run; later runs sweep clones older than 30 minutes. Large or GPU-heavy projects
  can fail GPU initialization in headless Chrome; the check reports that fallback instead of timings.

## 2026-10-26: every perf:check workload runs on a loaded machine

- **Problem:** Two workloads failed in the first baseline run. Batch preview selected every pending
  card, so one card with an unprepared motion graphic failed the whole request (500), and cards that
  preview alone can still overlap another card's visuals. The heavy-pieces seek-profile pass waited
  180 s in first motion: under high load the GPU worker missed its 30 s start limit after Play was
  enabled, the player fell back to the Browser renderer, and the benchmark kept waiting for a GPU frame.
  A rerun fell back during a warm seek instead ("signal is aborted without reason"), and the seek
  waited out its 30 s.
- **Decision:** `batch-preview` without `--proposal` builds its selection in a child process, one
  pending card at a time, keeping a card only while the selection still previews (as a creator ticking
  cards would). The measured process stays cold. Skipped cards and their reasons appear in the output,
  the receipt (`skipped`) and perf:check's notes. The playback benchmark ends first motion and each warm
  seek as soon as the GPU canvas is gone, and reports the fallback reason the page shows. Warm seeks
  now have their own phase (`warm-seeks`). perf:check runs a pass that
  fell back one more time and notes it. Profiled-pass failures now give their reason too.
- **Validation:** `glass-split-rebuild` batch preview answers 200 with 9 of 18 cards (9 skipped:
  1 unprepared motion graphic, 8 that overlap earlier cards). Full `pnpm perf:check` runs are listed in
  the private check reports.
- **Limits:** Greedy selection depends on card order, so a different order could keep a different set.
  The selection changes as cards are settled, so batch-preview baselines move with the project. A
  retried pass that falls back again is still reported as failed. Rerun the check when load is high:
  the GPU worker limit belongs to the app, not the benchmark.
