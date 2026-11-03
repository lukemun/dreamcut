# Recreate a reference video with other people — evolution

Capability: `storyboard-recast`. Registry: [registry.json](../registry.json).

## Purpose and boundary

A creator supplies a reference video and photos of the people who should appear instead ("remake this
concert opening with me as the singer"). The agent plans it on the Follow-reference storyboard: beats at
the reference's shot cuts, a cast with photos, and who appears in each beat left to right. The agent
quotes prices for free; the creator generates with the Storyboard's Recast button, which shows the total
in credits, chooses a take per beat, and lays the board onto the timeline with Build timeline.

Each beat sends a window of the reference padded evenly to the model's shortest input (H3 Max Recast needs
5 s; concert cuts are often 2 s) and kept inside the reference. A chosen take is kept in the Library with
generation provenance and becomes the beat's selected footage, trimmed back to the beat.

## Log

2026-10-14 — Created (creator decision: build recast on the storyboard because it needs more inputs and
references to follow). `storyboard_reference_draft` writes the plan and can split at FFmpeg scene cuts;
`storyboard_recast_quote` prices beats. Verified by unit tests of window padding, per-model requests,
plan validation and the candidate offset, and by a browser check of the Storyboard UI on a disposable
project; no live generation was submitted.
