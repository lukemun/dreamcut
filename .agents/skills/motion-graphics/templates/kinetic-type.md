# Kinetic Type

A structure looks draw into: not offered in Properties → Templates; an agent uses it when a creator
asks for words in a look. A phrase lands word by word. It
either builds into lines that fill the frame, or shows one large word at a time. Accent
words take the accent colour. Uses the shared [explainer looks](explainer-looks.md).

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
own, Rise, Drop, Pop, Slide), Align, Size.
Timing: First word, Beat, Word times, Landing time, Hold.

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

## Evidence

Demo `explainer-templates-demo` (build the line, Paper) and
`explainer-templates-demo-vertical` (one at a time, Pop, centred, exact word times, Swiss).
Teaching media in `public/recipe-previews/motion-kinetic/`.
