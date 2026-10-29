---
name: speed-entrance-exit
description: Build the Speed Entrance & Exit effect and its Speed hops template, also asked for as "speed hops", "the speed effect", "zoom from mark to mark" or "speed ramp between my stops". On a locked shot, a cut-out of the subject is keyframed between two places over a few frames with directional blur, so the subject shoots out of frame, into frame or from one marked stop to the next while the set stays still. Use for the Speed Entrance & Exit and Speed hops templates and for marked stops from Storyboard. Not for playing footage faster (playback speed, speed ramps on a clip) or for whip transitions between two shots.
---

# Speed Entrance & Exit

The speed comes from **position keyframes on a cut-out**, never from playing the
footage faster. The tutorial behind the template: film the move, cut at the frame
the subject takes off, keep about 6 frames, cut the subject out of those frames,
set one position keyframe where the subject is and one somewhere else, ease
between them (the speed ramp) and turn on motion blur. The empty set stays behind
them the whole time.

Two corrections show what goes wrong when this is skipped (see [evolution](evolution.md)):
playing a walk at 4× reads as walking fast, not as the effect, and a cut-out that
always streaks in from the left and out to the right ignores where the subject
actually is.

## Choose the variant

| Variant | Use when | Each move |
| --- | --- | --- |
| **Out and in** (tutorial default) | Separate poses or takes, "streak out of frame and reappear" | The subject shoots off the nearest edge in the direction they move, the empty set shows for a few frames, then they shoot in at the next pose. |
| **Mark to mark** (the Speed hops template) | The creator marked stops on one take ("land at Mark 2, hold, then zoom to the next mark") | The subject shoots straight from where they stand at Mark N to where they stand at Mark N+1, growing or shrinking to match, and lands on the live footage at Mark N+1. |

A first stop that starts from an empty set (Mark 1 is the empty set) gets an
entrance from off frame in both variants. When the creator's words do not decide
between the variants, build Mark to mark for marked stops and Out and in
otherwise, and name the other in the card's assumptions.

## Inputs

| Input | Required | Notes |
| --- | --- | --- |
| Performance footage | Yes | Locked camera. Whatever the frame crops stays cropped in the cut-out. |
| Empty set | Yes | The same framing with nobody in it: a separate take, or frames before the subject enters (a Mark 1 on the empty path). |
| Stops | Yes | Storyboard marks (`storyboard_get`, the creator's Mark 1…N in order) or the poses the creator names. |
| Hold lengths | Optional | Default 0.5 s live at each stop, shortening toward the end when there are many stops. Use the creator's numbers when given. |
| The last stop | Optional | When the creator delivers a line at the last stop, that stop plays live to the end of the line with its sound. |

Missing empty set or unlocked camera: stop and say so; do not translate the whole
frame as a substitute.

## Reference timing

Measured frame by frame from the reference tutorial (25 fps):

| Moment | Frames | Seconds |
| --- | --- | --- |
| Exit streak (subject leaves frame) | 2 | 0.08 |
| Empty set between poses | 4 | 0.16 |
| Entrance streak, far subject | 2 | 0.08 |
| Entrance streak, close-up subject | 5–6 | 0.20–0.24 |
| Hold at a pose | 12–25 | 0.5–1.0 |

Defaults at 30 fps: entrance or exit 3–4 frames; a Mark-to-mark hop of two halves
of 6 frames (0.2 s each, 12 frames in all; 4-frame halves read as too fast on real footage); a first entrance of 4 frames.

## Build

**Preferred route: the `hop_sequence` block.** Send `proposal_create` with one option whose
`blocks` holds `{block_id, kind: "hop_sequence", version: 1, inputs, settings}` and no hand-written
clips. Inputs are what you measure in steps 1, 2, 4 and 5 below: the footage, the empty set, each
stop's cut-out (`source_offset_seconds` = the cut-out's source interval start, plus an `exit_cutout`
when one window would be too long), subject box, settle and takeoff seconds, `line_end_seconds`,
`lane_order_keys`, `remove_element_ids` and the clip grade. Send only settings that depart from the
defaults (`variant`, `streak_frames`, `empty_beat_frames`, `travel_percent`, `blur_percent`,
`hold_seconds` per stop, `speed_at_stops`, `direction` per hop, `fade_percent`, `ease`). The server
compiles frame-snapped, non-overlapping clips and gives the creator those settings as dials; a cut-out
too short for the longest streak is refused by stop and setting name, so cut each stop to cover
12 frames either side. Steps 3, 6, 7 and 8 describe what the block does and remain the fallback for
a hand-written card (for example a variant the block does not have).

**Speed hops in one card.** For the Speed hops template, pass `template: "speed_hops"` and
`sounds` in the inputs and send no settings. The template is always Mark to mark (6-frame halves,
light see-through), so the card leaves off the style, distance, empty-scene and direction dials and
shows plain ones: Hop length, Blur and Pause at stop per hop, and Sound volume, with slow motion,
see-through and easing under All hops. `sounds.landings` takes the arrival whooshes from step 9
(each `{source_url, source_duration_seconds, peak_seconds}`, from `sfx_search`), used in turn, and
`sounds.last_landing` the close-up whoosh for the hop into the line. The block places each one so its
peak lands on the landing frame and locks it to that streak with `follows_visual`; Sound volume 0
makes them silent. Picture and sound then arrive, and are applied, together.

**The ending.** A template is a starting point: fit the card to the creator's take (how many stops,
a line or not) rather than to the demo. Pass `closing_exit` whenever there are frames to leave on, so
the card offers the exit; its Leaves dial switches between out the side, past the camera and Stays
(the subject holds still, the exit whoosh goes quiet), so the creator decides. Leave it out only when
the creator asked to stay or no cut-out can cover it. The exit takes the subject all the way out of frame:
`style: "past_camera"` (grows past the lens) after a line to camera, where cropped edges would show
on a slide, or `"side"` otherwise. After a line, the exit is the line's last frames, so give
`closing_exit.cutout` covering the last 12 frames before `line_end_seconds` (prepare it with
`cutout_prepare`); after a hold it uses the stop's own cut-out from its takeoff. `sounds.exit` takes
the "Takeoff whoosh", peaking a frame after the subject sets off. The card gets a "Leaving" section
(Leaves, Hop length, Blur).

**Speed Entrance & Exit in one card.** Pass `template: "entrance_exit"` (always out of frame and
back in; Style and Empty scene hidden), `first_entrance: true` and `closing_exit`. One stop is
enough. A stop is either a footage window (`cutout`, `settle_seconds`, `takeoff_seconds`) or a still
pose: `pose: {source_url, moving_source_url?, place?}` where `source_url` is the standing pose,
`moving_source_url` a walking pose for the streaks and `place` where the pose stands
(`media_scale`/offsets as on any picture); measure `subject` there. Pose stops need no `source`
and hold 1.5 s by default. Footage and pose stops can mix. Put the landing and exit whooshes in
`sounds`.

1. **Read.** `timeline_get` (revision, My Style, any grade already on the clip, which
   every new clip copies), `storyboard_get` for marks and their source seconds, and
   record the direction with `editing_feedback_record`.
2. **Find each stop's settle and takeoff frames.** Marks say roughly where a stop is,
   not when the subject moves. Call `visual_activity_prepare` once over the stretch with
   `holds: {at_seconds: [each mark's timeline_seconds]}`: for each mark it returns
   `settle_seconds` (they come to rest), `takeoff_seconds` (the first frame of their next
   step), `at_rest` and `contrast`, judged from the footage's motion around that mark, so a
   far small subject reads like a near one. Use them as the stop's settle and takeoff. Read
   the frames (`source_evidence`) before trusting a stop whose contrast is below about 0.6 or
   that is not `at_rest`: motion behind the subject (a swing, traffic) delays the takeoff a few
   frames, and a stop where they talk and gesture (the line at the camera) has no clean
   takeoff, so take only its settle. A stop where they never stand fully in frame has no
   settle: use a full-body moment and say so on the card. The settle and takeoff are what
   happened; how much of the stop to show is the Pause dial's job, not the measurement's.
3. **Plan the timeline** from those frames as a table before writing operations, per
   stop: streak in (cut-out) ending on the frame the live hold starts; the live hold
   (original footage) starting while the subject stands still and ending about 6 frames
   after the takeoff, so they are seen walking toward the next stop; the streak out
   (cut-out) starting on that mid-step frame. The streak in uses frames where they
   already stand still, so they land stopped. Each hold dial keeps the takeoff
   fixed and reaches back: it binds the live clip's `source_start_seconds` and the streak
   in's source window with multiplier −1. The first stop opens live on the subject walking
   in to it (or already in frame, when the creator asks for that). A hop that would pass
   through an obstacle bows around it through a control point on the side the creator names.
4. **Cut out each stop.** `cutout_prepare` one window per stop covering the streak in at
   every hold and streak setting, through the takeoff plus the longest streak. Long
   windows can fail preview parity: split a stop into a streak-in window and a takeoff
   window. Put positive points on head, torso and legs at the prompt frame. Poll `cutout_status`; reuse completed receipts for the
   same window. Check `media_readiness` on each cut-out file; a cut-out that fails
   preview parity is re-cut over a shorter window.
5. **Measure the subject at each stop** from the cut-out's mask frames
   (`cutout_status` `grid_matte_mask`): the box at the arrival frame and at the
   departure frame, as fractions of the frame. Record centre (x, y) and height h.
   A subject cut off by the frame edge has a short box: estimate the full-body height
   for sizing and say so on the card.
6. **Compute the keyframes.** Units: `media_offset_x`/`media_offset_y` are half-canvas
   units (1 moves the picture half the frame width or height; positive is right or
   down) and `media_scale` scales about the frame centre, so a point p lands at
   `0.5 + s·(p − 0.5) + offset/2`. To put a subject with centre c and height h at
   centre c′ and height h′: `s = h′/h`, `offset = 2·(c′ − 0.5 − s·(c − 0.5))` per axis.
   - Mark to mark: the swap point is the midpoint, centre `(cA + cB)/2`, height
     `√(hA·hB)`. The departure half goes from identity (scale 1, offset 0) to the
     midpoint with `easeIn`; the arrival half starts at the midpoint (computed for B's
     box) and ends at identity with `easeOut`. Swapping cut-outs at the fastest, most
     blurred frame hides the change of pose.
   - Out and in (what the tutorial actually does, checked frame by frame): open on
     the subject already in frame, moving. Each exit moves only about 15% of the
     width (`media_offset_x` ±0.3) over 2–3 frames toward the next stop while
     `media_opacity` fades 1 → 0.25. A few frames of empty set follow (a "gap" hold
     binding only later starts). The entrance comes from the side travelled from
     with opacity 0.4 → 1, over 3 frames for a distant stop and 5 for a close-up.
     The body stays readable throughout; it never flies across the frame.
   - Blur rises quickly through the streak out and stays at its peak, with the move at
     full speed (no ease out), until the last frame before landing. The landing frame
     is the live clip, sharp and still. A blur or move that eases out reads as the effect
     ending before the stop. It is a Gaussian
     whose value is its spread, so it fades a body as much as it smears it: keep the
     peak near 0.08 × the subject's height in pixels (8–45 px). At 0.3 × height the
     subject vanished on every hop. Point it along the travel: split the peak into
     `directional_blur_x` and `directional_blur_y` by the hop's on-screen direction,
     never horizontal only. Set each clip's static blur fields to the same peaks and
     link the exit and entry of one hop, titled "Streak out/in from Mark N to Mark N+1",
     so each hop gets Horizontal and Vertical blur dials headed by that hop. Directional blur blurs only the cut-out. Never use `zoom_blur` here: it is
     an edge blur of everything behind the clip, so the whole set smears and the
     subject vanishes.
   - A stop where the frame crops the subject (a close-up at the camera, a body half off an
     edge) has a cut-out with a hard edge along the crop. Never shrink or slide that cut-out
     so the edge comes on screen: the previous stop's full-body cut-out carries most of the
     hop and grows to the next stop's size, then the cropped cut-out takes over at the scale
     that keeps its crop edges outside the frame, `s ≥ (1 − c′) / (1 − c)` per cropped edge,
     and settles to 1.
   - **Exit after the line** (the creator asks to "speed out" when they finish talking): keep
     the line live until the first frame they start to walk off, then one 3-frame streak out
     of frame toward where they walk, then a short beat of empty set and the end. A close-up
     cropped at the frame edge cannot slide sideways without its crop edge showing, so it
     lunges past the camera instead: scale and offset grow together (`s ≥ 1 − offset` for a
     right-cropped subject leaving left), with opacity fading to about 0.2 and blur at peak.
     Cut everything after the exit only when the creator says so.
   - Keyframe times are clip-relative and the last key sits on the clip's last frame
     (duration − 1 frame).
7. **Write one proposal** (dreamcut-proposals): remove or keep the original clip as
   the plan needs; the empty set on the base lane (a short source window at
   `playback_rate` 0.25 covers several seconds); live holds and cut-outs on the lane
   above, `has_alpha: true` on cut-outs, `volume` 0 except the last stop's line;
   `set_lane_order` on its own `element_id`. Video durations derive from the source
   windows; do not send `duration_seconds`.
8. **Give the creator the dials** (see [proposal presentation](../../../docs/standards/proposal-presentation.md)).
   Hold multipliers must be whole numbers, so make the empty set long enough for every
   dial at its maximum instead of binding it.
   - **Hop length:** one `kind: "hold"` timing control (display in frames, 3–12 frames
     per half). Bind each cut-out's `source_end_seconds` and `keyframe_span_seconds`
     (+1), each live hold's and the line's `source_start_seconds` (+1) and each live
     hold's `source_end_seconds` (+1), and every clip's `timeline_start` with a
     multiplier equal to the number of cut-outs before it.
   - **Hold at Mark N:** one hold per stop, bound to that hold's `source_end_seconds`
     and every later clip's `timeline_start`. Name stops, clips and dials by what is
     there ("Hold by the pole", "Streak out: Pole to path"), not by mark number: marks
     get cleared or renumbered, and a creator cannot map "Mark 4" back to a place.
   - **Horizontal blur:** a review control on the first cut-out's `directional_blur_x`
     with `linked_operation_indices` for every other cut-out.
   - **Comes in from:** a review control on the first entrance's `motion_from_side`
     (it appears on any clip whose sideways move starts off frame).
   Put these first in `review_controls`; everything else stays in Advanced adjustments.
9. **Sound (in the hop card through the block's `sounds` input; its own card only for a
   hand-written build, after the picture settles).** First search the sound Library
   (`sfx_search` "speed whoosh"): the Speed hops sounds, the tutorial's own sounds already isolated, are a set whose ids
   start `tutorial-speed-sfx-` ("Takeoff whoosh", "Arrival whoosh 1 (landing)", "Arrival
   whoosh 2 (landing)", "Arrival whoosh 3 (close-up)" and others). Reuse them as they are, one
   per hop: an arrival whoosh on each landing, "Arrival whoosh 3 (close-up)" on the hop into a
   close-up and "Takeoff whoosh" on an exit, each locked to its streak with `follows_visual`.
   Extract only when the set is missing. The reference's hop sound is two
   parts: a laser zap at takeoff (a pure tone near 5 kHz that wobbles and drifts down over
   0.1–0.2 s, over a bright noise crack), then a flyby (noise and a soft tone falling from
   about 2 kHz to 600 Hz over about a quarter second). Library whooshes and synthesized
   imitations (`sound_synth_prepare`) did not satisfy the creator; pull the reference's
   own sounds out instead with `sound_units_extract`, which separates stems and isolates
   each sound by its spectrum, so a unit does not carry the sounds that overlap it.
   Ask or check where the effects are; a tutorial often talks over its opening, and the
   "vocals" stem there is the narrator, not effects. Give a window during the demo, after
   the speech, with drums + bass + other, and name the sounds you expect as `events`.
   In the reference, each hop is two sounds about 0.4 s apart: a deep thump at takeoff
   and a bright whoosh at landing. Use the returned units (already imported), place the
   thump on the takeoff frame and the whoosh on the landing frame (never layered), and place
   each with `follows_visual` on its streak out. For a variant the creator can tune, pass
   `recreate` and propose the rebuilt sound alongside the unit.
10. **Check before reporting.** Open Proposals and preview the card. Inspect the
   landing frame at each stop, the swap frame of each hop and the first frame of the
   line, then play it at normal speed. A still cannot prove motion.

## Limits

- The camera must stay still; a moving camera needs tracking first.
- Shadows and reflections are not in the cut-out, so they do not travel.
- Blur is directional blur on the cut-out, not true motion blur.
- Hop length is one dial for every hop; individual hops are tuned as keyframes on the clip.
- In the `hop_sequence` block, streak length, travel and blur are shared dials (no per-hop dials
  yet); blur is sized as a share of the subject's height at 1080 px regardless of the frame's aspect.
