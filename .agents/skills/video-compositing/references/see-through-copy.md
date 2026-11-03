# See-through copy

Compiled route `see_through_copy@1` for "a see-through copy of the person rises out of them
and acts on its own". First built as Ghost (a seated man's translucent double stands up,
speaks first and he answers; approved 2026-11-02, proposal `20261102T223134-e39026d3` in
`ghost-build-01a1957c`). The block is general: any effect where a later part of the same take
plays as a translucent copy over an earlier part.

## What it compiles

One `proposal_create` option with one block; the original take stays intact.

1. Lane order (copy lane above the base lane), and any `remove_element_ids`.
2. **Base**: the take's first performance, uncut on its own source clock, with its sound
   (`base_start_seconds`, `duration_seconds`).
3. **Copy**: the whole-person cut-out of the later part as its own clip above, at
   `media_opacity` (the Opacity dial), from `copy_start_seconds` to the end of the base
   window. Its clock is the take's clock offset ahead: copy take second = base take second +
   `clock_offset_seconds`. Both layers end together while the base pose still holds.
4. **Copy's line** (optional `copy_line`): a window of the same take's sound on the copy's
   clock, linked to the copy with `follows_visual`, short fades, trimmed to the copy's span.

## Inputs and the tool that measures each

| Input | How to get it |
| --- | --- |
| `take` | `media_describe` on the one long take. Pass `source_sha256`. |
| `base_start_seconds`, `duration_seconds` | The first performance, from `source_evidence` frames: start where the person is settled, end before they begin to stand (Ghost: 6.24–20.22 s; the stand-up starts about 21.5 s). |
| `cutout` | `cutout_prepare` on the later part of the take covering at least the copy's span (whole person, prompt points on the body while standing); `take_offset_seconds` is the take second at cut-out second 0 from `cutout_status`. Pass the receipt as `cutout_id`. |
| `clock_offset_seconds` | How far ahead the copy runs. Chosen so the copy's line lands where it should against the base's line. Measure speech regions on the take (silence detection on its audio); with no transcript, line order can come from a reference's final playback (Ghost matched the take's audio envelope against the lesson playback). Agent's judgement; state how it was measured. |
| `copy_start_seconds` | When the copy first shows. Before the rise the copy sits on the body, so a short lead (0.5 s in Ghost) hides nothing; check there is no doubling. |
| `copy_line` | Take seconds around the copy's spoken line, from the speech regions (Ghost: 22.6–25.6 s for speech 22.95–25.28 s). |
| `lane_order_keys`, `lanes` | The project's complete top-first order with the copy lane above the base lane. |

## Dials

Main: **Opacity** (0–100 %, default 50), **Line timing** (±30 frames, later is positive;
moves the copy and its line together, clamped to the cut-out's handles), **Copy line level**
(0–200 %, hidden with no line).
Advanced: Base sound, Line fade in and out (defaults one frame in, three out).

## Checks

- Before the rise the copy sits exactly on the body: no doubling (frame-state on the
  first seconds).
- No holes or stray limbs in the copy through the rise; check the fast stand-up frame by
  frame (Ghost's cut-out contact sheet showed a possible extra edge there).
- The copy's line and the base's answer land without talking over each other. Frames
  cannot prove sound; say it has not been heard.

## Limits

One demonstration (Ghost, one take, accepted by the creator on 2026-11-02). Both parts must
be one locked take with steady light; the second part must start from the base pose. Fast
moves lose detail in the cut-out. The lines have not been listened to, and the fast stand-up
was only sampled.
