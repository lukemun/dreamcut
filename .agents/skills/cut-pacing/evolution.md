# cut-pacing — evolution log

## Purpose
Refine pacing by removing pauses, filler, false starts, repetition, and weak beats while preserving natural speech and continuity. Scope: cut decisions grounded in transcript, word alignment, VAD, and nearby playback context together; never cut through a spoken word, and retain short breaths that keep delivery human. Good looks like: one confident natural cut over a pile of micro-cuts, boundaries that play through cleanly, and visuals, captions, music, and overlays still synchronized after the ripple.

## Preserved prior evolution records

# cut-pacing evolution
2026-09-16: Approved Memory improvement `9906afdaac4706b1f22be5ffbebe6413e881b61afaab88d9f6c30ddb5f4bb07b` from retro `b9e257fe-b68b-4ba9-9bef-169683e4b4e9`. After removing dialogue, play through both new boundaries and verify the retained source forms one continuous phrase with no missing adjacent words before accepting downstream ripple changes.

## 2026-10-25 — one card per cut, and fix the transcript before cutting

- **Observation:** A Week Recap clean-up (6 repeats, leading silence, 53 pause tightenings) went out as one card with two options because a cut could not share the queue with another card. The creator could only accept or reject all of it and called the bundling a mistake. One cut also took most of "choppiness": the reviewed text lacked a spoken "All right", so forced alignment had placed about ten words two seconds early there, and the captions carried the same error.
- **Change:** Cut cards on separate stretches of one recording now share the queue: a cut finds the piece of its clip that holds its stretch by recording time (`resolveSourceCutTarget`), and the queue refuses only overlapping stretches or a cut beside another kind of card (`overlappingWrites`). Several cuts in one edit keep their captions (the follower checks every new piece back to the clip), and a cut on the frame nearest two touching words no longer counts as crossing one (half-frame tolerance). The skill asks for a card per decision, pauses grouped about a minute per card, and a completeness check of the reviewed text (independent transcription plus voiced audio) with re-alignment and caption re-timing before any cut.
- **Evidence:** caption-followers tests (two cut cards in either order give the same timeline and captions; chained cuts keep every caption; touching words split at a frame edge), proposal contract and staleness suites. Re-aligned Week Recap with "All right", "in", "in order" and "yet" added: "choppiness" now ends at 126.89 s, and the false start sits at 133.0–136.6 s.

## 2026-10-25 — Ripple only the speaker in split-screen edits

- **Observation:** In `colorgrade-tutorial` (screen recording on top, presenter below), pause cuts in the presenter rippled every lane. Each cut left a two-frame sliver of the screen recording that flickered, and the screen half broke into fragments that jumped back and forth in the recording. The approved card `20261025T180644-8dc3c51e` removed the slivers, and `20261025T184750-fc0ed619` rebuilt the screen as one continuous piece per stretch.
- **Decision:** Updated. In split-screen or overlay edits, set `ripple_lane_keys` to the speaker's lane and its caption lanes and retime the screen recording separately, so cuts leave no slivers and the recording stays continuous. Logged alongside the tutorial-screen-recording entry of the same date, which owns how the screen half is framed.
- **Verification:** `ripple_lane_keys` exists in the cut operation schema (`mcp/proposal-schema.json`). Skill-discovery tests and agent-parity check run after the edit. Not yet measured on fresh agent runs.
