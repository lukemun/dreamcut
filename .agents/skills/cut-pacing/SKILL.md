---
name: cut-pacing
description: Refine pacing in a DreamCut edit by removing pauses, filler, false starts, repetition, or weak beats while preserving natural speech and continuity.
---

# Cut pacing

Read `../open-edit-proposals/SKILL.md` before timeline work.

Use the transcript, word alignment, VAD, and nearby playback context together. A review mark identifies the neighborhood, not the exact cut. Never cut through a spoken word. Retain short breaths that make delivery sound human, and check that visuals, captions, music, and overlays remain synchronized after a ripple.

For a mid-clip removal, propose `source_range_cut` with absolute source boundaries. Summarize the removed words or silence and its duration. Prefer one confident natural cut over a pile of micro-cuts.

## Learned refinements

- After removing dialogue, play through both new boundaries and verify the retained source forms one continuous phrase with no missing adjacent words before accepting downstream ripple changes.
