# Masking Hook

Template `FX-MASKING-HOOK` (Properties → Templates). The video opens on black with
three quick cut-out flashes of the person: white, a colour, then the head only. The
real shot then plays on from the exact source moment the flashes end. Recreated from
a breakdown reel by @willrvail of a video by @nvision.media
(instagram.com/reel/Deb-VcJRpxp); no reference pixels are reused.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Shot of a person | Yes | The shot the edit opens on. The person must separate cleanly from the background for the half second before the shot's first frame. |
| Flash colour | Optional | Default red `#E53935`. |

The agent prepares one moving cutout of that half second. Nothing is generated.

## Build

1. Choose the shot's source in-point `S` (where the real shot will start) and place the
   shot at timeline `T + 0.5 s`, or read it from the working timeline.
2. Call `cutout_prepare` on the source for `S − 0.6` to `S + 0.1` with points on the
   person, poll `cutout_status`, and inspect a frame of the cutout. The cutout file's
   clock starts at the window start: cutout second = source second − window start.
3. Propose (`proposal_create`) three `create_visual` video clips of the cutout on one lane
   above the shot, each 4 frames (0.1333 s at 30 fps), one black frame apart:

   | Flash | Timeline start | Source (original clock) | Treatment |
   | --- | --- | --- | --- |
   | White | `T` | `S − 0.5` to `S − 0.3667` | `subject_flash: 1`, `has_alpha: true` |
   | Colour | `T + 0.1667` | `S − 0.3333` to `S − 0.2` | `recolor_color`, `recolor_amount: 1`, `recolor_preserve_shading: 0` |
   | Head | `T + 0.3333` | `S − 0.1667` to `S − 0.0333` | `subject_flash: 1`, `mask_inset` boxing the head |

   Add `set_lane_order` with the flash lane above the shot lane (top-first). Nothing is
   under the flashes, so the frame is black between them.
4. Set `mask_inset` `[top, right, bottom, left]` from the cutout's mask: box the head with a
   small margin. Check that frame; arms or a raised hand inside the box show too.
5. Replay the card. Check every flash frame and the first frame of the shot.

## Controls on the proposal card

White flash (linked across the white and head flashes), Mask colour, Tint amount.
Source in/out, crop edges and timing stay in Advanced adjustments or the timeline.

## Timing (recreation)

Flashes 4 frames each at 30 fps, one black frame between, so the hook lasts 0.5 s.
The shot starts at the source moment the head flash ends, so the pose carries straight
into it. Reference frame-level timing was judged visually; it is not separately measured here.

## Limits

- Cutout quality decides the silhouettes: holes (for example at backpack straps) show as gaps.
- The head-only flash is a rectangle. When arms surround the head (set B) the crop
  still shows forearm beside the head.
- Flash timing and the head box are not dials on the card yet.

## Evidence

Demo project `tpl-masking-hook-demo` (16:9, 30 fps):
- Set A, canyon selfie (Pexels 8970054). Teaching media in `public/recipe-previews/masking-hook/` with hashes in its `manifest.json`.
- Set B, boulder selfie (Pexels 3010130, 24 fps source), blue colour flash. Check that
  the head box does not catch the arms.
