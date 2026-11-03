# Behind-object vanish

Compiled route `behind_object_vanish@1` for "the person moves behind an object and vanishes
there, and the object's own take plays on". First built as Cup Jump (a jumper in the distance
drops behind a coffee cup's rim and the picture becomes the cup splashing; approved 2026-11-02,
proposal `20261102T234425-9e701056` in `cup-jump-rebuild-01a1957f`). The block is general: any
effect where a performer disappears behind a foreground object that comes from a second take
filmed from the same spot.

## What it compiles

One `proposal_create` option with one block; the source takes stay intact.

1. Lane order (every piece lane above the object take's lane), and any `remove_element_ids`.
2. **Object take**: uncut on its own source clock from `object_take.source_start_seconds` for
   `duration_seconds`, at the bottom. Its still object is what stands in front of the performer
   before the vanish; it shows whole after it.
3. **Pieces**: the performance take as one to four back-to-back pieces from the block's start,
   each a source window at its own `playback_rate`, snapped to whole output frames. Each shows
   only the band `band_inset` (`mask_inset` + `mask_feather`), and is held back wherever the
   object is through the native subject window (`subject_window_parent_id` = the object take,
   mode `outside`, the object take's cut-out as `subject_window_mask`). The vanish is where the
   last piece ends.
4. **Sound** (optional `sound`): a sound effect at the vanish plus `offset_seconds`, linked to
   the last piece with `follows_visual`.

Speed steps are separate pieces, not one clip with `playback_speed_steps`: a speed step inside
one clip breaks the card's trim and speed dials (product signal `a8693661`).

## Inputs and the tool that measures each

| Input | How to get it |
| --- | --- |
| `object_take`, `duration_seconds` | `media_describe` on the take of the object. Start where the object is still, before its action (Cup Jump: 0.267 s), long enough for the action after the vanish (3.23 s). |
| `performance`, `pieces` | `source_evidence` frames of the performance take: the move behind the object, with the last part faster when the reference speeds it up (Cup Jump: 3.5–4.6 s at 1×, 4.6–5.0 s at 1.5×). With a reference, match its frames against the takes to read windows and speeds; there is no tool for this yet (signal `db909acc`), say how it was measured. |
| `band_inset` | The part of the performance frame to show, so the object take's ground shows elsewhere and never changes at the cut. Measured per take; Cup Jump keeps the top 60 % (`[0, 0, 0.4, 0]`). |
| `object_mask`, `cutout_id` | `cutout_prepare` on the OBJECT take, covering every second the performance shows over (Cup Jump traced the whole file); copy `cutout_status` `grid_matte_mask`. Check shiny or thin edges (a rim, a handle) and anything rising out of the object before the vanish; fix with re-prompts and `cutout_correct`. |
| `sound` | `sfx_search` or a supplied effect; `offset_seconds` against the vanish (Cup Jump: one frame before). Pass `source_sha256`. |
| `lane_order_keys`, `lanes` | The project's complete top-first order with every piece above the object take. |

## Dials

Main: **Your take timing** (±30 frames, later is positive; all pieces together, clamped to
the take), **Speed** per piece (0.5–3×; the piece keeps its action, the vanish and sound move
with it), **Object take timing** (±30 frames; clamped to the file and the object's cut-out),
**Expand edge**, **Edge softness**, **Window strength** (0 is a quick check that the object
is in front), **Sound level**, **Sound timing** (frames from the vanish, at 30 fps).
Advanced: Band edges ×4 (defaults from `band_inset`), Band edge softness (1.5 %), Object take
sound (off by default).

## Checks

- The performer disappears exactly behind the object's edge; nothing shows through or beside
  it (frame-state through the last piece, at full size).
- The ground and object never change at the cut.
- Nothing from the object's action is drawn over the performer before the vanish.
- The sound lands on the vanish. Frames cannot prove sound; say it has not been heard.

## Limits

One demonstration (Cup Jump, the course's takes, approved by the creator on 2026-11-02). The
stand-in splash in that card peaks 5 frames early and is 0.6 s shorter than the reference's,
and has not been listened to; don't copy its timing into other cards. Needs a locked camera
and the move lined up behind the object; depends on the object's cut-out.
