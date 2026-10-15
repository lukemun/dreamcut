---
name: music-direction
description: Plan a section-led music arc for a DreamCut edit, then coordinate cue auditions, continuity, and dialogue-first mixing.
---

# Music direction

Read `../open-edit-proposals/SKILL.md` before timeline work.

For catalog search and playable music comparisons, use `../music-audition/SKILL.md`. It also checks retained local cue annotations under ignored `social-content/` when available.

## Plan sections before tracks

For a whole-video music request, read the current assembled speech, visual beat map,
existing SFX, and timeline revision. Use `editorial-intent-planning` to preserve the
interpretation. Divide by narrative turns rather than each shot or caption. For each
section record its time range, spoken anchors, emotional job, energy trajectory,
dialogue density, protected jokes/SFX, and desired entry/exit behavior.

Persist this as `analysis/music-direction.json` with `schema_version: 1`, the timeline
revision, section IDs, evidence, candidate source windows, comparison measurements,
proposal/option IDs, listening status, and unresolved decisions. Keep user choices
and their reasons separately from agent recommendations.

Treat the sections as one musical arc. A section does not require a new song:
consider continuing the same bed, changing its intensity, returning to a motif,
or using silence. Avoid a jukebox of unrelated cues or a music hit on every graphic.
Keep comedy and message sounds readable; do not score a factual caveat as catastrophe
unless that is the requested tone.

## Audition each editorial question

Use `music-audition` for a small, contrasting shortlist of coherent score directions, not merely
different tracks with the same mood. Compare the same picture, narration, and SFX
at matched measured cue loudness. Include a dry/no-music listening baseline; the
unchanged timeline can serve as that baseline when the proposal contract cannot
express a no-op option. Do not manufacture an edit to represent silence.

Favor a small number of cohesive cues, changing music at meaningful narrative turns.
Neither one song per section nor one song for the entire video is a fixed default.
Sections can share a bed; a genuine change in emotional direction can justify another
cue. For example, an opening/frustration cue and a warmer resolution cue may serve a
short video better than either five songs or one unchanging bed. Choose the number
from the story, not a quota. Compare whole-arc directions when cue joins are dependent;
each option may contain several cues. Use separate auditions for genuinely independent
cue choices, not automatically for every section.
Do not approve candidates. Source handles and
catalog rights remain intact. If neighboring music overlaps or a shared bed is
edited across sections, keep that dependency atomic or stage the seam decision
after the section choices rather than incorrectly declaring it independent.

## Review the combined arc

After the user chooses directions, audition each boundary with picture and speech
on both sides. Decide phrase-aware continuation, crossfade, intentional stop, or
silence; keep overlapping clips on separate music lanes. Preserve source speed
unless a change is specifically justified. A string of individually good cues is
not proof of a good assembled score.

Separate structural validation from listening: source hashes, durations, and
successful preview derivation do not prove musical phrasing, emotional fit, or
intelligibility. Mark unlistened passages provisional, report playback blockers,
and never claim a listening review from analysis metadata alone.

Define music's role before selecting it: momentum, warmth, tension, transition, or release. Respect dialogue, phrase musical changes near editorial beats, and avoid abrupt starts or endings unless intentional. Reuse licensed local music when suitable.

Propose music creation, placement, trims, fades, and gain changes. Do not generate or render media without the user's request.
