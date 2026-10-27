---
name: explainer-visuals
description: Plan and build graphics that complement what a speaker is saying in a talking video (data, names, scale, comparisons, the thing being described), beat by beat between the creator's marks. Use when the creator asks for visuals, diagrams or charts over a stretch of speech, or says existing graphics just repeat the words. Not for animated titles of supplied text (motion-graphics), captions (caption-craft) or footage B-roll (planned-shot-craft).
---

# Explainer visuals

Read `../dreamcut-proposals/SKILL.md` before timeline work and `../motion-graphics/SKILL.md`
for the composition contract and templates. This skill decides what each graphic shows and
how it is timed; those skills own how it is built and proposed.

## What a graphic over speech is for

Show what the words do not carry. The captions and the voice already say the sentence; the
graphic adds the evidence, scale or mechanism behind it:

| Speaker says | Graphic shows |
| --- | --- |
| "The top of the index is soaking up the wealth" | The biggest tickers filling their share of the index while the rest shrinks |
| "Breadth is the trade; the AI names are taking risk off" | Two price lines diverging over the period, each value counting at its tip |
| "They moved their earnings up a week" | A calendar where the report date travels from the expected day to the actual day |
| "They issued bonds to fund the AI build-out" | A bond, money flowing from it, data-centre racks lighting up |
| "Rates are lower in Europe" | The two policy rates side by side |

Never put the speaker's sentence back on screen as titles or bullet points; that is the
failure this skill exists to prevent. A short headline naming the point (for example
"Moved its earnings up a week") is fine when the creator asks for one or the graphic needs a
caption to be read without sound. Existing graphics that only restate speech are candidates
for replacement when the creator points at them.

## Plan beat by beat

1. Read the stretch the creator named (their marks, timecodes or words) from the aligned
   transcript (`timeline_get` captions or the speech alignment), and split it into beats: one
   idea each, with the spoken words that open and close it.
2. For each beat write one line: the idea, what the graphic shows that the words do not, the
   word its key moment lands on, and the facts it needs.
3. When the direction is open to interpretation, build and propose the first beat only, and ask
   before drafting the rest. Otherwise work in passes of one to three cards (AGENTS.md). One card
   per beat, so each can be applied, tuned or rejected alone.
4. A beat that replaces part of an existing graphic carries the split in its own card: trim the
   old clip, place the new one, and resume the old one after it, so the timeline stays whole
   whichever cards the creator applies. Cards that change the same clip cannot wait side by side;
   post the next after the creator applies the previous.

## Facts

Use real figures only. Get them from a connector or primary sources, and put the source and
date in the card's `assumptions`. Never invent a date, price, rate or count. When the
creator's framing is not confirmed by the sources (a date "moved up a week" that no report
states), follow their framing visibly, say so in the card's assumptions, and tell them. Name
measurements precisely (an equal-weight index is not "the other 490").

## Build

- Reuse first: a packaged Template (Animated Chart, Explainer Sequence) or the creator's
  selected look when it can show the beat; ask before building something new only when the
  request leaves the treatment open.
- A new graphic is one object (motion-graphics contract): draw it as one SVG, with its labels
  inside the drawing; declare `"looks": true` to use the shared looks (match the look already in
  the edit or the one the creator selected) and `"object": {label, native_gap}` with a one-sentence
  gap of at most 200 characters in `dreamcut.controls.json`.
- Time it to the words: expose each key moment as a number control (seconds from the graphic's
  start) set from the alignment, and declare the `timing` block so cues follow the render.
- Keep `room_below` (about 20%) when the presenter bubble or captions sit at the bottom.
- Motion is smooth by default: eased draw-ons and staggers, counts that run continuously; no
  overshoot pops or instant colour snaps unless asked.
- Script pitfalls that fail the composition check: a top-level `const top`/`bottom` (clashes with
  `window.top`); SVG scaling without `transformOrigin`/`svgOrigin` (elements fly off); text blocks
  that overlap at any sampled time; low-contrast labels (warning).

## Verify and propose

1. Render through the motion-graphics path and look at frames across the whole graphic (the
   first frame, each key moment, the hold) before proposing. A still cannot prove motion: say so.
2. Wait for `media_readiness` to report ready, read the current revision, and stage the card with
   `proposal_create`. Keep the presenter bubble pieces aligned to the talk pieces under the
   graphic (one bubble piece per talk piece, whole frames). Lead with the graphic's own controls
   in `motion_main_controls`: the cue timings tied to the spoken words, then the look. The bubble
   pieces are not dials; send `review_controls` for the clip fields that matter, linking repeats
   (see [proposal-dial-selection](../proposal-dial-selection/SKILL.md)), rather than blanking them.
3. Report each card with what it shows, the sources behind its figures, and what was not checked
   (playback in the editor, audio).
