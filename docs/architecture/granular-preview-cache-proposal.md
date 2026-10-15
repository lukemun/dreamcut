# Granular preview execution — proposed architecture and experiment plan

Status: research recommendation, 2026-10-05. **Not implemented or benchmarked by this document.** External findings are in [granular preview caching](../research/2026-10-05-granular-preview-cache.md). Current implementation is described in [playback architecture](playback-rendering.md).

The next objective should be responsive playback without waiting for an encoded movie. Smaller cache regions are part of the solution, but changing which picture we render is insufficient if the remaining path still captures and encodes frames before showing them.

## What the current experiment established

The recorded controlled example improved cold preparation from 70.791 to 18.425 seconds for six seconds of cached picture within a 24.5-second cut. It used the same 540×960 prepared raster. This is API readiness, not click-to-picture latency. Another workload selected roughly 91% of its picture and took 97.7 seconds to first advancement, while direct playback began in 1.52 seconds. These limited trials argue against a blanket complexity rule; they do not prove masks were the bottleneck. [Recorded method and results](playback-rendering.md#local-experiment-result-2026-10-05).

Today’s classifier flags overlapping videos, alpha, transitions, fades and props outside a closed cheap vocabulary, then expands selected work to two-second windows. The server keys independent sections but renders the complete composition for each selected range. The capture path settles source frames, takes browser screenshots, writes them into an encoder and assembles sections. This is temporal caching, not reusable layer or regional processing. [Classifier](../../src/lib/timeline/preview-cache-plan.ts), [overlap planner](../../src/lib/timeline/prepared-playback-plan.ts), [sections](../../src/lib/render/prepared-sections.ts), [capture](../../src/lib/render/browser-renderer.ts).

We already have verified proxy selection and reusable cutout masks. A cutout correction can preserve mask pixels outside its ROI, but the encoded derivative is still rebuilt; that is different from applying a cached mask in a live compositor. [Proxy contract](../standards/preview-proxy-contract.md), [cutout ownership](cutout-preparation.md).

## Three kinds of granularity

| Dimension | Example | Proposed cache boundary |
| --- | --- | --- |
| Time | A mask matters for 12 frames | Exact active frames plus declared temporal support; do not extend an expensive flag across the entire clip |
| Processing stage | Mask unchanged while text or position changes | Source decode → mask → local effect → transform → composite; cache the expensive unchanged intermediate |
| Image area | A small moving subject or note | Its output bounds plus required sampling border, propagated backward through the effect graph |

A mask is not automatically expensive. Applying an existing mask, computing a new segmentation, decoding alpha media and synchronizing several video layers are different operations. Measure them separately. Proxies address source decoding; they do not remove effect computation, screenshot capture, encoding or source-clock bugs. The OpenFX regional contract and Blender’s intermediate-stage cache offer precedents for separating these concerns. [Evidence](../research/2026-10-05-granular-preview-cache.md).

For a pop-out treatment, the candidate graph is: reuse the background source frame; reuse the subject mask in source coordinates; composite the foreground through that mask; animate the bars live; draw text through the tracked transform. Changing text should invalidate its glyph texture and dependent composite, not segmentation or source decode. Changing bar timing should invalidate bar/composite evaluation only. This is a proposed behavior, not a claim that our present implementation already does it.

## Preferred investigation order

### 1. Attribute the cost and the readiness failure

Add per-frame spans for queue delay, source fetch/decode, mask/alpha decode, frame settlement, effect work, GPU upload/draw, screenshot/readback, image encoding, video encoding and assembly. Keep overlapping spans separate from wall-clock totals. Existing cumulative capture milestones cannot by themselves attribute a slow frame to a mask. Track cache-hit reasons, invalidation reasons, dependency identity, source timestamps and actual presented frame IDs. [Existing timing boundary](../../src/lib/render/browser-renderer.ts), [frame settlement](../../src/lib/frame-runtime/session.ts).

Run ablations on isolated copies or synthetic fixtures: source only; plus mask; plus transform; plus tracked text; plus bars; full composite. Each ablation diagnoses cost and cannot serve as acceptable final visual output. Compare browser and Rust decoding on exactly the same proxy and source clock. Resolve the known stale cached-frame/readiness failure before promoting any new automatic policy. More aggressive caching must not hide a clock bug.

### 2. Build one small live GPU composition path

Prototype a WebCodecs/worker + WebGPU compositor for a bounded set: video textures, transforms, normal alpha blending, simple masks, bars and a text texture. First compare it against the existing live browser path; use the new path only where supported and correct. Share the evaluated scene, source mapping and color/alpha contract with preview/export; do not reimplement authored timing independently. Unsupported operations retain an explicit fallback.

Present a complete set of layers for the same timeline time atomically. Decode ahead into a bounded timestamp-indexed queue; an audio clock schedules picture. On a missed deadline retain the last complete composite or use a lower approved preview quality, never combine independently advanced layers. Seeking cancels obsolete work by generation and only publishes matching results. This is a proposed fix boundary for the class of mismatch we have observed, not proof of its root cause.

The purpose is to avoid screenshot → image bytes → encoder → movie → decoder on the interactive path. External video textures may reduce copies, but hardware decoding and zero-copy must be measured, not assumed. [Browser building blocks and limits](../research/2026-10-05-granular-preview-cache.md#browser-decode-and-gpu-composition-building-blocks).

### 3. Cache masks and expensive intermediate outputs

Start with source-frame decode, mask data and stable text textures. Then cache an expensive effect output or a dependency-closed layer group only when measured reuse justifies its memory and processing cost. Prefer a small RAM/GPU working set for near-playhead work; persist expensive reusable results in the background. MP4 remains a fallback for expensive complete groups, not a mandatory container for every intermediate result.

A proposed cache key includes source/proxy content identity, stream and source timestamp, node implementation version, relevant parameters, upstream identities, color space, alpha convention, quality scale and regional bounds. Downstream transforms should not invalidate an upstream mask. Retiming changes source-time selection and temporal-effect dependencies. Backdrop-dependent blends and effects require the relevant background in their dependency group.

Do not introduce independent RGB and alpha video clocks without a frame-pairing contract. Compare single-channel masks plus RGB source textures against an alpha-capable cached layer; measure decoder cost, bandwidth, edges and synchronization. Existing cutout artifacts should be adapted through their recorded source timing, not regenerated by an AI model during playback.

### 4. Add spatial ROI only where it saves measured work

Begin with a bounded rectangular output region per affected node, not a full general tiled renderer. Propagate input requirements backward: inverse transforms, blur/feather/glow padding, and required neighboring frames for temporal effects. Preserve full-frame fallback for unknown support or backdrop dependencies. Clip offscreen/occluded work only when visibility is provably safe.

Cropping the final screenshot does not prove we avoided full-frame decoding or effect evaluation. The effect itself must accept smaller inputs/output targets. A moving ROI needs its own coordinate transform, border policy and cache identity; the previous cached patch cannot simply be pasted into a different position. Tiling is a later option for large sparse work, with extra scheduling and border costs. [Regional processing evidence](../research/2026-10-05-granular-preview-cache.md#processing-only-the-required-image-region).

Illustrative arithmetic, not a forecast: 300×300 contains 4.34% as many pixels as 1920×1080. A 40-pixel support border makes that 380×380, or 6.96%. Full-source decode and fixed overhead may remain, so neither number implies a corresponding end-to-end speedup.

### 5. Choose caching from measured cost and deadlines

Use declared capabilities for correctness and observed decode/draw cost for scheduling. Animation, a mask or multiple layers is insufficient by itself. Prefer live work that fits the frame budget; background-cache an expensive node whose reuse is likely. Prewarm the next cut’s sources and near-playhead effect results while paused; cancel superseded versions and yield resources to active playback. Treat first-open, idle-prewarmed and repeated-play latency separately.

Offer a visible Auto quality policy only after testing: reduce preview resolution when needed, restore detailed paused frames, preserve layer/timing semantics and original export authority. Never silently omit an effect. Region/cache policy should be internal; users should not have to tune six cache modes.

## Alternatives and relative lift

These are engineering estimates of scope, not delivery promises.

| Candidate | Potential value | Relative lift / limitation | Recommendation |
| --- | --- | --- | --- |
| Narrow current time classifier | Avoids clearly unnecessary prep | Small–medium; still captures and encodes required sections | Diagnostic patch, not sufficient end architecture |
| More render workers | May improve throughput where resources are idle | Small; competes for decoders/GPU/memory and may worsen active playback | Test only with resource measurements |
| Idle prewarm + shorter startup buffer | Hides some work before Play | Medium; cannot rescue a producer slower than playback indefinitely | Use with live path and measured production rate |
| Mask/layer intermediate cache | Reuses unchanged expensive work across text/transform edits | Medium–large; new dependency and frame-pairing contracts | First cache prototype |
| Spatial ROI | Reduces pixel work for small supported effects | Medium–large after node boundaries; borders/backdrops can erase savings | Second prototype, measured ablation |
| Browser GPU compositor | Avoids screenshot/encode preparation for supported live effects | Large; fonts, blend/color fidelity, frame scheduling and fallback coverage | Most informative bounded spike |
| Native Rust GPU compositor | Can own decode/composite/presentation in a future desktop app | Largest; device surfaces, platform decode interop and effect parity | Defer full migration; share declarative scene contracts now |

The GPU browser spike is a recommendation based on available building blocks and the current capture path, not a claim it will meet the target before testing. Rust remains useful for local media services and later native composition. Sending full decoded RGBA frames over HTTP to a browser does not by itself provide a native GPU compositor.

## Falsifiable next experiment

Use synthetic overlapping-video, alpha-mask, blur-border, tracked-text and speed-ramp fixtures, then opt-in private project copies. Compare: existing direct; current Smart cache; live GPU baseline; live GPU + intermediate mask cache; the same + spatial ROI. Keep the authored timeline, proxy, resolution and color settings fixed for the main comparison. Test adaptive quality separately and label it.

Proposed acceptance targets, **not achieved results**: already-open ready-proxy projects start within 500 ms at p95; cold project start within 2 s at p95; warm seeks within 100 ms at p95; the 30 fps compositor finishes its per-frame critical path within 33.3 ms at p95 with headroom tracked; no stale or mixed-generation frames, and no playback pauses over 250 ms during the fixture window. Also report worst case, dropped frames, audio drift, CPU/GPU/memory, and cold preparation separately. Do not count page navigation as Play latency or omit first runs.

Use at least 20 warm interactions per case for the exploratory p95 and five isolated cold starts; report all raw values and expand repetitions before a release claim. Test text edits, mask edits, transform-only edits, seeks across cache boundaries, reverse/retimed sources, proxy changes, GPU loss, memory eviction and cancellation. Verify exactly which nodes/frames invalidate. Retain existing renderer/playback correctness gates and visual review at mask edges and handoffs.

Decision: keep the simplest candidate that meets both responsiveness and correctness. If a supported live path fits the frame budget, do not cache it merely because it contains animation. If ROI does not improve end-to-end latency, keep stage caching without the additional regional machinery.

## Inspection provenance

Code ownership was inspected at base commit `e7ef5b0a89c68635efd7569bcf2eca7f7042d809` with uncommitted experimental playback changes present. File fingerprints and the local audit receipt are retained privately. Source inspection establishes current mechanisms; this research turn ran no new performance trial and changed no runtime behavior.

Implementation follow-up: [Browser GPU preview design](browser-gpu-preview-design.md), dated 2026-10-06, specifies the bounded prototype and testing plan.
