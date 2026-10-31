# Clone Converge

A locked-camera collection of moving copies flashes into its original stop positions.
A live foreground copy appears; every background copy rushes into it on the same
frame, with one low impact. A short live beat separates the merge from speech.
This is distinct from Clone Flash (copies remain) and Speed hops (one traveller).

## Status and inputs

Agent-built native proposal recipe; no dedicated compiled block or one-click
certification yet. Use `proposal_create`, never copy a finished project's timeline.
Read the video-compositing, speed-entrance-exit, rotoscope and sound-design skills.

For a new disposable input project, import the declared sources explicitly with
`media_import`. Before measuring with `visual_activity_prepare`, place the plain
source take in the bounded agent workspace: that tool measures timeline footage,
not an unplaced source path or a pending proposal. Keep the source clock mapping.
Wait for `media_readiness` to report ready, then use
`element_create_from_source_window` on a `visual_N` lane, with `volume` on the
element row, not inside `props`. Check that placement succeeded before measuring.
Call `assembly_handoff` before staging the effect as a proposal.
On an existing working cut, use its matching footage or inspect source frames;
never place a temporary measurement clip into the creator's cut without a proposal.
Prepared-input manifests must name source offsets and receipt/job IDs separately
from cutout filenames; a correction filename is not a `cutout_status` job ID.

Supply a locked take, an empty plate, and the verbal selection brief; explicit stopped
moment marks and speech start/end times are optional. Reuse matching intake annotations
first; missing stopped windows follow [media annotation’s action-window procedure](../../media-annotation/SKILL.md#useful-action-windows). No empty plate: report the missing input; never
use footage with the performer running in the background. No usable stopped
handles: shorten the hold or ask; never silently freeze or slow the copies.

Use `source_evidence` and `visual_activity_prepare` to locate stopped windows.
Prepare moving alpha cutouts with `cutout_prepare`/`cutout_status`, preserving
source offsets, readiness receipts and the original grade. Reuse valid prepared
cutouts, but distinguish a prepared-input trial from a raw-footage trial.
Measure subject boxes from the returned mask frames. Cropped edges cannot slide
into the picture: use a full-body cutout as the blurred travel carrier when needed,
or split departure/arrival carriers as in the speed skill. State that pose swap.

## Schedule and native construction

Work in integer output frames. Choose timings from safe source handles; these are
starting values, not permission to exceed a stopped window:

- Initial flashes: one frame white, copies spaced three frames at 30 fps. Each
  copy remains live at normal speed at its source position until its departure.
- Pause after the final flash: 0.20 s, adjustable 0–0.40 s when source handles allow.
- Foreground arrival `F`: after that pause. Shared merge `M = F + 8 frames`.
- Speech `S = M + 0.20 s`. Front source in is `speech_source - (S-F)`;
  source out is `speech_source`. The original speech continues from exactly that
  source frame. Without speech, supply a live final hold instead.
- Stagger departures `D_i` over the first few frames after F, but **every arrival
  is M**. Ensure at least three frames per travel. More copies require a longer
  catch-up interval or closer departure spacing, never staggered arrivals.

Build one option: empty plate; one live waiting cutout per stop; one travel cutout
per departure; the live foreground cutout above those layers; original speech;
shutters, movement sounds and one merge impact; complete lane order. A moving
cutout is necessary because independently timed people coexist over one plate;
it is not a baked scene. Preserve source handles and do not cut spoken words.

For a carrier with centre c and height h aimed at centre c' and height h', use
`scale=h'/h`, `offset=2*(c'-.5-scale*(c-.5))` on each axis. Native scale is at most
3 and offsets are within ±2: use a larger full-body carrier if a far clone would
exceed these limits. Keep the foreground camera crop at identity. Estimate its
full-body target size explicitly; its cropped box is not a full-body height.
For a cropped foreground, measure its visible head, shoulders and torso separately;
the cropped mask-box centre and an inferred full-body height are not merge targets.
Measure the same landmarks on the carrier's actual last source frame. Register its
head behind the foreground head and fit its shoulders/arms behind the foreground
silhouette, allowing a smaller carrier behind the foreground when necessary.
Check the blurred silhouette too: a head-centre match can still leave an elbow or
shoulder protruding. Prefer a front-facing, arms-down carrier window over a stopped
pose with an extended arm; inspect the whole prepared cutout for that window rather
than assuming the stopped window is the only usable travel source. Keep its live
motion at normal speed and disclose the pose swap. If no source window fits within
the native transform limits, report the input constraint rather than fading a miss.
Measure the waiting copy's final visible frame and the carrier's actual first and
last used source frames. A stopped-moment box from earlier in the take is not the
carrier box. Compute the start transform from the carrier's first box to the
waiting copy's last box, and the end transform from its last box to the foreground
target at M. When a different pose carries travel, disclose that swap. Inspect the
intermediate frames and timing extremes for drift; endpoint alignment alone does
not establish a continuously matched trajectory.
When the travel carrier uses an independently selected pose/window, hold its source
in fixed while Pause before catch-up moves its timeline start. Bind that source in
with multiplier 0, bind its source out to Catch-up length, and give the pause's
source-out binding multiplier 0 too. Advancing this different source window with a
waiting-copy hold is not source continuity and can move the carrier into a bad pose.
Animate position/scale with easeIn and modest directional blur along the path.
Last keys lie at `(M-D_i)-oneFrame`. Keep carriers opaque through that last frame,
arriving behind the foreground, and end every travel clip at M. Bind
`keyframe_span_seconds` to travel duration minus one frame: it rescales all tracks,
so a penultimate-frame fade/plateau authored as a fraction can shift to a different
output frame when catch-up length changes. Do not add that fade as a workaround
for a target that misses the foreground. They must all finish together. Give overlapping actors
separate lanes. Intentional overlap at the merge is part of the request.

## Sound and useful controls

Resolve Library titles, never project paths: **Camera 02 Shutter Click** on every
initial flash, speed-template arrival whooshes during travel, and **Low thump 1**
for the shared merge. **Low thump 2** is a tighter alternative, not a second layer.
Use `sfx_audition_prepare` for measured peaks/source windows. Peak of the impact
lands at M; trim/fade its tail before S at the default pause. Keep the movement
sounds quieter than the single impact. Retain source titles and per-sound mute.

Use `follows_visual` for flash sounds, anchored to
the waiting copy's `element_id`, with `offset_seconds` equal to the negative
measured shutter peak (plus its chosen source in). Verify the compiled sound's
peak equals that copy's first flash frame. For the shared merge, bind audio starts to
the same timing controls as M. A fixed offset from the foreground's start does
not track a changed catch-up length; use supported `create_audio.timeline_start`
timing bindings instead of a contradictory fixed follows_visual offset.

Main dials: Pause before catch-up, Catch-up length, Beat before speaking, Shutter
volume, Movement volume, Impact volume (link related sound operations). Group
timing through `kind: hold` controls, not independent child starts. Bind:

- Pause before catch-up: waiting source outs, all subsequent starts, plate out and
  merge audio starts. Move travel source ins/outs only when continuing that waiting
  source window; for an independently selected carrier window, bind both with
  multiplier 0 as above.
- Catch-up length: travel source outs and keyframe spans, plate out, speech starts,
  foreground source in (−1), merge audio starts (+1).
- Beat before speaking: plate out, foreground source in (−1), speech starts (+1).
  The merge and impact stay put; the live foreground lasts longer.

Keep timing defaults near the midpoint of genuinely safe ranges. Do not invent
extra source handles to center a slider; narrow its range and state the constraint.
Changing multiple controls must add their deltas, not overwrite one another.
Sound tails can overlap speech at minimum pause; disclose that and keep them low.
Source in is not an independent dial when a hold's source out is derived from it.
Bind fixed waiting source ins with multiplier 0 in the timing contract, or bind both
ends together for an intentional source-window shift. Check Advanced adjustments
too: a working default can still fail at the generated Source in slider endpoint.
The plate's fixed source in needs the same ownership when its out is bound. Include
the three timing controls explicitly in `review_controls` alongside the three
sound groups; use their timing-control indices and `field: "spacing_seconds"`.

## Acceptance

Stage one card and read all dial-sweep warnings, including unchecked controls.
Check default, minimum and maximum timing combinations for source bounds, lane
overlaps, shared M, source continuity into speech, and audio peaks at M. A failed
or incomplete sweep is not a pass. For an unapproved card, run
`pnpm frame-state <project> --proposal-file projects/<project>/proposals/<id>.json --option <option> --at <times>`;
plain frame-state reads the working timeline and does not inspect the proposal.
Add `--out <private-evidence>/<candidate>/<control-variant>` for each candidate and
timing variant so another review cannot overwrite its frames. Keep a manifest beside
each report with the proposal file/hash, option, control values and report hash;
retain earlier failed candidates separately from the current candidate.
Use its proposal-frame-state report before visual review: every
flash, foreground first frame, every output frame through travel, M, and S. Inspect
M−1 at full size for a second head, shoulder, elbow or blur protruding beside the
foreground; repeat at the timing extremes and crossed catch-up/beat corners.
Replay at 1×.
Verify natural motion, matched brightness, no hard crop edges, no leftover runner,
and all copies merging together. Check sound numerically and distinguish listening.

Before claiming reuse, run the fresh-session task in
[recreate-effect](../../recreate-effect/SKILL.md#fresh-session-rebuild-task).
Keep source media and trial evidence private. A successful prepared-input build
does not prove cutout preparation or a different performer's take.
