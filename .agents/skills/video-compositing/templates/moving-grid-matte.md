# Moving Grid Matte

Template `FX-MOVING-GRID-MATTE` (Properties → Templates). The subject's sharp original
footage shows only through square cells that follow their moving silhouette, over a
separate background.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Moving subject footage | Yes | One continuous shot with a clear silhouette and room around the subject. |
| Background | Yes | The scene or image shown outside the cells. A dark, plain background makes the cells read best. |

The agent prepares a greyscale subject mask covering the whole source interval.

## Build

1. Import both inputs. Place the background on the lower lane and the continuous
   original clip above it (one clip; do not split or bake it).
2. `cutout_prepare` the clip's full source interval with points on the head, torso,
   each arm and each leg. `cutout_status` publishes the mask as `grid_matte_mask`.
   Check frames at the start, middle and end, and at extreme poses.
3. Propose a `props` patch on the original clip: `grid_matte_mask` (copied from
   `cutout_status`), `grid_matte_cell_size`, `grid_matte_coverage`,
   `grid_matte_line_opacity` and `grid_matte_line_width`.
4. Replay the card and check that the cells follow the subject through the whole clip.

## Controls on the proposal card

Cell size, Mask coverage, Grid strength and Grid width. The mask is a recorded
control gap: it is replaced by preparing a new one, not with a dial.

## Settings (demonstration)

Cell size 72, mask coverage 1.6, grid strength 0.35, grid width 1.5.

## Limits

- The mask must cover every source second the clip shows; trimming outside it leaves
  the clip without cells.
- Each cell shows the original shot as filmed, including its own background.
- The four grid controls are static over the clip.

## Evidence

Demo project `tpl-grid-matte-bobblehead-demo` (16:9, 24 fps), proposal
`20261027T074629-4a939aac`: the bobblehead running and cartwheeling (8 s, cutout 650185fa,
re-prompted at 6.0 s because the first pass lagged through the cartwheel) over an empty
frame of Pexels 9732065. Teaching media in `public/recipe-previews/moving-grid-matte/`.
The earlier Pexels dancer demo is `tpl-grid-matte-demo`, proposal `20261015T053624-4780edf6`.

A fast rotation such as a cartwheel can outrun a mask prompted only at the start: check
those frames and re-prompt from a frame inside the move with `parent_cutout_id`.
