# Matched-take region

Compiled route `matched_take_region@1` for "swap one area of the main take for the same
area of a second take filmed from the same spot, keep the person in front, bring that
take's sound". First built as Liquid from Object (coffee pours from under a pressed phone;
approved 2026-11-02, proposal `20261102T213901-2709130d` in
`liquid-from-object-build-01a1957c`). The block is general: any effect where an action
from a second matched take must appear inside a box while hands or a person stay in front.

## What it compiles

One `proposal_create` option with one block; originals stay intact.

1. Lane order (region lane above the main lane), and any `remove_element_ids`.
2. **Main take**: uncut, on its own source clock, with its sound (`main`, `duration_seconds`).
3. **Region**: the second take above it, cropped to `region_inset` with `mask_feather`,
   muted, and windowed by the main take's cut-out through the native subject window
   (`subject_window_parent_id` = the main clip, mode `outside`). The cut-out follows the
   main clip's source clock, so the hands stay locked to the main take whatever the slip.
4. **Sound** (optional `sound`): a window of the second take's sound on the second
   take's clock, linked to the region with `follows_visual`, short fades.

## Inputs and the tool that measures each

| Input | How to get it |
| --- | --- |
| `main`, `matched` sources | `media_describe` on both takes. `matched.source_start_seconds` is the slip reference: the second-take second that plays at the main window's first frame. Choose it so the action lands on the main take's moment (the press); this is the agent's judgement from `source_evidence` frames of both takes, so leave at least one second of handles either side for the timing dial. |
| `region_inset` [top, right, bottom, left] | Measured on `source_evidence` frames of both takes, wide enough for the action and no wider: everything else that differs between the takes inside the box shows. Agent's judgement; never copy another card's box. |
| `subject_mask` | `cutout_prepare` on the **main** take covering the whole window, then copy `cutout_status` `grid_matte_mask` verbatim (the proposal refuses a mask that does not match its prepared cut-out). Check fingers over the region with `pnpm frame-state` at the crossing frames. Pass the receipt id as `cutout_id`. |
| `sound` | Second-take source seconds around the audible action (`source_start_seconds`, `source_end_seconds`), from listening or the take's peaks. Pass the audio stream's own `source_duration_seconds` when it differs from the picture's. |
| `lane_order_keys`, `lanes` | The project's complete top-first order with the region lane above the main lane. |

## Dials

Main: **Second take timing** (±30 frames, later is positive; moves the region's source and
its sound together, clamped to the handles), **Expand edge** (−20 to 40 px), **Edge
softness** (0–30 px), **Sound level** (0–200 %, hidden with no sound).
Advanced: Window strength (0 turns the cut-out off: a quick check that it is doing its
job), Area top/right/bottom/left edges, Area edge softness, Main take sound, Sound fade in
and out. Defaults: expand 2 px, softness 2 px, strength 100 %, area softness 0.15 %, one
frame fade in, three frames out.

## Checks

- Fingers whole wherever they cross the region (frame-state at the crossing frames,
  2× crops against the source decode).
- No visible box edge at full size; look for differences between the takes along each
  edge (Liquid's demo shows a thin light gap under the phone's left underside from its box:
  fix it in the box measured for that take, not in the defaults).
- The second take's action lands on the main take's moment at default timing, and the
  timing dial's ends still read.
- Sound: check the loudest moment lands where the action shows. Frames cannot prove
  sound; say it has not been heard.

## Limits

One demonstration (Liquid from Object, one take, accepted by the creator as enough for
now; the owner chose on 2026-11-02 to skip a rebuild from new footage for now). Locked camera and matched exposure required. A moving camera, a subject that
leaves the cut-out or fast blurred hands are unsupported. Playback by eye and listening to the mix
are pending.
