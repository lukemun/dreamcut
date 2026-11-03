# Kinetic Type

A structure looks draw into: not offered in Properties → Templates; an agent uses it when a creator
asks for words in a look. A phrase lands word by word. It
either builds into lines that fill the frame, or shows one large word at a time. Accent
words take the accent colour. Optional motion blocks add whips, slams, zooms through a letter,
strobe echoes, a drifting camera, extruded 3D words, colour flips and motion blur. Uses the shared [explainer looks](explainer-looks.md).

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Phrase | Yes | Up to 40 words; about 12 reads best. |
| Accent words | Optional | Comma or space separated; punctuation is ignored when matching. |
| Beat or word times | Optional | An even beat, or exact seconds per word (`"0.2, 0.55, 0.9"`) to follow music or speech. Words past the last given time continue on the beat. |

## Build

`composition_id: "kinetic"` with [`kinetic-type/index.html`](kinetic-type/index.html),
[`kinetic-type/dreamcut.controls.json`](kinetic-type/dreamcut.controls.json) (DreamCut
supplies `looks.js`). Otherwise the steps are those of [Explainer Sequence](explainer-sequence.md#build).
With `backdrop: false` it lays over footage. Put its lane first in `lane_order_keys`.

## Controls

Main: Look, Phrase, Accent words, Words (Build the line, One at a time), Landing (Look's
own, Rise, Drop, Pop, Slide, Whip, Slam), Align, Size, Height (`y`: where the phrase box is
centred, % of the frame height, 50 by default; kept inside the frame, so in 9:16 one at a time it
reaches about 31–69%). Echoes, 3D slabs and the camera's turning point move with the box.
To keep 9:16 words clear of a graphic in the top third, use Height 60 or more with horizontal
whips: Whip from Above, Below or Each side in turn travels across the whole frame, and a colour
flip fills the whole frame.
Timing: First word, Beat, Word times, Landing time, Hold.

Motion (every one off by default, so a graphic made before them renders the same frames):

| Block | Controls | Off |
| --- | --- | --- |
| Whip in | Landing: Whip; Whip from (Right, Left, Below, Above, Each side in turn); Overshoot; Smear (stretch along the travel) | Overshoot 0, Smear 0 |
| Slam | Landing: Slam (from 3.2× its size); Overshoot dips it under its size and back | Overshoot 0 |
| Leaving | Leaving (Fade, Whip out, Zoom through, Collapse); Leaving time. Zoom through grows the word through one of its letters (one with a hole, nearest the middle). In Build the line the whole phrase leaves at the end | Fade (the first version's behaviour) |
| Echoes | Echoes (copies), Echo gap (s), Echo style (Outline, Solid): fainter copies trail each move, hidden once the word settles | 0 copies |
| Stretch | Stretch: letters wider or narrower along the line; layout follows | 100% |
| Camera | Drift with Camera (Push in, Pull out, Push each word, Pan, Float) at a steady speed per second; Hit shake jolts the frame on every word | Drift 0, Hit shake 0 |
| 3D word | 3D words (which words); 3D move (Turn, Fly through); Turn (degrees it swings across its time on screen); Depth. Extruded slabs behind the face, a lit rim and a highlight that sweeps as it turns; Fly through comes from deep behind the frame and passes through the camera before the next word | 3D words empty, Turn 0 |
| Colour flips | Flip words; Flip colour (Accent, Ink): the ground flips and the type takes the backdrop colour until the next word lands | Flip words empty |
| Motion blur | Motion blur (shutter, %): read by the renderer, not the page (`motion_blur_control`). Sub-frames at up to 8× the frame rate are averaged per frame (premultiplied alpha), so only moving pixels blur | 0 |

Every word time still comes from Word times (or First word + Beat), so beat-synced placement
and the cue sounds below keep working with any of these on.

### A high-energy reel

For a 9:16 promo phrase, one word at a time, a set that keeps every frame moving:

```json
{ "arrangement": "one", "align": "center", "size": 140, "word_time": 0.28,
  "landing": "whip", "whip_from": "turns", "overshoot": 35, "smear": 60,
  "leave": "whip", "leave_time": 0.14,
  "echoes": 4, "echo_gap": 0.022, "echo_style": "outline",
  "drift": 70, "camera": "beat", "kick": 55,
  "hero_words": "<one key word>", "hero": "orbit", "turn": 30, "depth": 70,
  "flip_words": "<one or two words>", "flip_ground": "accent", "motion_blur": 60 }
```

Swap `leave: "zoom"` with `landing: "punch"` for a harder cut, or `hero: "fly"` for the key word.
Lead a card with Landing, Leaving, Echoes, Camera, Drift, Hit shake, 3D words, Flip words and
Motion blur (`motion_main_controls`); the rest sit in Advanced.

## Timing

The length follows the words (last word time + Landing time + Hold), so the controls file
declares cues only: `first_word`, `second_word`. The clip takes the render's length.

A sound on every word (interim): follow a cue with Beat offsets rather than copying the
controls file to add cues. With no Word times, word n (counting from 1) lands at
First word + (n − 1) × Beat, so its sound follows `second_word` with
`offset_seconds: (n − 2) × Beat` (word 1 follows `first_word`). The cues sit at
First word and First word + Beat even when Word times are typed; then the offset is that
word's time minus (First word + Beat). Offsets are fixed seconds: retiming Beat, First word
or Word times leaves the sounds where they were.

## Limits

- Word times are typed. Beat-grid snapping from the project's beats is not wired.
- One-at-a-time sizes each word to fit, so short words are larger than long ones.
- Motion blur makes a render about six times slower (164 s against 27 s for a 3.7 s 9:16
  phrase), and the card's instant draft preview does not show it; only the render does.
- With Motion blur on, a hard colour flip blends over one frame, because the shutter spans the cut.
- In Build the line, Leaving moves the whole phrase and echoes trail entrances only; a 3D word
  takes no echoes.

## Evidence

Demo `explainer-templates-demo` (build the line, Paper) and
`explainer-templates-demo-vertical` (one at a time, Pop, centred, exact word times, Swiss).
Teaching media in `public/recipe-previews/motion-kinetic/`.
The motion blocks were checked on a disposable project (2026-10-28): with them off, frames are
identical to the first version's (deterministic capture); the high-energy set above leaves 5% of frames near still and
no hold longer than its 0.2 s lead-in, against 39% and 0.77 s for the first version at the same
timing (type layer only).
