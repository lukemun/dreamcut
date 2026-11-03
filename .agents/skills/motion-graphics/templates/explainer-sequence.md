# Explainer Sequence

Template `FX-MOTION-EXPLAINER` (Properties → Templates). A short code-built explainer
in five scenes: title, key point with its words marked, a big number that counts up,
three steps joined by a rail, and a closing line. Uses the shared
[explainer looks](explainer-looks.md).

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Title, key point | Yes | The point should be one sentence. Name the words to mark (`point_highlight`, matched case-insensitively). |
| Number | Yes | Value, decimals, text before/after (`$`, `%`, `×`) and a caption. |
| Three steps, closing line | Yes | Up to about six words per step. |
| Look | Optional | Default Paper. |

## Build

1. Call `motion_graphic_prepare` with `composition_id: "explainer"` and files
   [`explainer-sequence/index.html`](explainer-sequence/index.html),
   and [`explainer-sequence/dreamcut.controls.json`](explainer-sequence/dreamcut.controls.json);
   DreamCut supplies `looks.js` with the chosen look ([looks](explainer-looks.md)). Set `values`
   from the creator's words, and `shape` to the project's output (`wide`, `tall`, `square`).
2. Poll `motion_graphic_status` until `ready`, then `proposal_create` with `create_visual`
   (`video_clip`, `has_alpha: true`, source window 0 to `duration_seconds`) on its own
   visual lane. Choose `motion_main_controls` for the change, at most 15. Put the look, the
   words and the number first.
3. Check entrance, peak and settled frames with `pnpm frame-state <project> --proposal-file
   <proposal.json> --at ...`.

## Controls

Main: Look, Kicker, Title, Key point, Marked words, Big number, Decimals, Before number,
After number, Number caption, Steps heading, Step 1–3, Closing line.
Timing: Title time, Point time, Number time, Steps time, Closing time (seconds each scene
holds), Count-up, Step gap, Entrance, Scene change.
Shared: Own accent, Accent, Backdrop. Shape is fixed by placement.

## Timing

The length is the sum of the five scene times (default 15 s). Cues: `point_in`,
`number_in`, `number_lands`, `steps_in`, `closing_in`. Link a sound to a cue with
`create_audio.follows_visual.cue`.

## Limits

- Exactly five scenes and three steps. A longer story uses two graphics.
- Marked words must appear in the key point, or nothing is marked.

## Evidence

Demo `explainer-templates-demo` (16:9, Paper, default content) and
`explainer-templates-demo-vertical` (9:16, Keynote, a support report with 2.1×). Teaching
media in `public/recipe-previews/motion-explainer/`.
