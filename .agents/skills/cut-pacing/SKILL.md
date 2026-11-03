---
name: cut-pacing
description: Refine pacing in a DreamCut edit by removing pauses, filler, false starts, repetition, or weak beats while preserving natural speech and continuity.
---

# Cut pacing

Read `../dreamcut-proposals/SKILL.md` before timeline work.

Use the transcript, word alignment, VAD, and nearby playback context together. A review mark identifies the neighborhood, not the exact cut. Never cut through a spoken word. Retain short breaths that make delivery sound human, and check that visuals, captions, music, and overlays remain synchronized after a ripple.

For a mid-clip removal, propose `source_range_cut` with absolute source boundaries. Summarize the removed words or silence and its duration. Prefer one confident natural cut over a pile of micro-cuts.

Check the timing before you cut. Forced alignment can only place the words it is given: a word missing from the reviewed text (an "all right", a dropped "in") stretches its neighbours over the unknown audio, so cuts land inside words and captions drift. Compare the reviewed text with an independent transcription pass and the measured voiced audio; add every word that was actually said, re-run alignment, and re-time the captions from it before drafting cuts.

Give the creator a card per decision, not one card for the whole clean-up. Each false start, repeat or misspoken phrase is its own card, saying what goes and how the line reads after. Tighten pauses in small groups, about a minute of recording per card, so they can keep or drop them a stretch at a time. Cut cards on separate stretches of one recording wait side by side and each applies on its own in any order (each cut finds its piece of the clip by recording time); only cuts whose stretches overlap must share a card. A cut card cannot wait beside cards of other kinds, so settle caption and picture cards first or after.

In a split-screen or overlay edit, a cut ripples only what follows the speaker: set `ripple_lane_keys` to the speaker's lane and its caption lanes, and retime the screen recording separately (one continuous piece per stretch). Rippling every lane leaves two-frame slivers of the screen at each cut and breaks the recording into fragments that jump back and forth.

## Learned refinements

- After removing dialogue, play through both new boundaries and verify the retained source forms one continuous phrase with no missing adjacent words before accepting downstream ripple changes.
