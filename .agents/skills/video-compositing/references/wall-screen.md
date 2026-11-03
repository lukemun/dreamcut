# Wall screen

Compiled route `wall_screen@1` for "a screen pops open on the wall where I tap". First built as
Wall Hologram (the creator taps a brick wall, a see-through phone feed pops open on it, he swipes
it and watches; approved 2026-11-03, proposal `20261103T002532-e516136e` in
`wall-hologram-rebuild-01a1957c`). The block is general: any locked take where a screen recording
(or any 9:16 clip) opens on a flat area as a see-through panel and the person stays in front.

Not the surface swap: that shows a clip only inside a traced surface. Here the screen is a
placed, angled, cropped panel with a pop-open, and the trace is the person, redrawn from the take
above the screen (subject window `inside` on a copy of the take window).

## What it compiles

One `proposal_create` option with one block; the take stays intact.

1. Lane order (person above screen above take), and any `remove_element_ids`.
2. **Take**: the take's window, uncut (its sound off by default).
3. **Camera**: a camera shape turned to the wall's angle from the pop-open to the end (video
   clips have no rotation of their own).
4. **Screen**: the recording from the pop-open to the end, on its own clock with its sound,
   following the camera; normal blend at the set opacity, exposure in stops, `media_scale` and
   offsets placing its centre where the turn lands it on target, crop as `mask_inset`.
   Pop-open: size on `easeOut` (1 − (1 − p)², measured on the course demo) from the editor's
   smallest picture size, growing from an anchor; offsets and crop keyed with it; opacity rising
   evenly from half a frame in.
5. **Person**: the same take window shown only inside the person cut-out (native subject
   window parented to the take, mode `inside`), so cap, arm and fingers stay in front.
6. **Whoosh** (optional): the tap sound, whole, linked to the screen with `follows_visual`.

## Inputs and the tool that measures each

| Input | How to get it |
| --- | --- |
| `take`, `duration_seconds` | `media_describe`; the window by matching a reference's frames to the take (no tool yet, signal `6f3638f7`; Wall Hologram: frame i = take frame i+73). |
| `screen`, `pop_start_seconds` | The recording's second at the pop-open and when the pop starts. Wall Hologram: screen = timeline − 1.0 s, pop from 1.2 s. Without a reference, put the pop 1–2 frames before the fingertip lands. |
| `person_mask`, `cutout_id` | `cutout_prepare` on the TAKE over the window plus handles, points on head, torso, arm, hand and legs; copy `cutout_status` `grid_matte_mask`. Check fingers at the tap and swipe. |
| `placement` | Size, centre, angle and crop of the open screen: fitted to a reference at full resolution (Wall Hologram: scale 0.6366, centre offset −0.3714, 0.96°, top crop 59/1920 for the status bar), else by eye on a flat patch at hand height. |
| `reveal` | Frames and grow anchor, from the reference's screen bounding box per frame (Wall Hologram: 10 frames, 63 px above centre). |
| `look` | Opacity from a per-pixel blend fit (Wall Hologram: wall weight 0.19–0.21 → 80%); exposure if the reference's screen is brighter than the recording (+0.6 EV). |
| `whoosh` | A supplied sound or `sfx_search`; `offset_seconds` from the pop (Wall Hologram −0.2). |

## Dials

Main: **Screen opens** (frames; the recording keeps its clock and the whoosh moves with it),
**Pop-open length**, **Recording timing** (lines the scroll up with the swipe), **Screen
opacity**, **Screen brightness**, **Whoosh level**, **Screen sound**, **Creator edge**.
Advanced: screen size, horizontal and vertical position, wall angle, four crop edges, creator
edge softness, window strength (0 lays the whole take over the screen), whoosh timing, take
sound.

## Checks

- The creator's head, arm and fingers stay in front of the screen at the tap and swipe
  (frame-state crops at 2×).
- The screen's scroll lines up with the hand's swipe (frame-state through the swipe).
- Frames cannot prove sound; say it has not been heard.

## Limits

One demonstration (Wall Hologram, the course's supplied files, approved 2026-11-03). The screen
is a flat rectangle on a locked camera: no perspective, no tracking of a moving camera. The
recording is assumed to fill the canvas at size 1.
