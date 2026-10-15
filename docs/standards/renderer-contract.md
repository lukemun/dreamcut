# Preview and export contract

DreamCut owns its frame runtime and browser renderer. The selected renderer owns
both preview and export: Standard/Rust use TimelineComposition, while Browser GPU
uses the same CanvasKit compositor and GPU frame evaluator for both. Source timing,
composition adapters and authored audio semantics remain shared across backends.
Do not silently export a different compositor from the one selected for review.
GPU source restrictions or missing capabilities must fail explicitly. Preview
proxies remain distinct from full-quality export authorities. See the
[matched-renderer decision](../architecture/playback-rendering.md#one-renderer-for-preview-and-export--accepted-2026-10-08).
The historical `src/lib/remotion` directory contains DreamCut composition code; it
must not import or require the Remotion packages. The migration comparison tool may
load an explicitly supplied legacy checkout as a read-only reference oracle.

## Required for every effect change

1. Register adjustable properties in `EFFECT_CONTROLS`, with normalization, identity,
   reset semantics and actual animation support.
2. Add an explicit case in `src/lib/render/effect-render-contract.ts`. Type checking
   and unit tests reject missing cases. Use supported, visibly distinct values and
   a representative source; a transparent or unchanged fixture is not proof.
3. `pnpm verify:renderer` must prove visible change, exact reset, preview/export
   agreement and preservation through the actual video encoder. Keep assertions
   meaningful; do not relax tolerances to accommodate an unexplained regression.
4. New effect families outside the property registry must extend the executable
   fixture suite and its CI command (for example text, 3D, LUTs and transitions).
   Test the relevant alpha, font/texture readiness, boundary, layering and random
   seek behavior. Animated effects need start, intermediate and end states, plus
   repeated out-of-order seeks. A still screenshot is insufficient for motion.
5. Run the existing family-specific pixel proofs when changing its implementation.
6. New effects, styles, animations, presets and element props must be admitted by
   Browser GPU (CanvasKit) and proven there before they are offered in the editor; see the
   [GPU-first feature rule](../architecture/playback-rendering.md#gpu-first-feature-rule--decided-2026-10-09).
   Register panel catalogs in `gpu-admission-contract.test.ts`. Standard-only support is incomplete.
   Agent-authored writes are enforced server-side by `src/lib/timeline/gpu-write-admission.ts`:
   proposal validation (create, preflight, batch, approval) and leased `agent_workspace`
   timeline writes reject, with HTTP 422, any CanvasKit issue the write introduces.
   Only `source` (media preparation) issues are exempt; pre-existing legacy gaps do not block unrelated edits.
   <a id="browser-gpu-parity-ratchet"></a>**Parity ratchet.** `src/lib/gpu-preview/parity-inventory.ts` derives every
   prop and preset value Standard draws from the owning registries (caption defaults, effect
   controls and render cases, animation/motion/transition/style lists, review modes, the agent
   prop schema), with a source scan of `src/lib/remotion/**` and its timeline resolvers as a
   backstop, and asks CanvasKit admission about each one. `gpu-parity-inventory.test.ts` (in
   `pnpm test`/`check:pr` and `check:editor-ui`) fails on any rejection not listed in
   `GPU_PARITY_DEBT` with a reason, on any debt entry CanvasKit now admits (debt only shrinks),
   and on agent fields that are neither inventoried, non-rendering nor compiled away. Admission
   is not pixel parity: back each implementation with a Standard-vs-CanvasKit `/render-frame` proof.
   Keep preview controls and inspector behavior covered separately from pixel proofs.
   Tracked-surface captions (`surface_track`) are inventoried as their own family: every
   `surfaceTrackSchema` field and track variant, plus every caption obligation with a track attached.
   <a id="browser-gpu-sampling-rules"></a>**Shared sampling rules.** Where Chrome's compositing
   choice decides pixels, both renderers follow one owner instead of approximating each other:
   - Caption retained motion layer (`captionMotionLayerActive`, timeline/caption-plane-transform.ts):
     `pop`/`spring_pop`/`rotate_in` captions use `will-change: transform` only while the pose is not
     the identity; settled frames paint in one pass. While active, CanvasKit rasterizes at the
     integer-snapped actor translation and resamples the fractional remainder, as Chrome's layer does.
   - Ticker crawl (`captionTickerTranslation`/`captionTickerCss`): whole composition pixels, ties
     toward +infinity (CSS `round()` / `Math.round`).
   - `transition_clip_to_media_bounds` (timeline/transition-viewport.ts): one resolver for the fixed
     viewport. In composition space the clip and its box shadow (sigma = blur / 2, outside the box
     only) are pixel-snapped; inside a page turn they are exact and antialiased.
   - Tracked text rasterizes at Chrome's ideal contents scale for its projected plane
     (`gpuTrackedTextRasterScale`); a still parent samples the track on the timeline clock.
   - CanvasKit antialiases picture edges at fractional rects, as Chrome does.
   Changing one of these changes Standard exports or GPU output: re-run the residual proofs.

## Runtime rules

- Frame state is an explicit input. No wall-clock animation or mutable global frame
  authority. Resource readiness belongs to the current player/render session.
- Register asynchronous resources and canvas/WebGL draw work with the frame session.
  Export waits for decoded media, fonts, resources and completed effect draws.
  Failures must reject the render; never publish a success artifact with missing media.
- Preview may use verified proxies; export uses the original/processed render authority.
  Both use the same source window, playback rate, gain and layer ordering.
- Audio is collected from the same frame evaluation, with stable IDs across workers,
  bounded source decoding and continuous source-clock runs. Test rate, trim, gain,
  looping and end boundaries when changing the clock or mixer.
- Concurrent export workers preserve frame order. Cancellation and failure clean up
  temporary output; publish only after encoding and audio muxing succeed.
- Do not add a browser-only fallback that silently drops an unsupported export effect.
- Export resolution never changes layout. Compositions always lay out on the canonical
  1080p canvas ([export-resolution.ts](../../src/lib/render/export-resolution.ts)).
  480p/720p downscale the full-size frames in the encoder. 2K/4K render at a higher
  pixel density: Standard through Chromium's device scale factor, GPU through the
  CanvasKit `pixelScale` (logical scene, scaled intermediates, text and vector stills
  rasterized at that density; [canvaskit-pixel-scale.ts](../../src/lib/gpu-preview/canvaskit-pixel-scale.ts)).
  Never upscale a 1080p render and call it 2K/4K. A new CanvasKit surface, raster or
  pixel-sized uniform must honor the scale; scale 1 must stay the unchanged path.
  The experimental Native renderer exports up to 1080p.

## Required checks

Timing and preview-runtime changes also require the [playback reliability contract](playback-reliability.md)
and `pnpm verify:playback`. Frame-perfect exports do not waive real-time playback checks.

`pnpm typecheck` and `pnpm test` run in PR quality CI. The render checks run locally
against a running editor: `pnpm verify:render-contract` runs the renderer, playback,
prepared-playback, effect-primitive, still-session, source-frame and golden checks in order.
The render gate starts an isolated editor and uses Chrome plus FFmpeg. Its receipt is
`testing/results/renderer-contract/latest.json`; it records actual pixel comparisons.
Local execution uses `TIMELINE_EDITOR_BASE_URL` for the running editor.

Changes to export resolution, the CanvasKit pixel scale, text or vector rasterization,
or a CanvasKit intermediate surface run `pnpm verify:export-resolution` against the
running editor. It checks exact frame sizes and counts at every resolution on both
renderers, and that each GPU property fixture and caption case rendered at 2× and
scaled back down matches its 1× render. Grid-matte fixtures need project-served masks
and are reported as skipped. Receipt: `testing/results/export-resolution/latest.json`.

Migration comparisons use `scripts/compare-renderer-reference.ts` with an explicit
legacy checkout and project. Preserve the reference fingerprint, timeline hash,
frame measurements and exported files. Passing sampled frames is distinct from a
full encoded-video/audio comparison; report the coverage actually measured.

For retimed speech, waveform identity may fail when tempo processing is anchored
to different source windows. Keep ordinary audio's strict comparison. Use the
explicit `compare-rendered-audio.py` spectral/envelope gate only with documented
time stretching and reference delay; `compare-rendered-videos.ts
--time-stretched-audio` requires matching output hashes from that completed proof.
Require equal post-delay sample counts, then use equal windows with an overlapping
final window to cover the entire tail. CI also runs `scripts/compare-rendered-audio.test.py`.

## Frame-check reuse and regression protection

`frame-state` uses one browser per run and at most two composition pages, keeping
the main picture separate from caption-removal measurements. Every uncached seek
still awaits the renderer's media/font/effect readiness. A failed capture closes
the session; concurrent captures on one session are rejected.

The disposable project cache at `instruments/.still-cache-v1` reuses PNG bytes
across output folders only under a matching SHA-256 key. The key includes the
full composition inputs, frame, canvas and output settings; source/public file
contents and local media bytes; and the browser version plus JavaScript, CSS and
font bytes actually loaded by the running renderer. The server must confirm the
same checkout and project-storage roots. Cached PNG checksums must match before
reuse, and dependencies are checked again before publishing a new cache entry.

Simple independent compositions can scope the key to the sampled frame's dependencies;
unknown or coupled effects retain the full composition. The [efficiency benchmarks and regression protection](../architecture/agent-efficiency.md)
defines its closed allowlist and conservative caption/visual relationship handling.
Unknown remote/dynamic media, SVGs with unverified nested dependencies, missing
files, unavailable runtime fingerprints and corrupt cache entries fall back to
fresh rendering. Local dependency hashes are memoized only within one invocation;
the next run hashes bytes again. Unchanged directory listings may be reused within
one invocation after checking their inode and nanosecond modification/change stamps;
every file is still checked. Additions, deletions and renames invalidate the directory
snapshot. The PNG cache is bounded to 512 MiB per project.

Font layout measurement, overlays, spatial expectations and read-delta reporting
still run. Caption ink bounds and pixel-derived caption state may reuse checksummed
results under matching picture bytes, complete measurement inputs, source-code/public
asset fingerprints and FFmpeg version/configuration. Failed, corrupt or racing
measurements never become reusable evidence; the disposable measurement cache is
bounded to 2,048 entries. `--no-cache` also disables measurement reuse.
A cached picture is not proof that a new review question was answered.
`--no-cache` forces captures while keeping browser reuse; `--fresh-browser` disables
both optimizations for comparison. Reports and run metrics include cache hits,
misses, bypasses, hashing/setup time, page loads and captures.

`--warm-renderer` opts into cross-command browser reuse for simple local media.
Text, unknown effects, fixtures and unverifiable resources keep the normal per-run
browser. A private owner-only Unix socket serializes work; Windows uses the normal
browser. Workers expire after 30 idle seconds. Checkout, server instance and code
revisions identify workers; changed media dependencies reset their browser state.
Capture/readiness errors poison the session, and startup failure falls back locally.
Captures have a 90-second deadline so a stalled request cannot keep a worker alive forever.
This is an instrument optimization, not a persistent preview player or export service.

`frame-state-changes.json` is a compact navigation index with changed/new samples,
unchanged sample times, lost sample coverage and a SHA-256 link to the full report.
It neither waives checks nor answers a new visual question. Verify its report hash
before relying on it; the full report remains the measurement and coverage authority.
Safe-area violations and failed spatial expectations stay in the index even when
the sampled pixels are unchanged. See the [efficiency benchmarks and regression protection](../architecture/agent-efficiency.md)
for retained improvements, regression coverage and measured limits.

`pnpm verify:still-session` compares fresh, reused and cached output on real video,
caption boundaries, backward/repeated seeks and transparent fixtures. It requires
exact RGBA identity, equal caption ink bounds and cache hits for every eligible
sample. Nonempty motion/caption/alpha assertions prevent a blank or frozen fixture
from passing. The receipt at `testing/results/still-session/latest.json` records
timings and coverage. Timing is measured, not a flaky wall-clock CI threshold;
unit tests enforce one browser, bounded pages, invalidation and failure cleanup.
Keep this proof in PR CI alongside the existing encoded-renderer contract.
See the [efficiency benchmarks and regression protection](../architecture/agent-efficiency.md)
for measured results, reproduction and coverage limits.
The media-test Python environment supplies NumPy/SciPy. Preserve raw correlation
and the reason for changing comparison methods; do not call this sample identity.
