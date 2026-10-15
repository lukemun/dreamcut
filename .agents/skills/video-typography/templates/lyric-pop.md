# Lyric Pop

Template `FX-LYRIC-POP` (Properties → Templates). On a beat, one word in a bold gold
serif springs onto the shot and holds. Recreated from a breakdown reel by @willrvail of
a video by @nvision.media (instagram.com/reel/Deb-VcJRpxp); no reference pixels are reused.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Shot | Yes | Leave clear space beside the subject. |
| The word | Yes | One short word and the beat or moment it lands on. |

Nothing is prepared or generated; the word is native editable text.

## Build

1. Find the beat (`beat_grid_get`) or the visual moment the word lands on.
2. Propose one `create_text` on a `captions_N` lane: `fontPreset: "dm_serif_display"`,
   `textColor: "#E8B547"`, `fontSizePx: 170` (1080p), `positionPreset` in the open
   space (demo `center_right`), `maxWidth: 0.5`, `styleVariant: "none"`,
   `animationIn: "spring_pop"`, `animationInDuration: 0.25`, `animationOut: "none"`,
   `duration_seconds: 1.4`, `timeline_start` on the beat.
3. Replay the card. Check the frame before the beat, the pop and the hold.

## Controls on the proposal card

Duration (hold), Font size and Animation-in duration. The start is not a card dial for
graphic text; move the word on the timeline.

## Timing (recreation)

Springs on over 0.25 s and holds 1.4 s (the recreation was timed to an arm raise because
the demo has no music).

## Limits

- One word per card; repeat the template for each beat.
- The start time is set in the proposal, not a dial.

## Evidence

Demo project `tpl-lyric-pop-demo` (16:9, 30 fps):
- Set A, CRAZY over the boulder shot (Pexels 3010130).
  Teaching media in `public/recipe-previews/lyric-pop/`.
- Set B, WILD in cream `#F7F1E3`, 220 px, upper centre, 1.2 s hold over the meadow
  shot (Pexels 8148429).
