---
name: reference-match-review
description: Check a proposed DreamCut recreation against its original video reference before handing it to the creator. Use when a reference-driven effect is ready for review or when feedback says its timing, placement, or motion is wrong.
---

# Review a recreation against its reference

Use this acceptance pass after `skill:template-authoring` has established source-linked observations and before presenting a candidate as ready. This skill checks a *particular proposed result*; template-authoring owns initial analysis and capability development. For an existing working cut, use [dreamcut-proposals](../dreamcut-proposals/SKILL.md) to revise it. Do not approve the proposal yourself.

## Establish comparable evidence

Identify the exact reference interval, the proposed option, and the source footage it adapts. Reuse a valid `reference-analysis.json` record under the [shared reference contract](../../../docs/effects/reference-analysis.md); repair incomplete coverage before judging motion. Keep reference observations separate from the creator's intentional differences. A tutorial's final demonstration is stronger appearance evidence than an editing-interface screenshot or a single promotional still.

Make a compact event map with actual reference frame/PTS and candidate timeline time for: untreated opening, first visible movement, movement midpoint, settled state, payoff, and exit. Record the visible bounds of moving edges and the subject at each event. If one clip has a different performance speed, align the effect to the corresponding physical event in that clip and state the time shift; preserve the reference's effect duration unless the creator changes it. A still cannot prove sliding, rotation, easing, or sound.
Inspect what happens *after* the payoff through the end of the candidate shot. Identify
whether the reference holds, reopens, or cuts, and whether the candidate does the same
or intentionally follows a newer creator direction. Map both the entrance and exit
durations; do not treat a correct middle frame as a complete match.

## Separate effect completeness from matching precision

First inventory the essential effect components and causal relationships: appearances,
independent actors, rotation, growth, travel, reveal, payoff and exit, plus requested
sound. Verify each is present and works in the combined moving result. Missing a
component or action is a material failure even if other measurements are close.

Grade small timing/position differences by their visible consequence and the creator's
requested precision. Engineering defaults are diagnostic starting points; they are not
an independent demand for frame-identical reproduction. A minor alignment difference
that preserves the action, interaction and intended illusion can be acceptable for an
effect-faithful brief. Exact sync requests or causally important boundaries remain
strict. Record an accepted difference and its evidence, rather than silently changing
measurements or inventing a universal wider tolerance.

A creator's later acceptance of a difference revises the brief. Version that decision,
regrade the affected criteria with existing applicable evidence, and avoid rebuilding
solely to satisfy a superseded default. It does not excuse omitted components,
visible artifacts or falsely claim unperformed technical checks. Report reference
fidelity, technical validation and reusable transfer separately.

## Freeze the match budget before tuning

For close recreation, read [measured reference matching](references/measured-match.md)
before construction and again for acceptance. Record tolerances per trait, source
measurement uncertainty, and allowed adaptations. Compare observed output geometry,
not only authored transform values. A successful render or a plausible effect is not
a reference match. A reported artifact or wrong scale/turn remains a failed criterion
until the revised output has been checked against the same budget.

## Compare the proposed composition

Preview the *combined* candidate, not just its layers. Inspect corresponding frames and play the whole effect at normal speed. Compare:

- whether the treatment is absent, entering, settled, and leaving at the right events;
- direction, duration, and easing of every moving boundary;
- final geometry relative to the subject, especially what the boundary crosses;
- foreground/background order, masking, continuity, and any clipping;
- text or sound only when they are part of the requested effect.

Measure normalized coordinates when assets or aspect ratios differ. Do not copy a reference's canvas coordinates when the new subject occupies another part of the frame. For a tracked object, sample its bounds near the payoff and derive the overlay center from those bounds. Record any intentional adaptation separately from a mismatch.

If a required motion cannot be authored through the proposal contract, treat that as a capability gap and follow template-authoring's implementation route. Do not replace motion with an always-on static state, a baked full-scene render, or an unreviewed preset. Preserve the continuous source and use a source-matched derivative only for pixels that truly need isolation.

## Decide and hand off

Write a short match report: source identity and inspection coverage; event/geometry comparison; pass, fail, or unverified for each material trait; remaining limitations. A material failure blocks a “ready” claim. Revise the candidate, name pending drafts it supersedes, and repeat the comparison before handoff. Read the revised proposal's `spatial_review` (or dry-run it with `proposal_spatial_preflight`), then verify its temporary player preview at entrance, midpoint, payoff and exit. Human approval remains separate.

Do not infer a general-purpose effect is verified from one project. Reusable capability claims still need the second-input checks in template-authoring.
