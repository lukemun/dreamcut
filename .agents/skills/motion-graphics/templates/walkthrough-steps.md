# Walkthrough Steps

Template `FX-MOTION-WALKTHROUGH` (Properties → Templates). Two to four numbered steps,
one at a time. Each step has its own screenshot or picture on a screen, and a progress bar
fills as the steps go by. Uses the shared [explainer looks](explainer-looks.md).

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Steps | Yes | Title and one line of detail each, plus a heading. |
| Screenshots | Optional | One per step, imported with `media_import`. Without one, a drawn stand-in screen marks a different area per step. |

## Build

1. Import the pictures (`media_import`).
2. Call `motion_graphic_prepare` with `composition_id: "walkthrough"`,
   [`walkthrough-steps/index.html`](walkthrough-steps/index.html),
   [`walkthrough-steps/dreamcut.controls.json`](walkthrough-steps/dreamcut.controls.json),
   `looks.js`, and `assets: [{ media_path: "sources/<file>", as: "assets/step_1.jpg" }, ...]`.
   Set the fixed `image_1`…`image_4` values to those `assets/...` paths.
3. Propose it as in [Explainer Sequence](explainer-sequence.md#build).

## Controls

Main: Look, Heading, Steps (count), Step 1–4 title and detail.
Timing: Intro, Step time, Step change, End hold, Entrance.
The step pictures are `fixed`. They are set when the graphic is prepared, not on the card.

## Timing

Length = Intro + Steps × Step time + End hold. Cues: `step_1_in` … `step_4_in`.

## Limits

- Swapping a picture needs a new `motion_graphic_prepare` with new `assets`, then a
  superseding proposal. The card cannot pick media.
- `motion_library_save` refuses graphics with copied assets, so a walkthrough with pictures
  cannot go to the personal Library yet.
- Pictures are cropped to the screen (16:10 on wide canvases, 1.47:1 on tall).

## Evidence

Demo `explainer-templates-demo` (four steps, stand-in screens, Paper) and
`explainer-templates-demo-vertical`, composition `walkthrough-trip` (Terminal, 9:16).
That composition uses three stills from the Pexels clips 9130084, 4208237 and 8148429
(Pexels License). Teaching media is in `public/recipe-previews/motion-walkthrough/`.
Public teaching media must never show the creator's own people, pets or home.
