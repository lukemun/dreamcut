---
name: color-grading
description: Use when a creator asks to correct or restyle a clip's colour (warmer, fix a cast, punchier contrast, a look, deeper sky, better skin), to choose between exposure, wheels, curves and colour slice and stage the grade as a tunable proposal. dreamcut-proposals owns the proposal itself; proposal-dial-selection owns which dials lead.
---

# Grade a clip

The outcome is a proposal card whose grade gets the creator close to what they asked for,
with the wheel, curve or slice they will most likely reach for next already on the card.
Grades are clip props applied with `proposal_create`, as any other edit
([dreamcut-proposals](../dreamcut-proposals/SKILL.md)). Record the direction with
`editing_feedback_record` first and read preferences from `timeline_get` (`editing_context.preferences`).

## How the grade works

`timeline_get` returns `capabilities.effect_controls`; each `grade_*` entry carries its
range, identity and meaning. The model is `dreamcut-scene-v2` (written for you; never send
`color_grade_model`):

- Every stage runs in floating point on scene-linear light, then the output transform
  tone-maps once. Nothing clips between stages, so a later stage can recover detail.
- Tone positions use the **grade axis**: `0.48` is mid grey, `0.68` is SDR white, values
  above `0.68` are HDR highlights (iPhone/Pixel HLG and Samsung PQ clips carry them).
- Stage order: exposure and white balance → wheels (offset, lift, gamma, gain), contrast
  around `grade_contrast_pivot`, zones (shadows, highlights, whites, blacks) → curves
  (brightness, then red/green/blue) → saturation and hue → hue curves and colour slice.

HDR clips (`source_color_space` set when they were prepared) are graded from their own
code values. Their highlights survive a negative gain or a curve that pulls the top
down; an SDR clip has no detail above `0.68` to recover.

## Choose the tool

| The creator wants | Reach for | Why |
| --- | --- | --- |
| Brighter, darker | `grade_exposure_ev` | Moves the whole picture in stops, like the camera. |
| Warmer, cooler, less green | `grade_temperature`, `grade_tint` | White balance in linear light. |
| A cast across every tone | `grade_wheel_offset` | Shifts all tones equally; lift and gain would change contrast too. |
| Teal shadows, warm highlights, a look | `grade_wheel_lift`, `grade_wheel_gain` (and `grade_wheel_gamma` for mids) | Each wheel owns one tonal range; balance the RGB so brightness holds. |
| Punchier or flatter | `grade_contrast` with `grade_contrast_pivot`, or an S-shaped `grade_curve_y` | Pivot keeps the tone the creator cares about in place. |
| Faded, lifted blacks | `grade_curve_y` with its first point above 0 | A curve shapes one region; `grade_blacks` moves the whole low end. |
| One colour family (sky, grass, a shirt) | `grade_slice_<colour>` | Broad, smooth window; hue, saturation and density in one control. |
| A narrow or exact hue | `grade_curve_hue_hue`, `grade_curve_hue_sat`, `grade_curve_hue_lum` | Points can isolate a band narrower than a slice. |
| Skin that is too red or uneven | `grade_slice_skin` | Gated to skin-like saturation, so vivid reds nearby stay put. |
| Muted shadows, tamed vivid colours | `grade_curve_lum_sat`, `grade_curve_sat_sat` | Saturation by brightness or by existing saturation. |
| This shot to match that one | `color_look_cards` (mode `match`), then `proposal_create` each returned card unchanged | Measures both clips as they display and moves the target's primaries; match first, then style. |
| The same grade on several clips | `color_look_cards` (mode `same`) | One card per clip, with the reference's whole grade and a plain summary of what changes. |

Small moves read well; a wheel's RGB of `±0.03` is already a visible tint. Leave untouched
controls out of the operation; empty curves and zero wheels are identity.

## Finish with a film look

After the grade, a film look adds the texture and glow a colourist finishes with. Each strength
alone turns its treatment on; propose them on the clip operation's `props` like any grade field.

| The creator wants | Fields | Starting values |
| --- | --- | --- |
| Shot on film, analog, 35mm | `film_grain` (+ `film_grain_size`) | 0.2–0.35; size 1.5 (2.5+ reads as 16mm) |
| Red glow around lights, Cinestill | `film_halation` (+ `film_halation_radius`) | 0.3–0.6; radius 12–24 |
| Dreamy, diffused, Pro-Mist | `film_bloom` (+ `film_bloom_radius`) | 0.15–0.35; radius 40–80 |
| More or less of the picture glowing | `film_glow_threshold` | 0.72 default; lower lets midtones glow |
| Darker edges, frame the subject | `film_vignette` (+ `_size`, `_softness`) | 0.2–0.4 |
| Teal-and-orange, tinted shadows | `film_split_tone`, `film_split_shadow_hue`, `film_split_highlight_hue`, `film_split_balance` | 0.3–0.5; hues 195 and 35 |

Keep grain and halation light on faces and text-heavy shots. When the card uses split tone,
put both hue dials in `review_controls` so the creator can steer the colours.

## Write the values

- Wheels: `[red, green, blue, master]`. Raise one channel and lower the others to tint
  without changing brightness.
- Slices: `[hue degrees, saturation multiplier, density]`.
- Curves: flat `[x0, y0, x1, y1, …]`, at most 16 points, x from 0 to 1. Tone curves keep
  their end points (`0,0` and `1,1`) unless the request is to lift or crush an end. Hue
  curves wrap: x is hue (0 red, 0.17 yellow, 0.33 green, 0.5 cyan, 0.67 blue, 0.83
  magenta). A single bend needs a point at rest on each side of it.

## Stage, check, hand over

1. Stage the grade on the clip operation's `props`, one card per shot or per group of shots
   that must match. Put the controls the creator will steer next in `review_controls`: a
   wheel, curve or slice counts as one dial ([proposal-dial-selection](../proposal-dial-selection/SKILL.md)).
2. Check the result on the brightest and darkest moments and on any face:
   `pnpm frame-state <id> --proposal-file proposals/<file>.json --option <option id> --at <times>`
   renders the card as it would apply, one run per option. `proposal_preview` returns the derived
   timeline, not pictures. A still cannot show flicker across keyframes.
3. For a match, report `distance_before` and `distance_after` from `color_look_cards` (under about 2
   reads as matched) and its limits; shots of different scenes stay different scenes. In the editor the
   creator does the same with Color → Match a clip or Copy a clip's look, then clicks the reference clip.
4. Say what the grade does in the card summary in the creator's terms ("warmer highlights,
   cooler shadows"), not field names. Never approve.

Clips graded before `dreamcut-scene-v2` were upgraded automatically; their old tonal
sliders may now live in the brightness or RGB curves. Edit those curves rather than adding
a second correction on top.
