# Skyline cover

Compiled route `skyline_cover@1` for "the person seems to run behind a big object, then
jumps over it". First built as Building Jump (a runner appears behind a stadium's roof, then
leaps over it and lands in front; approved 2026-11-02, proposal `20261102T235602-f9416d2d` in
`building-jump-build-01a1957c`). The block is general: any effect where everything below an
object's skyline is covered by the empty scene until the person clears its top.

## What it compiles

One `proposal_create` option with one block; the take stays intact.

1. Lane order (cover lanes above the main lane), and any `remove_element_ids`.
2. **Main**: the take's main window, uncut with its sound (`main_start_seconds`,
   `duration_seconds`).
3. **Cover**: the empty end of the same take (`cover` source window) from the block's start,
   cut to a rectangle below a line just under the skyline (`cover_inset`, `mask_inset`),
   exposure matched (`color_grade.grade_exposure_ev`) and fading out (`animationOut: "fade"`).
   Its `playback_rate` makes it end where the fade should end: live footage, not a held frame
   (a held frame breaks the card's hold and Source out sliders at their ends, and the empty
   end of a still scene looks the same).
4. **Skyline** (optional `edge_cutout`): a cut-out of the object below its jagged top over the
   same take seconds, on the cover's clock, with the same exposure and fade.

## Inputs and the tool that measures each

| Input | How to get it |
| --- | --- |
| `take`, `main_start_seconds`, `duration_seconds` | `media_describe` on the take; the window from `source_evidence` frames, or by matching every frame of a reference against the take (no tool yet, signal `db909acc`; Building Jump: 0.734–9.79 s, a constant 22-frame offset). |
| `cover` | The empty end after the person has left the frame and their shadow is gone (`source_evidence`). Rate = window length / (when the fade should end); Building Jump: 10.2–15.12 s at 0.976, ending 5.04 s. |
| `cover_inset` | The rectangle below the skyline's lowest point, measured on frames (Building Jump: top 56 %). |
| `edge_cutout` | `cutout_prepare` on the empty end, the object below its skyline (sky excluded), with `cutout_correct` to union traces when one trace misses parts; `take_offset_seconds` from `cutout_status`. Check the first, middle and last frames. |
| `cover_exposure_ev` | Fit the cover's brightness to the main take, or to a reference, on the covered area (Building Jump: +0.6 against the demo). State how it was fitted. |
| `fade_seconds` | From a reference's per-frame share of the cover where the legs cross the skyline (Building Jump: opaque to 4.83 s, gone at 5.03 s, so 0.2 s). Without a reference: as long as the feet stay clear of the skyline. |
| `lane_order_keys`, `lanes` | The project's complete top-first order with both cover lanes above the main lane. |

## Dials

Main: **Fade timing** (±30 frames; the empty footage plays slower or faster to end there),
**Fade length** (frames at 30 fps; 0 cuts), **Cover top edge**, **Cover brightness** (stops),
**Take sound**. Advanced: Cover right, bottom and left edges, Cover edge softness.

Brightness and fade are block settings, so they are dials here even though a plain card
cannot make `color_grade` a dial and fades only through each layer's Animation out.

## Checks

- No leg slices along the skyline while covered (frame-state at a few covered moments).
- The cover matches the main take's brightness where it is covered; check during the fade.
- The fade finishes before the feet come back down past the skyline.
- Frames cannot prove sound; say the take's sound has not been heard.

## Limits

One demonstration (Building Jump, the course's take, accepted by the creator on 2026-11-02).
Needs a locked camera, a still empty end and steady light; the live empty end left a small
brightness and texture difference against the demo's frozen, brightened frame (about 8 of 255
in the stands). Nobody has listened to it or watched it at normal speed.
