---
name: performance-review
description: Review DreamCut architecture, time complexity, memory, storage and I/O using measurements and CPU/GPU profiles. Use for repository-wide performance audits, slow playback or requests, expensive preparation, or work repeated per frame, poll or item. For correctness defects use code-review; for UI layout use editor-ui-design.
---

# Performance review

Make a slow path measurably faster without changing what it produces. Work from a
symptom the creator sees (Replay takes 12 s, a card poll is 867 KB) to a profile that names
the functions doing the work, fix the largest costs first, and prove each fix with the same
measurement and the same profile.

## Measure before reading code

For a repository-wide review without a reported symptom, start with the coverage
and workload inventory below, then measure representative paths before proposing
optimizations. Do not invent a baseline or require the creator to identify a bottleneck.

Record the symptom as a number on a stated machine state, and note other load:

- **Machine:** `uptime` and the busiest processes (`ps aux -r | head`). Load from other
  sessions, test runs or background renders invalidates timings; retime once it settles.
- **Server under test:** time a production build (`pnpm editor` on 3123 in a checkout, or the
  installed app's service), not `pnpm dev`. In development, Next
  starts a new Node process for each request to a dynamic route (`/p/[projectId]`,
  `/api/projects/[projectId]/…`) and recompiles after source edits, so a few open editor
  tabs keep it busy and stall unrelated requests. Creators never run that server.
- **Server or browser:** when a request is slow in the editor, time the same URL with curl
  at the same moment. Slow in both means the server: read its `Server-Timing` header and CPU.
  Slow only in the tab means the browser: its six connections per host, a hidden or paused
  pane, or main-thread work. Proposal previews over 3 s log a `[proposal preview]` line
  splitting queued, server, waiting and reading time.
- **Requests:** time and size each polled or slow endpoint with
  `curl -s -o /dev/null -w "%{time_total}s %{size_download}B\n" <url>`, then again with
  `If-None-Match: <etag>`. A 304 that still takes as long as a 200 means the server built
  the whole body before comparing.
- **Payload:** break a large JSON response down by key (which field holds the bytes, and
  whether it repeats per item).
- **Playback:** in the editor, measure time from Play/Replay to the Pause button
  appearing, then frames advanced per second from the `Seek preview` input. Check
  `requestAnimationFrame` rate first: a hidden or background pane runs at about 1–2 fps
  and its numbers mean nothing. Close extra editor tabs; each one polls and previews too.
- **Background work:** count headless renders (`ps aux | grep "Google Chrome --disable-field-trial"`)
  and prepared-preview jobs before blaming foreground code, and recount after each run: pausing
  between timed runs can itself start idle-time work (flattening) that slows the next run.
- **CPU under load:** when other sessions keep the load high, time each step with `process.cpuUsage()`
  as well as wall time, and alternate before/after runs; wall time alone swings 2× between runs.
- **Isolation:** measure on an instant copy-on-write clone of the project (`cp -cpR` on macOS; without `-p` new
  mtimes make the clone re-prepare all its video)
  opened in a second editor (`TIMELINE_PROJECTS_DIR`, another port), so the creator's editor and
  selection are untouched. Compare before and after on the same machine state, several runs each.

## Profile before reading code

Once a path is timed, profile it before reading its code. Guesses from reading code are often wrong: a
24–42 s card preview was all ink outlines built only to measure a bounding box, which the
profile named in one run and reading the route had not.

- **Server path:** `pnpm profile:route <scenario> <projectId> [--proposal <id>] [--runs 5]`.
  Scenarios: `timeline`, `revision`, `library-presentation`, `proposals`, `proposals-details`,
  `proposal-preview`, `batch-preview`, `memory`, `agent-chat-load`, `spatial` (the working cut,
  or a card's preview with `--proposal`); `--if-none-match` sends each warm call the previous
  ETag, which measures the 304 path a polling editor takes. It calls
  the route's own handler in process on a copy-on-write clone, profiles the first call as cold and
  the rest as warm, and prints wall and CPU time with the top functions by self and total time at
  their TypeScript `file:line`. Warm calls of polled routes may answer from the poll cache, as the
  editor's do; the cold call is the rebuild. For a path no scenario covers, add one to the script
  rather than profiling the live server, whose profile mixes every tab's polling.
- **Browser path:** run `scripts/benchmark-preview-playback.ts` against a stable server with
  `DREAMCUT_BENCHMARK_CPU_PROFILE=1` (CPU from Play to first motion and for one warm seek),
  `DREAMCUT_BENCHMARK_SEEK_TRACE=1` (a trace of that seek) and `DREAMCUT_BENCHMARK_PLAYBACK_TRACE_SECONDS=5` (a trace
  of the first seconds of playback). Cap long talks with `DREAMCUT_BENCHMARK_PLAYBACK_LIMIT_SECONDS`. Each
  profile and trace is summarised as it is saved: top JS functions, long tasks and what ran inside
  them, presented, dropped and long frames, and GPU-process time per frame. The stable build has no
  browser source maps, so minified positions carry a code excerpt to search for.
- **Saved files:** `pnpm profile:summary <file>...` reads any `.cpuprofile`, DevTools trace (including
  a Performance panel export), route receipt or playback report.
- **Read the ranking, not the tree:** start from the top self-time functions, then follow total time
  up to the first DreamCut function that decides to do the work. High GC or `readFileUtf8` self time
  points at repeated parsing; `spawn` at a child process per request; a long task with one
  `FunctionCall` at a single synchronous step to split or skip.
- **Recurring check:** `pnpm perf:check` profiles the configured workloads (real projects named in
  `private/perf/perf-check.json`, never committed), benchmarks playback through a private stable
  server, compares with `private/perf/baselines.json` and lists each regression with the functions
  that grew. It runs locally on a schedule, never in CI. `--update-baseline` after an accepted change.

## Repository-wide architecture and complexity review

Record the revision and dirty-worktree scope; preserve concurrent work. Use the
architecture overview and source inventory to build a coverage table for editor
state/UI, playback/rendering, proposals/history, API/MCP, media preparation,
storage/catalogs, background workers, and build/tooling. Account for remaining
first-party subsystems explicitly. Exclude generated output, dependencies and private
media from code coverage. Mark each area inventoried, inspected, measured, or deferred;
an inventory alone is not a completed review of its code.

For each area, trace representative requests and data lifetimes across boundaries:

- Define input sizes and operation frequency. State time complexity, auxiliary
  memory and persistent storage growth separately, including worst-case and warm-cache
  behavior. Include serialization, filesystem scans and process startup costs.
  Trace caller-enforced bounds before ranking a nested loop: a schema-limited selection
  is different from an unrestricted library. Check whether a cache budget bounds bytes,
  entries or only older files; a retained active file may still grow without limit.
- Examine ownership and architecture: duplicate state or computation, invalidation,
  fan-out, queue concurrency, cancellation, backpressure, eviction and disposal.
  Identify how an architectural change reduces work before proposing a redesign.
- Measure small, typical and large synthetic workloads with fixed inputs. Record
  latency distributions over repeated runs, CPU time, peak memory, I/O or output
  bytes as relevant. Separate cold and warm runs and avoid timing concurrent benchmarks.
- Rank findings by observed creator impact, frequency, scaling risk, confidence and
  implementation cost. Keep measured bottlenecks, code-proven scaling problems and
  unmeasured hypotheses distinct. Complexity alone does not establish practical impact.

Produce a review receipt with coverage, reproducible commands, workload sizes,
baseline measurements, findings with file references, proposed changes and tradeoffs.
Keep machine-specific receipts and private data out of public documentation.
Fix prioritized findings in bounded changes when authorized; compare outputs and
rerun the same workload after each change. Report unchanged or regressed measurements
honestly. Finish with a ranked backlog and explicit unreviewed areas; never claim
every path is fast or every file reviewed from a few successful benchmarks.

## Where DreamCut wastes work

Read the path the symptom exercises and look for these shapes. Express each cost in the
path's own sizes (layers N, pending proposals P, motion items M, looks L, receipts R,
keyframes K, pixels, frames).

- **Per-poll rebuilding.** Polled reads (proposals with details, revision, library
  presentation, generation jobs) must answer unchanged requests cheaply. Compute a cheap
  input fingerprint (file sizes and mtimes, the timeline revision) before deriving, and
  return 304 or a cached body when it matches. Hashing the finished body is not enough.
- **Repeated disk reads.** Registries and manifests (`looks/*.json`, `pieces.json`,
  controls files, render receipts, source fingerprints) read inside a per-item loop. Memoize
  by path and mtime/size; build lookup maps once.
- **Repeated payload.** The same control list or manifest sent once per item. Send it
  once and refer to it, or fetch details only when a card opens.
- **Startup gates.** Playback that waits for a long buffer (all layers decoded, many
  frames drawn, every slow frame remembered from a past session) before the first frame.
  Start after a short runway and keep warming in the background.
- **Per-item indexes of the whole collection.** A helper that indexes or stringifies every
  element (`changedSince`, lookup maps, fingerprints) called inside a per-element predicate
  makes the pass quadratic. Build it once before the loop. Size fixtures like real talks:
  one-word captions put well over a thousand elements on one rail.
- **Per-frame work.** `JSON.stringify` of the scene, linear scans of keyframes or tracks,
  objects rebuilt every render that feed effects or memos, telemetry written to the DOM
  every frame. Hash once per scene change; binary-search or cursor through sorted keys;
  memoize structural plans and let only leaf components read the frame.
- **Renderer churn.** Switching between the GPU and Standard renderers, or remounting
  every layer's decoder, when a prepared block appears or a selection changes.
- **Duplicate pipelines.** Re-checking an unchanged composition before a cache lookup;
  decoding and re-encoding a render to crop it; drawing a whole frame to keep one small
  piece. Look up caches first; do the narrow work once.
- **Timers that count waiting.** A fixed timeout on a request also counts time queued for a
  connection and time the page spent hidden or paused, so it fails loads the server never
  saw. Spend the budget only while the page is visible and log each phase when it runs out
  (`src/components/studio/timeline/preview-request-timing.ts`).
- **Unbounded background work.** Jobs started per card or per selection without a single
  owner or a cap, competing with foreground playback. One job per project, started only
  when the player is idle.
- **Connection starvation in the page.** Chrome allows six connections per host, so a few
  long requests delay every poll and script behind them. Look for media fetched before it
  is needed (`audio.load()` fetches even with `preload="none"`; posters for cards off
  screen), work owned by panels that are mounted but hidden (an agent chat connecting at
  load), and slow first requests that are not on the page's critical path. Count requests
  per load with their initiator before timing anything.
- **GPU process saturation.** A stall with ready pictures and an idle main thread is often
  the GPU process at 100%, which stops `requestAnimationFrame`. Read a trace with the `gpu`
  category, not a CPU profile. Shapes: a new full-frame canvas per piece per frame, copying
  canvases before upload, and hardware-decoded alpha video whose merge reads every frame
  back synchronously.
- **All-or-nothing caches.** A cache keyed on a whole folder's signature recomputes every
  item when one file is added (each edit adds a history snapshot). Key per item by its
  stat. When a restart is the common cold path, persist small immutable results beside the
  project (declared in the storage plan) instead of re-deriving gigabytes of history.
- **Cache keys that miss.** Absolute paths miss after a project moves and leave orphans;
  mtimes truncated to milliseconds miss after a copy (round them). A probe or render cached
  only in memory is redone after every server restart, and stable builds restart often.
- **Whole-collection copies per option.** Cloning or re-serialising every element to change
  a few. Share untouched rows and copy before write, and prove identity old against new
  across every local project with cards. Read-only consumers can take frozen shared results.
- **Repeated full-file reads in one request.** The same 20 MB `timeline.json` parsed and
  hashed by each helper in a route. Read one snapshot (`readTimelineSnapshot`) and pass it down.
- **Build switches under a loading page.** A server that swaps builds mid-load serves new
  chunk names to old HTML. Keep superseded static files reachable.

## Fix and verify

- Fix in impact order. Keep each fix behaviour-preserving: the same frames, the same
  response content, the same render. Where output must stay identical (stacked layers,
  render receipts), compare it before and after.
- Test caches below, at and above both entry and byte limits. A full ordered scan can
  evict each upcoming entry and erase every warm hit; bounded memory alone does not
  establish effective caching. Include append/replacement and caller-mutation cases.
- Invalidate caches on every input that can change the result (mtime and size, a content
  hash, the timeline revision, the look bundle). An unbounded cache is a memory leak; bound
  it or key it so old entries are replaced.
- Prove identity, not just tests: run the old and new code alternately in one process on
  real projects (keep a copy of the old file in a scratch folder) and compare full output.
  For renderer changes the bar is that preview matches export, not that pixels match
  yesterday's: GPU preview and GPU export share one runtime, so prove the change there
  with `pnpm verify:render-goldens` (preview against export within its tolerance; add
  scenes for what you changed) and bless the new goldens. Pixel hashes of paused frames
  before and after remain the check for changes meant to be invisible.
- A cache in front of polled reads must not hide work in progress: while a preparation
  record is still running, rebuild every read so a dead worker is restarted.
- When a fix relaxes a wait (a grace period, a skipped hold), bound what it can drift:
  picture trailing sound is visible from about 45 ms, so keep lip sync within a frame.
- Re-profile with the same workload and command, and confirm the function you fixed has left the
  top of the ranking; a faster total with the same top function usually means machine load changed.
- Re-run the original measurement on the same machine state and report before → after.
  Run the affected tests, `pnpm typecheck`, and `pnpm check:editor-ui` for UI paths.
- Report what was measured, what was fixed, what was only reviewed, and what remains slow
  for reasons outside the change (machine load, layer count).

## Fan out a large pass

When the creator asks for a broad speed-up, run fixes in waves of parallel agents rather
than one long change. Rank costs from `pnpm perf:check` and the profiles first, then:

- Give each agent one cost, its measured numbers, the exact commands to re-measure, and
  a set of files it owns. Name the files other agents own. When a new agent starts,
  tell running agents what it now owns. Agents report costs in other files with
  file:line rather than editing them; the next wave takes those.
- Agents never commit, switch branches or revert others' work. Each appends one dated
  entry to this skill's evolution log, re-reading it just before writing.
- Browser agents use the hot-reloading dev server (3129) for rankings and pixel or sync
  proofs, or a private stable server on a free port over a clone. The creator's editor on
  3123 is never driven. Several agents share one machine, so compare CPU ms and counts,
  alternate old and new runs, and state the load.
- Review each report before the next wave: send back fixes that trade correctness for
  speed (lip sync, preparation restarts), and record storage or behaviour changes
  the creator must know about.
- Finish with the full checks, a fresh `pnpm perf:check` baseline, and this skill's retro.

Record new waste patterns and measured results in this skill's evolution log.
