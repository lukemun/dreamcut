# Silhouette Window

Template `FX-SILHOUETTE-WINDOW` (Properties → Templates). A run of short fill clips plays
only inside the person's moving silhouette; the rest of the shot stays as filmed. Built
on the native Subject Window props. Recreated from a breakdown reel by @willrvail of a
video by @nvision.media (instagram.com/reel/Deb-VcJRpxp); no reference pixels are reused.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Shot of a person | Yes | A clear silhouette works best: a profile against the sky or a figure against a plain background. |
| Fill clips | Yes, several | Strong colour or texture. About 0.6 s of each is used, in order. |

The agent prepares the person's moving cutout mask.

## Build

1. Read the person shot on the working timeline (its element id, start, length and
   source window).
2. `cutout_prepare` the person over the source window the shot uses; poll
   `cutout_status` and copy its `grid_matte_mask` exactly. It must cover every source
   second the shot shows.
3. Propose one `create_visual` video clip per fill on one lane above the shot, back to
   back (demo: 0.6 s each), each with:
   `subject_window_parent_id` (the shot), `subject_window_mask` (the grid matte),
   `subject_window_mode: "inside"`, `subject_window_feather`, `subject_window_expand`,
   `subject_window_strength: 1`.
   Add `set_lane_order` with the fill lane above the shot.
4. Link the three window dials across all fills (`linked_operation_indices`), so one
   dial moves every fill.
5. Replay the card. Check a frame inside each fill and that nothing shows outside the person.

## Controls on the proposal card

Edge softness, Expand edge and Window strength, each linked across every fill. Fill
order, source moments and rhythm stay in the proposal and timeline.

## Timing (recreation)

The recreation changes fills every 0.6 s; the reference changes faster (about 3 frames). Set B uses 0.5 s.

## Limits

- The window is only as good as the cutout: parts it misses (the raised hand in set A)
  stay unfilled.
- Fills keep their own aspect inside the frame; a non-16:9 fill can show letterbox bars
  inside the silhouette.
- The Subject Window draws on the GPU preview and export; the mask must cover the whole
  source interval or the window closes.

## Evidence

Demo project `tpl-silhouette-window-bobblehead-demo` (16:9, 24 fps), card
`20261027T083631-557f34fe`: the bobblehead's run (source 0–6 s, cutout 9e588f3f) with
twelve 0.5 s people-free fills (ocean, waterfall, three night-city clips). Portrait fills
are enlarged to 1.25 so they cover the silhouette; landscape fills cover the wide
cartwheel. Teaching media in `public/recipe-previews/silhouette-window/`.

Earlier demo project `tpl-silhouette-window-demo` (16:9, 30 fps):
- Set A, silhouette at dusk (Pexels 34736308) with ten fills from eight Pexels clips:
  grid matte at 50 fps, 314 frames.
- Set B, man in orange fog (Pexels 8680224, 4096×2160) with eight 0.5 s fills, feather 2,
  expand 6, grid matte at 25 fps, 113 frames.
