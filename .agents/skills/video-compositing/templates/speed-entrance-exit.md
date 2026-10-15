# Speed Entrance & Exit

Template `FX-SPEED-ENTRANCE-EXIT` (Properties → Templates). On a locked-off shot, the
subject's moving cutout streaks into the empty set with horizontal motion blur, lands
sharp and performs, then streaks out while the set stays still.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Performance footage | Yes | Locked camera, whole visible subject, a few seconds of performance. |
| Matching empty background | Yes | The same framing without the subject: a separate take, or frames of the same take before the subject enters or after they leave. |
| Entrance and exit sides | Optional | Default: in from the left, out to the right. |

The agent prepares one moving cutout covering the performance.

## Build

1. Import the performance and a still of the empty set (`media_import`). Place the
   empty set as the base layer.
2. `cutout_prepare` the performance window with points on hair, face, torso and each
   visible arm; check start, middle and end frames for missing hair or hands.
3. Propose one `create_visual` video clip of the cutout above the set
   (`has_alpha: true`), source window = the performance, with
   `transition_keyframes`:
   - `media_offset_x`: `-2 → 0` over 0.2 s (`easeOut`) at the start, `0 → 2` over
     0.2 s (`easeIn`) before the end;
   - `directional_blur_x`: `160 → 0` across the entrance, `0 → 160` across the exit.
   Add `set_lane_order` with the cutout lane above the set.
4. When the camera frame is not 16:9 (for example 4096×2160), give the set and the
   cutout the same `media_scale` (1.0667 for 1.9:1 in 16:9) so they stay registered.
5. Replay the card. Check the frame the subject lands, the settled performance and
   the exit streak.

## Controls on the proposal card

Source in, Source out, Horizontal position and Scale. The streak keyframes stay in the
proposal and are edited as keyframes on the clip.

## Timing (demonstration)

Empty set 0.6 s, entrance 0.2 s, performance about 6.4 s, exit 0.2 s, empty set 0.4 s.

## Limits

- The camera must stay still; a moving camera needs tracking.
- Whatever the camera cropped stays cropped: a subject cut off at the frame edge
  streaks in cut off.
- Shadows and reflections are not part of the cutout.

## Evidence

Demo project `tpl-speed-entrance-demo` (16:9, 25 fps), proposal
`20261015T053604-689f5e70`: Pexels 8798070, cutout source 5.5–12.5 s, empty set from
0.4 s of the same take. Teaching media in `public/recipe-previews/speed-entrance-exit/`.
