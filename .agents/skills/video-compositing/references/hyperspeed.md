# Hyperspeed — bounded continuous retime

Native proposal block `hyperspeed@1`; implemented with validation still pending.
Distinct from `hop_sequence` Speed Effect and the Superman peak slowdown.

Supply one **untreated continuous performance**, with a normal-speed lead and
payoff, prepared through `media_import`. A flattened example is reference evidence,
not raw footage. Locked-off framing works best; camera motion is also accelerated.
Use `media_describe` (`plan`) and inspect its samples through `source_evidence`,
then source playback to measure the interval, following media-intake. The agent
still chooses meaningful start/end marks; no action detector is claimed. Source marks use seconds
in the original take, never positions in the example's finished video.

Build one proposal option with `operations: []` and this block:

```json
{
  "block_id": "hyperspeed",
  "kind": "hyperspeed",
  "version": 1,
  "inputs": {
    "source": {
      "source_url": "/api/projects/PROJECT/media/PREPARED_SOURCE.mp4",
      "source_duration_seconds": 24,
      "source_start_seconds": 1,
      "source_end_seconds": 23
    },
    "fast_start_source_seconds": 3,
    "fast_end_source_seconds": 21,
    "timeline_start": 0,
    "lane": { "lane_key": "visual_0", "lane_index": 0 },
    "replace_element_ids": []
  },
  "settings": { "speed": 15, "blur": 10, "audio": "handles" }
}
```

Replace placeholders with the imported source and project, set actual source duration,
and choose source bounds/marks with nonempty normal handles. The native timeline
quantizes source trims, so marks, outer trims and timeline start must align with
the project frame grid. The compiler rejects mismatches instead of moving marks.
Use `replace_element_ids` only for footage this card intentionally replaces; preserve
other clips/lane order. This block does not ripple an existing edit or add an empty plate.
Choose a free registered visual lane when other visuals overlap. Use the normal
proposal preflight/create route; never apply a proposal yourself.

Controls use the existing block-control UI and recompile together on tuning/reset:

| Control | Range/default | Meaning |
| --- | --- | --- |
| Speed | 1–16× / 15× | Middle only. 1× also removes blur. |
| Blur | 0–100% / 100% with temporal source, otherwise10% | Prepared temporal blur mix if supplied (0 original/100 prepared); otherwise spatial smear as percentage of1080px width. 0 is sharp. |
| Original sound | Before and after / Silent | Middle always muted; retained handles at 1× and original pitch. |
| Blur direction | Horizontal / Vertical | Advanced; choose the dominant visible motion. |
| Volume | 0–200% / 100% | Advanced; retained normal-speed sound only. |

The accelerated duration rounds **up** to whole output frames. Actual playback speed
is derived from that duration and the unchanged source span, so it may be slightly
below the requested speed. Lead/payoff stay at exactly 1×, source windows abut, and
payoff shifts with middle duration. Each role has a stable ID across recompilation.
The source-indexed speed clock is shared with `proposal-speed-ramp`; this block
introduces no second renderer or baked media. Existing gradual ramp profiles stay
unchanged. At Speed 1 the middle remains muted by the explicit audio policy.

With no prepared temporal source, blur remains a **spatial approximation**: it
smears the whole fast-section frame, including stationary background. Do not claim
that fallback reproduces temporal motion blur or CapCut's blend/time settings.

An optional `inputs.temporal_blur` accepts an actual source-clock temporal-average
derivative: `{source_url, source_duration_seconds, original_source_url, frame_rate,
sample_frames}`. Its declared original URL and duration must match the source;
frame rate must match the project. Caller must verify the actual preparation receipt,
fingerprint, geometry, cadence and frame count; declarations alone cannot prove them.
Supply `blur_lane` (a distinct visual lane) and a complete top-first
`lane_order_keys` placing it above the original. The compiler adds a synchronized,
muted duplicate only across the fast interval; Blur mixes original and prepared
pixels through native opacity. At Blur0 or Speed1 that layer becomes transparent;
its stable ID and source interval remain, preserving tuning/reset.

Prepare temporal samples symmetrically around each original source frame, with
an odd, short window and greatest weight on the current pose. A trailing-only
window shifts the apparent pose behind its source clock. Preserve every source
frame, PTS, geometry and cadence; at the source boundaries extend the nearest
available frame rather than dropping handles or shifting the clock. Record the
actual kernel and derivative fingerprint, and inspect both fast-section boundaries
and separated moving contours. Centering removes temporal bias; it does not prove
that ghosting is absent. This kernel is fixed until the derivative is regenerated;
speed changes do not rebuild it, so tune the native blend for new rates. This is a
reconstruction procedure, not a translation of CapCut units. Check the registered `media_readiness` schema for `temporal_average` before raw-source
construction. When available, call `action: "prepare"` with the project-media-relative
original `source` and `temporal_average: {sample_frames: 5}`. Poll `action: "status"`
with the returned `job_id` and the same source/kernel. The native recipe accepts odd
windows from 3 to 15 frames with symmetric powers-of-two weights; it authenticates
original/output hashes and checks every decoded frame/PTS before publication. It
extends both source boundaries and supplies a muted derivative plus ordinary preview
preparation. Wait for overall `state: "ready"`, then use its returned `temporal_blur`
metadata with the distinct blur lane/order described above. Preserve the preparation
receipt; status rechecks artifact/source bytes. This is preparation, not automatic
mark discovery or proof of visual quality. The first route is bounded to zero-based
CFR, unrotated 8-bit SDR Rec.709 H.264/HEVC, even dimensions up to 4K, 60 seconds and
60 fps. Unsupported clocks/colour must fail visibly; do not silently resample them.
If the registered tool lacks this field, record the preparation exposure gap rather
than claiming a raw-source native run. A supplied verified derivative can still
exercise prepared-input construction. Complete one-click timing/quality remains
uncertified.
`scripts/verify-hyperspeed-supplied.ts` is an internal render proof, not a replacement
editing tool. Use instructor-supplied original footage for course recreation;
synthetic fixtures are code tests only and tutorial crops are not substitutes.

No automatic whooshes, music replacement, pitch shifts or accelerated dialogue.
No private course assets are bundled in the repository.

When supplied SFX are requested, follow sound-design's supplied-reference branch:
identify each actual occurrence in the mixed reference, then preserve its audible
anchor's offset from the departure or return. A sound may repeat; an attached file
is not evidence that it is used once. Record ambiguity and listening separately.
Use native create_audio with source windows and follows_visual pointing to the
compiled fast or payoff actor, so a speed adjustment also moves the cue. Overlapping
sounds need distinct lanes included in the block's complete lane_order_keys.
Keep useful source tails and original pitch; expose each level and fade, and measure
the combined peak. The pending picture and its dependent SFX must preview together;
supersede an earlier silent draft rather than audition sound against the unretimed
input. Generic activity checks on an unchanged input timeline do not certify the
retimed preview; carry those failures and reference-relative measurements separately.
If the supplied take lacks the reference's head/tail handles, do not invent them or
claim strict full-reference timing. Record missing coverage and the necessary adapted
scope independently of the reusable recipe.

Acceptance: run `scripts/verify-hyperspeed.ts` against an isolated server and the
Hyperspeed/speed-ramp/speed-step/parameter-contract tests. Inspect every transformation
frame plus handles, replay the normal lead/fast interval/payoff and listen to the
retained audio. Check speed/blur/audio dials, reset, application/Undo and persisted
reopen on a disposable project. Fresh real footage and a fresh-session rebuild are
required before calling this reusable/complete; synthetic construction proof does
not establish either. No shared Template/catalog promotion is certified yet.
