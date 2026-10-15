# Native render verification

The experimental playback backend needs full-project evidence before replacement claims. The opt-in comparison runner uses explicit isolated project copies, resolves the shared transition layout, and checks every frame for support before encoding. Unsupported scenes never silently fall back. The comparison fixture invokes the same Rust compositor with original render sources and browser caption rendering. Candidate audio is explicitly copied from the reference; this does not prove a native audio engine.

Every decoded frame is checked with an SSIM floor of 0.97, plus stream dimensions, frame count, rate and duration. Failure receipts are preserved. This is a low-resolution engineering gate, not perceptual acceptance, continuous playback proof or production export integration. Source-only eligibility is insufficient without hydrated transition layout. Private real-project results remain outside Git. Initial focused source-authority tests pass; broad project support and parity remain unproven.

The first bounded real-project batch exposed unsupported audio actors, interleaved
text, transition and fit/window semantics. One eligible picture export completed,
but full decoded-frame comparison failed the unchanged per-frame threshold. The
reference needed bounded render batches after repeated browser-context failures.
No broad native parity claim is warranted. Scene/route, native unit and synthetic
pixel tests, typecheck and registry checks passed; these do not waive real-project
mismatches. Audio remains unassessed in the picture-only diagnostic batch.

Source-clock correction: the native decoder now selects presentation timestamps
from the source instead of resampling all footage to 30 fps. The scene adapter
uses the existing renderer's frame-quantized speed-step clock, retaining fractional
source time through the protocol. Synthetic 24 fps and variable-rate fixtures
verify selection before/at boundaries and after backward seeks. Audio-only lanes
are excluded from picture eligibility because their existing mixer owns them;
embedded clip audio is not thereby certified. The real comparison improved but
still has unexplained image differences. Timestamp indexing currently requires a
source probe and needs startup-cost/bounded-resource review for long footage.

The next engineering fixture replaces video decoding while reusing the complete
owned browser compositor and authored audio pipeline. Atomic source packets retain
straight alpha and settle before effect draws; the original scene-compositor test
remains separately selectable. The source path, packet and timestamp tests pass,
as do Standard renderer/playback regression gates. Full native effect and live UI
acceptance remain pending. A long-render investigation found that closing the HMR
socket could trigger a page reload; capture isolation now suppresses messages while
keeping the connection open, with a regression test for that lifecycle.

The opt-in source backend is now wired to the real editor and tracked export jobs.
One shared engine selection controls playback and new exports, with explicit Rust
job/receipt identity and no silent native-export fallback. An active job requested
under a different engine returns a conflict rather than masquerading as that engine.
The normal API completed a full-HD export on an isolated copy; decoded structure
matches its authored frame count. This is implementation and structural evidence,
not full audiovisual acceptance.

The existing renderer contract now has an isolated native mode: the same 46 effect
cases, reset/repeated-seek checks, variable-rate clock, 3D and encoded comparisons
run under NativeSourceProvider. Its first run passed all existing assertions. The
mode generates synthetic project-local source fixtures and keeps results separate
from Standard evidence. No effect assertions were loosened. Full transition-family
and real-time/audio acceptance remain outstanding.

Session pressure during a layout change exposed a fallback defect. Serialized
source requests, explicit release and idle-worker reclamation have regression
coverage; independent UI retest was unavailable and is not claimed. A synthetic
nonzero-container-origin video then failed native decoding; normalizing source PTS
to the container origin fixes it, with exact forward/backward frame checks. Native
source bounds now permit Full HD/4K-sized surfaces, while project/catalog/public
asset resolution retains real-path confinement and foreign project rejection.

Native timing verification now includes natural-duration looping, synthetic
video-backed surface text, stepped and ramped audio/video exports, and the actual
staged preview component. These targeted proofs pass. A small live fixture presents
roughly29 distinct frames/sec over three replays with p95 transport lag about67ms;
this is not a full-size/project performance guarantee. The new six-family moving
video transition comparison remains failing: it exposed color handling differences
between browser-decoded footage and raw native RGBA even before transition onset.
The failure remains actionable; no threshold was weakened to mark transitions done.


The six moving-video transition families now pass alongside all 46 effect cases.
The decoder now converts declared source matrix, primaries, transfer and range into
sRGB before browser composition, retaining straight alpha. Existing comparison
thresholds remain unchanged. Untagged-source fallback is bounded and HDR/wide-gamut
acceptance remains unverified; this is not professional color-management certification.

Stream metadata now selects the VP8 or VP9 alpha-capable decoder independently of
file extension. A new encoded fixture first rejected the missing codec field, then
passed transparent VP8/VP9 forward, repeated and backward seeks after integration.
Both the full source path and legacy diagnostic endpoint supply the codec. Other
codecs keep FFmpeg's automatic selection. A metadata integration test verifies the
stream-derived selection, while Rust rejects values outside the closed codec enum.

Real project playback remains a release blocker: broader scenes exhibit visible
presentation lag despite passing settled-frame and small-fixture tests. These
measurements do not establish real-time audiovisual acceptance. Preserve separate
performance evidence rather than treating the renderer suite as a playback certificate.

Native source-only batches now skip the CPU scene blend when there is exactly one
untransformed, fully opaque layer on a transparent output surface. The shortcut
retains canonical transparent RGB and is checked against the general compositor
for every 8-bit alpha value; transformed/masked/layered scenes retain the old path.
Encoded seek/alpha fixtures also pass. This reduces redundant work but has not
resolved real-time lag in complex compositions.

Hidden preview stages now await `settleFrameResources` before publishing; screenshot
and export callers still use `settleFrame`, which additionally awaits browser paint.
A runtime test enforces image/source/effect ordering, capture paint, and rejection
before effects when decoding fails. Small performance differences alone do not
certify the real-project playback requirement; continuous transport tests remain
separate from these ordering and source-pixel proofs.

The experimental preview now prepares up to three timeline frames ahead, using
measured preparation time and transport rate. It publishes only when the playhead
reaches the prepared frame; missed deadlines use the existing coordinated buffering
gate instead of allowing audio/transport to leave picture behind. Pause and seek
require exact current frames and supersede stale staging work. Pure scheduling tests
cover future-frame suppression, rate/end bounds, deadline buffering and stale seeks.
The real native fixture passes random seeks, three replays and retimed export.
Complex source-changing projects still buffer excessively; bounded lag is not a
smoothness certificate. The verification fixture now also exercises 2× transport.

Staging workers now share a bounded, server-owned source timestamp index instead
of independently probing each new source. The index uses source identity including
size/modification/change times, packet presentation order with decoded-frame fallback,
and normalized container origins. It retains at most 64 sources/four million timestamp
values, deduplicates concurrent inspections, and limits in-flight inspections to eight.
Only selected frame index/PTS cross the Rust protocol; decoder and transport state
remain session-local. Direct helper callers retain the original timestamp-probe path.
Encoded VFR/nonzero-origin tests and actual VP8/VP9 metadata integration cover the
new host-provided position path.

Preview also inspects the nearest two distinct verified-proxy sources within two
seconds, reconsidered every quarter timeline second. This only warms metadata/indexes;
it does not start media playback or claim that future pixels are decoded. Warmup
requests are separate from active frame requests and retain origin/path/resource
validation. Failures do not block the current frame. Full-size edits still buffer
too much; continuous playback acceptance is outstanding. Never treat a warmed index
as permission to skip frame readiness.

A larger preview frame queue was evaluated and rejected: maintaining extra scenes
and preparing too many intermediate frames worsened complex-project playback.
The active preview retains the previously tested two-stage ahead scheduler.
This is evidence against treating more buffering as a general performance fix.

Rust reply transport now allocates the declared bounded payload once and fills it
across pipe chunks. Tests cover every split boundary, adjacent replies, errors,
partial frames and invalid/oversized headers; unexpected extra replies fail closed.
The previous accumulated-buffer concatenation copied earlier bytes repeatedly.
A local 50-frame 1280×720 microbenchmark fell from 101 ms to 5.5 ms with identical
payload bytes; this is transport assembly timing, not end-to-end playback speed.
The browser also uses the received RGBA view directly and only resizes a source
canvas when dimensions change. Logical decoder IDs distinguish authored uses of
one file, while native source IDs still validate each returned frame separately.

Mounted image readiness is now retained by the frame session for an unchanged,
complete image that has already decoded successfully. Source, responsive-candidate,
load failure and session changes invalidate that readiness. A replacement during
an asynchronous decode must pass its own decode before it can become ready;
bounded retries prevent continuously changing sources from hanging settlement.
This avoids repeating decode promises on every staged frame. Focused tests cover
reuse, invalidation, source replacement, failure and session isolation. Initial
real-project measurements showed only a small playback improvement; native playback
remains experimental and this does not resolve the larger presentation delays.

The variable-rate loop fixture exposed a source-duration mismatch: declared stream
metadata ended before the final decoded presentation sample. The browser retained
the longer tail while native looping wrapped at the shorter metadata boundary.
Native source clocks now retain the verified sample end (PTS plus positive sample
duration) and keep the larger of that end and the declared duration. Explicit loop
windows still bound the result. The loop proof derives its expected boundary from
the decoded presentation interval, preserving the same exact frame assertions.
Shared timestamp arrays are frozen so one consumer cannot alter another's clock.

The same tail fixture also contains a packet marked for discard. Its packet count
still equals the declared frame count, so count agreement alone cannot establish a
presentation clock. Both host and Rust fallback clocks now detect discard flags
and use the decoded-frame oracle. Tests compare the full VFR index with decoded
frames and require beyond-EOF seeks to retain the last displayed picture rather
than address a discarded packet. This closes the tested tail case without relaxing
source-frame or loop-boundary assertions.

Complete native scenes now select settled effect drawing explicitly. Alpha, chroma
and LUT surfaces keep their registered frame-barrier callbacks but do not also run
continuous preview animation callbacks. Explicit frame captures use the same mode;
ordinary browser playback keeps live callbacks. The playback regression instrument
observed 30 redundant canvas draws during a paused 250 ms interval before this
change and requires none afterward, while requiring that the source was drawn.
Seeks, replay, 1x/2x transport and encoded retimed audio/video pass that instrument.
The change removes redundant work; real-project throughput remains separately
measured and is not established by the paused-drawing assertion.

Representative encoded-output review exposed SDR darkening before grading. The
native source-color resolver now matches Chromium’s display interpretation for
BT.709, SMPTE170M and BT.2020 SDR transfer tags, retaining declared primaries and
range and leaving PQ/HLG unchanged. The renderer verifier adds a synthetic tagged
mid-gray check that catches transfer-induced darkening before composition. This
is browser compatibility, not HDR certification. Real direct-video screenshots
still differ from canvas composition on the current host; that distinction remains
under investigation and must not be hidden by editing project grades.

Reference: [Chromium ColorSpace transfer functions](https://chromium.googlesource.com/chromium/src/+/lkgr/ui/gfx/color_space.cc).

The mixed native export proof now exercises `vo_full`, `vo_segment`, `music` and
`sound_effect` on their actual audio lane families. Each produces non-silent stereo
PCM of the full authored duration, byte-identical to the narration baseline under
the same stepped source clock and gain. This closes actor routing/export coverage;
it does not certify separate live playback or listening acceptance for every actor.

The alpha playback instrument now supports the native source backend using an
isolated synthetic VP9 source. It checks subject, transparent background and
outline through three complete replays, exact source geometry during repeated
backward seeks, and all 60 encoded frames. Standard retains its separate browser
callback-starvation checks; native canvas sources do not use that callback API.
This closes bounded moving-alpha coverage, not arbitrary cutout quality or
continuous real-project visual acceptance.

The native alpha instrument also checks captions placed in front of, between and
behind visual lanes. Glyph counts prove partial occlusion and complete hiding;
backward seeks are exact. Encoded samples compare with independently captured
scenes passed through the same encoder, separating saturated-glyph chroma loss
from compositing errors. This fixture passes along with the moving-alpha checks.

The eight-source protocol bound previously also rejected scenes with more than
eight simultaneous videos. The provider now collects sequential bounded batches
and publishes source canvases only after every batch validates. The server retains
its existing decoder limits. Unit tests cover ordering, batch size, late failure
and incomplete replies; a nine-source integration probe passes forward/backward
seeks and encoded output. Larger scenes can evict decoder caches between batches;
this removes the correctness cap without promising unlimited real-time throughput.

Concurrent preview/export acceptance exposed a second capacity defect: a fifth
session could fail even though existing work would shortly release a worker.
Requests now enter a bounded FIFO scheduler (four active, 64 queued), with explicit
queue timeout/full errors and duplicate-session rejection. Idle workers may be
reclaimed immediately when a queued request acquires capacity; active frames are
never interrupted. Unit tests cover failure release, queue limits/timeouts, FIFO
order and ownership release before a follow-up request. An integration probe
completed three rounds of eight concurrent sessions with identical decoded pixels.
Full renderer and production acceptance remain separate checks.


Renderer verifier lifecycle follow-up: the full contract process stopped reporting
after fade while its owned browser child was gone; an isolated sweep of the next
transition captured all twelve preview/export samples. The retained full run was
terminated, not counted as passing. The harness now logs stage failures before
cleanup and tears down its owned launch-server handle; transition starts are logged
so future failures retain their location. No pixel threshold or case was removed.

## Explicit verification-browser teardown

The renderer contract runner could finish its transition assertions, lose its browser
child, and remain pending in `browser.close()`. It now owns a Playwright browser
server and tears that server down in `finally`, including connection failures. This
matches the GPU verification lifecycle. Pixel, timing and encoded-output gates are
unchanged; this addresses verification cleanup rather than playback performance.

Validation: tool registry and typecheck pass. The complete renderer command exits
successfully after 46 effect cases, 3D, 138 encoded frames and the surface-tracking
perspective/text/visibility/reset/seek/encoding checks. The prior stalled stage now
advances to encoded-output verification; no assertion threshold changed.

## Playback fixture actor preservation

GPU/mixed playback previously filtered the synthetic composition to videos, dropping
captions and stills. The fixture now removes only audio actors rendered by the
separate audio mixer. GPU receipts assert expected text actor IDs; video-fill probes
also assert exact source slots and timestamps. Earlier caption playback claims are
superseded by the `playback-actors-v2` instrument; source/audio-only evidence remains
valid for its actual scope. No production editing or export authority changed.

## Distinct photographic transition samples

Inspector recordings now support a public, credited photograph pair in place of
recoloured illustrations. The recorder accepts only hash-matched sample sources;
photo substitution is an in-memory verification fixture, never a timeline write.
The editable sample project receives the equivalent source replacements through a
normal proposal. Public source credits identify the portrait, mountain scene and
AI-assisted still cutout. Manifest hashes version the preview URLs so refreshed
recordings replace browser-cached media.

Whip now mixes overlapping shots through directional blur. Cube uses adjacent
rigid faces with one shared edge instead of independent page-like hinges. Unit
coverage checks the seam in all directions and both canvas shapes, while the
existing renderer verification exercises seeking, endpoints and encoded parity.
