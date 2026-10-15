---
name: video-reference-analysis
description: Decompose a complete video reference into its editorial sequence, pacing, shot order, typography, sound and reusable effects. Use for a whole reel or multi-effect reference; use recreate-effect directly for one bounded effect.
---

# Analyze a complete video reference

Own the whole-video map before delegating individual effects to
[recreate-effect](../recreate-effect/SKILL.md). A list of attractive effects is not a
complete video breakdown. Analysis does not authorize generation or timeline edits.
Use [media-intake](../media-intake/SKILL.md) for source preservation; existing reference
media does not need another import or a new project.

## Establish the source and full sequence

Read the [shared reference record](../../../docs/effects/reference-analysis.md).
When the creator names a bounded opening or another excerpt, analyze that entire
requested window as a sequence rather than sampling only the apparent effect.
Preserve the original source and its exact source-frame mapping; a local excerpt may
serve as the record's `scope: video` source so its sections can partition the whole
excerpt. State what lies outside the requested window.
Record source hash, dimensions, actual frame/PTS convention, total frames, duration
and inspection coverage. Watch the complete reference when available and report
motion/audio inspection gaps. Partition its entire duration into contiguous sections:
opening, setup, progression, payoff and ending as actually observed. Include ordinary
shots, pauses and transitions; mark uninspected spans explicitly instead of omitting them.
Record each section's narrative purpose, shot order, pacing, text and audio observations.
Do not infer exact-frame evidence from approximate seek times.
Measure both sides of each exit at source frame resolution. Distinguish an aperture
reopening inside the shot from a hard cut to a new shot or background; describe the
visible end state before the cut. If the creator requests a different ending, record
it as an intentional adaptation instead of attributing it to the reference.

## Decompose without losing relationships

Within each section, identify effect occurrences, including overlapping treatments.
Assign repeated instances to one reusable effect ID; preserve occurrence intervals
and source examples. A compound effect retains its component steps and payoff.
Use recreate-effect to measure each distinct construction and every materially different
variant. Record layers, geometry, masks/crops, motion, blur, easing, transitions,
text states and sound isolation in the same source-linked record. Unknowns need reasons.

Keep relationships across sections: title entrances, music/voice cues, repeated motifs,
changes of pace, and the point where the opening hands off to the body. Typography uses
the existing measured typography schema, including font changes and visible glyph size.
Retain linked playable source examples; the generalized catalog must not replace them.

## Validate and hand off

Save `reference-analysis.json` alongside the source catalog. Set `scope: video` and
validate using `pnpm check:effects --reference <record-path>`. The validator requires
whole-source accounting, valid references and measured text records where text is
present. It cannot certify that the observations match the footage.

Present the sequence map plus effect catalog, examples and inspection gaps. Construction
skills consume this record instead of re-analyzing the reference. When the user changes
the adaptation, update its revision/direction references and decisions while preserving
source observations. For a new composition route to editorial-assembly; working-cut
changes use open-edit-proposals. Preserve the reference's overall pacing and handoff
as well as individual effects, unless the creator intentionally changes them.
