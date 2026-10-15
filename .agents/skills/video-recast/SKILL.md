---
name: video-recast
description: Recreate a reference video with other people — the creator's own face, consenting people or made-up characters replacing those on screen, shot for shot, optionally with a new song. Use when the creator supplies a video to follow plus photos of who should appear ("remake this concert opening with me as the singer", "recast this clip"). Plans on the Follow-reference storyboard; generation is the creator's click. Not for generating new shots without a reference (generated-asset-workflow) or editing a timeline clip already placed (open-edit-proposals).
---

# Recast a reference video

Outcome: a Follow-reference storyboard where every beat of the reference has a cast,
a priced recast and, once the creator chooses takes, footage ready for Build timeline.
The creator generates and chooses; the agent plans, prices and checks.

## Inputs and missing-input behaviour

- **Reference video** in the project, prepared (`media_readiness`). Import with
  `media_import` if supplied as a file. A personal Template's reference clip appears in
  the Storyboard under "Or a Catalog reference".
- **Cast photos** in the project: one clear, front-facing photo per person, plus up to
  three more angles. Ask for them; do not invent people or use the reference's faces.
- **Who replaces whom**, left to right, and anything to keep (wardrobe, props).
- **Optional song**: lyrics and style for a new soundtrack (Generate → Music).

Real people other than the creator need their consent. Provider safety filters apply
and may refuse a face; report a refusal plainly, do not work around it.

## Plan on the storyboard

1. Record the direction with `editing_feedback_record`; read `storyboard_get`.
2. Write the plan with `storyboard_reference_draft`: the reference `source`, the
   `cast`, and either explicit `beats` or none to split at shot cuts. Cut detection is
   evidence: check suspicious beats with `source_evidence` and merge flashes or split
   long shots. Put each beat's people in screen order left to right.
3. Choose the model per the [generated-asset workflow](../generated-asset-workflow/SKILL.md)
   constraints: `h3-max-recast` keeps the shot and swaps up to four people (5–30 s input);
   `wan-2.2-replace` one person, cheapest; `kling-o1-edit` prompt edits of 3–10 s;
   `seedance-2-reference` / `seedance-2.5-reference` regenerate the shot copying its camera
   and action when a swap fails. Short beats are padded to the model's minimum and trimmed
   back; a beat longer than the model's maximum must be split first.
4. Price with `storyboard_recast_quote` and report the total and any per-beat problem.

## Generate and choose (creator)

The creator clicks **Recast N beats · X credits** (or one beat's **Recast this beat**) in
the Storyboard; that click spends credits. Takes appear under each beat; **Use** keeps a
take in the Library and makes it the beat's footage, trimmed to the beat. Review each
chosen take against its reference frame: identity, people count and order, framing,
motion and joins. A frame cannot prove motion; watch the take.

## New song (optional)

Write lyrics to the reference song's structure and timing; stage MiniMax Music 3 or Mureka
with `asset_generation_prepare` (task `music`, `lyrics`). The creator generates and keeps
it. Lay it as the bed after Build timeline with a proposal (`create_audio`, mute the old
bed); re-cut on its beats with `beat_grid_get` and the
[beat-aligned cuts](../beat-aligned-cuts/SKILL.md) skill.

## Verify and report

Report beats planned, cast per beat, model, price, takes chosen and beats still needing
footage. Then **Build timeline** is the creator's step; later swaps of a placed clip go
through proposals. Report unverified motion, refused generations and gaps honestly.
