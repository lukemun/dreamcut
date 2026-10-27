---
name: effect-authoring
description: Package an effect that already works in a creator's edit into a reusable effect (a Templates card) with its whole workflow, so a later request with new footage rebuilds it. Use when the creator says "make this an effect", "package this", "save this as a template" or "author an effect" about something built in a project. Not for copying an effect from someone else's video (recreate-effect), a named colour or caption look (style recipes, My Style), or saving one motion graphic for reuse (motion_library_save).
---

# Author an effect from a finished edit

An effect in DreamCut is a brief, not a saved timeline: a Templates card names what the
creator supplies, what DreamCut prepares, the owning skill that builds it and the request an
agent follows. A later agent reads only the card and the skill, with someone else's footage.
Success means that agent rebuilds the effect as a proposal without this session's history.

## 1. Scope the effect with the creator's words

List what the finished edit contains and sort each part into the effect or out of it. The
creator's words decide ("the whole speed thing with the sound effects, not the captions, not
the colour grading"). By default leave out captions, colour grades, music, the creator's line
and anything specific to one project (their marks, their places, their words); those stay
the creator's per-project choices. Ask only when a part is ambiguous and changes the brief.
Record the direction with `editing_feedback_record` on the project the effect came from.

## 2. Put the how-to in the effect's skill

Gather what the edit taught: the applied cards (`proposal_list`), the creator's corrections
(`editing_feedback_check`), and the owning craft skill. Every step that made it work belongs
in that skill and its `evolution.md` (skill-authoring), not in the card: inputs, timing,
measurements, the build route, dials, sound and checks. If no skill owns the effect, write one
first. The card's request names the skill and stays short.

Prefer a build route that compiles the effect from measured inputs (a proposal block, a
recipe or `recipe_compile`, a motion graphic) over hand-written operations. Name the parts that
still need hand-written cards as limits.

## 3. Choose where the card lives

| Home | Files | Use when |
| --- | --- | --- |
| **Yours** (the creator's Templates) | `effect-recipes/catalog.json` under `profileDir()`; schema in [user-effect-recipes.ts](../../../src/lib/local-store/user-effect-recipes.ts) | Default. Anything showing or naming the creator, their people or places, or assets cleared only for them. |
| **Shared** (every DreamCut user) | [promoted-recipes.ts](../../../src/lib/effects/promoted-recipes.ts), [recipe-visuals.ts](../../../src/lib/effects/recipe-visuals.ts), `public/recipe-previews/<id>/`, [docs/effects/catalog.json](../../../docs/effects/catalog.json) | The owner asks to ship it, and its demonstration and assets are generic or owned with the right to redistribute. Follow [template packaging](references/template-packaging.md). |

A sequence built from an existing effect (several hops, a line, an exit) is a new effect with
its own card and name, not a rewrite of the effect it uses: the creator recognises the existing
card by what it shows. Update an existing card only when the creator is refining that effect. Never copy a
Yours-only file, path or face into the shared card ([catalog privacy](../../../AGENTS.md#media-ingestion)).

## 4. Write the brief

- **Inputs**: what to film or supply, in the creator's words, one short title and direction
  each ("Lock the camera", "Mark where you stop").
- **Preparation**: what DreamCut makes (cut-outs, sounds, measurements); originals stay intact.
- **Request** (`prompt`): the skill, the build route, what to preserve, what is left out
  (no captions or grade), the dials to give, the checks, and the proposal boundary ("propose
  it for me to review; never apply it").
- **Limits**: only what was actually observed or is untested, including fresh-input reuse.
- Keep `skill` pointing at the owning craft skill and the reference and tutorial links intact.

## 5. Assets the effect uses

Sounds, images or presets the effect needs are named by their Library title in the skill
and request, never by file path. Assets made from a third party's video stay in the
creator's profile library (Your media) unless their redistribution right is documented;
the shared catalog takes only generic, redistributable assets (`pnpm check:catalog-privacy`).
When an asset is personal, the shared card says how to get an equivalent (extract it with the
named tool, or pick from the catalog).

## 6. Demonstration

A Yours card leads with the creator's own result (`result`) and plays the raw footage they
supplied under You supply (`supplied`), so they recognise it and see what to bring. Rendering
the creator's project to make these is an export: ask first. Render without the parts left out
(scripts/render-preview.ts with an unposted proposal file that removes them). A shared demo
needs owned or licensed footage; a demo with the creator in it stays in Yours.

Frame the gallery tile too. Tiles are short and wide (about 155×84) and fill with the example, so a
tall or square example shows only a slice. Set `tile` (`x`, `y` from 0 to 1, and `at` seconds, or
`at_seconds` in Yours) on the point and moment where the subject is legible, and look at the tile in
the editor at its real size.

## 7. Check

- Validate the Yours catalog with `userEffectRecipesSchema` (it rejects unknown fields) and,
  for shared cards, run `pnpm check:effects`, `src/lib/effects/recipe-visuals.test.ts` and
  `src/lib/effects/promoted-recipes.test.ts`.
- Open Templates in the editor and read the card as the creator would.
- Trace a fresh request: with only the card and the skill, list what an agent would ask for,
  prepare, build and check. Every step must be findable; fix the skill where it is not.
- Report what is in the effect, what was left out, where the card lives and what is untested.
