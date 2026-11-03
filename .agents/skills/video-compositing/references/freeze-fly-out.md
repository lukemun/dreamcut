# Freeze and fly out

Compiled route `freeze_fly_out@1` for "freeze me at a moment and shoot me out of the frame".
First built as Fly Like Superman (he runs into a field, jumps, and just after his feet leave the
ground rockets straight up out of the frame; approved 2026-11-02, proposal
`20261103T004630-fd95a41a` in `fly-like-superman-build-01a1957c`). The block is general: any
locked take where the subject leaves the frame from a frozen moment, up, down, left or right, and
the spot they leave must look empty.

Not the keyframed move: that moves a cut-out over a live take. Here the take stops on the moment,
and the subject's own spot is cleaned with an empty frame of the same take.

## What it compiles

One `proposal_create` option with one block.

1. Lane order (flying clip above the patches above the take), and any `remove_element_ids`.
2. **Take**: from the run-up to the freeze, then held (`trailing_hold_seconds`); the picture ends
   when the hold does.
3. **Outline patch**: one empty frame of the same take, held from the freeze, shown only inside the
   subject's traced outline at the freeze (native subject window, mode `inside`, parented to the
   take), grown by the patch edge.
4. **Shadow patch** (optional): the same empty frame as a `mask_inset` rectangle over the
   subject's ground shadow.
5. **Flying clip**: a person cut-out starting on the freeze frame, slowed, moved out of the frame
   on `easeIn` (`media_offset_y` or `_x`) with a directional blur that ramps up to its peak.
6. **Sounds** (up to three): timed from the freeze; one can be trimmed to end with the picture.

## Inputs and the tool that measures each

| Input | How to get it |
| --- | --- |
| `take`, `freeze_seconds`, `hold_seconds` | `media_describe` and frame-state through the action. Freeze on the way out (Superman: frame 192, feet just off the ground, 6.406 s), not at the apex. From a reference: count the frames before the freeze and the hold after it (3.64 s and 1.9 s). |
| `clean_frame_seconds` | An empty frame of the same take (nobody, no shadow) whose background best matches the freeze. Clouds drift: measure the difference beside the subject (Superman: 10.67 s beat 2.27 s). |
| `person_mask`, `cutout_id` | `cutout_prepare` on the TAKE covering the freeze; copy `cutout_status` `grid_matte_mask`. Check shoes and hands at the freeze; re-prompt a missed one. |
| `edge` | Grow the patch until no edge of the subject is left at the freeze (10 px was enough on export). |
| `shadow` | The shadow's box at the freeze frame, as insets. |
| `cutout` | `cutout_prepare` around the freeze (Superman: take 6.2–6.9 s); `take_offset_seconds` is its first take second; `window_seconds` how much it plays. |
| `flight` | From a reference: direction, time to leave (0.4 s), ease-in, streak length (blur 70 ≈ one to two body heights). |
| `sounds` | A supplied pack or `sfx_search`; offsets from the freeze (Superman: whoosh −0.32 s, boom −0.16 s at −5 dB, trimmed to end with the picture). |

## Dials

Main: **Freeze moment** (frames; flight, patches and sounds move with it, clamped to the take and
the cut-outs), **Hold after the freeze**, **Flight length**, **Pose speed** (the flying clip's
rate), **Streak blur**, **Patch edge**, and a **Level** per sound. Advanced: direction, flight
distance, patch edge softness, a **Timing** per sound, take sound.

## Checks

- Frame-state from the freeze to the end: clean sky and ground where the subject stood, no shoe,
  cap, fist or shadow left, no band of drifted sky.
- The flight leaves the frame within the flight length and reads as one smooth streak.
- Frames cannot prove sound; say it has not been heard.

## Lessons from the first build

- A rectangle patch over the body showed a band of drifted cloud; the outline patch fixed it.
- Blur 140 split into vertical stripes reaching the treeline; 70 is a smooth streak.
- The flying clip's source window must outlast the flight at every speed, or the speed dial runs
  it out mid-flight. The block plays at least the flight's worth of source plus a frame.
- The approved card used a 24 px patch edge to hide a live-preview defect (the held frame's mask
  drifted a frame or two); export was clean at 10 px. The block's default is 10 px.

## Limits

One demonstration (Fly Like Superman, the course's supplied take, approved 2026-11-02). Locked
camera only; the empty frame is a still, so anything moving in the cleaned area (grass in wind,
people) freezes there.
