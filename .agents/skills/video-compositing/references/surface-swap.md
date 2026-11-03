# Surface swap

Compiled route `surface_swap@1` for "one surface of the shot becomes something else". First
built as House Pond (a patio floor becomes a carp pond while a man opens the back door;
approved 2026-11-02, proposal `20261102T233142-2b3d7fbd` in `house-pond-build-01a1957c`). The
block is general: any effect where another clip shows only inside a traced surface of the main
take (a floor, a wall, a screen), with everything outside it staying as filmed.

Not the matched-take region: that keeps a subject in front of a box from a second take filmed
from the same spot (subject window `outside`). Here the inserted clip is any footage, placed by
size and position, and the trace is the surface itself (subject window `inside`). No separate
foreground layer is needed: what stands on or crosses the surface is outside its trace.

## What it compiles

One `proposal_create` option with one block; the take stays intact.

1. Lane order (insert lane above the main lane), and any `remove_element_ids`.
2. **Main**: the take's window, uncut with its sound.
3. **Insert**: the other clip over the whole window, `media_scale` and `media_offset_x/y`,
   shown only inside the surface's cut-out through the native subject window
   (`subject_window_parent_id` = the main take, mode `inside`).
4. **Sound** (optional): a sound for the new surface under the whole window, linked to the
   insert with `follows_visual`.

## Inputs and the tool that measures each

| Input | How to get it |
| --- | --- |
| `main`, `duration_seconds` | `media_describe` on the take; the window from `source_evidence`, or by matching a reference's frames to the take (no tool yet, signal `db909acc`; House Pond: 53.62–66.89 s, a constant offset). |
| `insert` | `media_describe` on the clip that fills the surface; it must run the whole window. |
| `surface_mask`, `cutout_id` | `cutout_prepare` on the MAIN take, the surface only (points on the floor, none on people, doors or furniture). Trace the whole recording so trims keep working; copy `cutout_status` `grid_matte_mask`. `tracking: "static"` gives the same mask much faster when the camera and surface never move. |
| `placement` | The insert's size and position: fitted to a reference by grid search over a few of its frames (House Pond: scale 1.375, offset −0.09 / 0.565; mean difference 49.8 → 17.0), else by eye so the content sits naturally on the surface. State how it was fitted. |
| `edge` | Grow the outline to close a gap at a boundary (House Pond: 24 px to the door threshold); check people and doors stay in front. |
| `sound` | A supplied sound or one from `sfx_search`; pass `source_sha256`. |

## Dials

Main: **Size**, **Horizontal position**, **Vertical position**, **Expand edge**, **Sound
level**. Advanced: Edge softness, Window strength (0 shows the insert over the whole frame, a
quick placement check), Take sound.

## Checks

- People, doors and furniture on or next to the surface stay in front through the whole
  window (frame-state where they cross it).
- The new surface meets its boundaries with no strip of the old one.
- Frames cannot prove sound; say it has not been heard.

## Limits

One demonstration (House Pond, the course's supplied files, accepted on 2026-11-02). The
inserted footage does not follow perspective or light on the surface; anything moving across
the surface depends on the trace.
