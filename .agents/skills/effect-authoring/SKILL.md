---
name: effect-authoring
description: Package an effect that already works in a creator's edit into a reusable effect (a Templates card) with its whole workflow, so a later request with new footage rebuilds it. Use when the creator says "make this an effect", "package this", "save this as a template" or "author an effect" about something built in a project. Not for copying an effect from someone else's video (recreate-effect), a named colour or caption look (style recipes, My Style), or saving one motion graphic for reuse (motion_library_save).
---

# Author an effect from a finished edit

An effect in DreamCut is a brief, not a saved timeline: a Templates card names what the
creator supplies, what DreamCut prepares, the owning skill that builds it and the request an
agent follows. A later agent reads only the card and the skill, with someone else's footage.
Success means that agent rebuilds the effect as one card the creator can apply without a
follow-up, without this session's history: the one-click bar in step 3.

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

The build route must meet the one-click bar below. Name any part that still needs a
hand-written card or the agent's own judgement as a limit on the card.

## 3. Meet the one-click bar

A creator clicks the card, gives footage and marks, and gets one card that works. Speed hops
missed every point below on its first fresh build (2026-10-28), so check each before calling
an effect packaged; one that fails is a limit on the card, not a footnote in the skill.

- **One compiled route, chosen by the card.** The effect compiles from a proposal block, a
  recipe or `recipe_compile`, or a motion graphic, and a template input on that route fixes
  the choices that make it this effect (for example `hop_sequence` with
  `template: "speed_hops"`: always mark to mark, its own defaults). The card's `prompt` names
  that input. An agent left to pick a variant or copy settings from an old card picks wrong.
- **A starting point, fitted to each take.** The template sets what the card starts with,
  not one exact result: the agent fits it to the creator's footage and words (how many stops,
  where the line ends), and a part the creator may not want on their take (an exit, a
  flourish) is a dial with an off position, like all visible motion (AGENTS.md), never a
  fixed piece and never a clip a dial removes. Start with the parts the card promises.
- **Everything in one card.** Sounds, the empty plate, lane order and anything else the demo
  shows come from the same compile, tied to the moving parts so timing dials carry them
  (`follows_visual`). Never "a second card once the picture is right": it does not arrive.
- **Plain dials.** Main dials say what the creator sees or hears ("Pause at stop", "Hop
  length", "Blur", "Sound volume"), about four leading. A setting the template fixes (the
  variant that defines the effect) is hidden (`hidden` on the block setting), not shown at its
  value; a part the creator can turn off stays on the card. No internal words: variant names,
  "travel", "empty beat", "every hop".
- **A clean dial sweep.** Stage the card through `proposal_create` on a disposable copy of
  real footage, never the creator's project, and read its `dial_sweep` and `warnings`: no dial,
  including sliders derived from compiled keyframes, may break the preview at either end.
- **Measurements from named tools.** Every input the agent measures (cut-out windows, settle
  and takeoff frames, subject boxes) names the tool that measures it. Where it is still the
  agent's judgement, the card says so in its limits.
- **Sound checked from the card.** Frames cannot prove sound. Check each sound's loudest
  moment lands on its event frame in the compiled card, and say it has not been heard.
- **Card and skill agree.** After any route change, reread the card's `prompt` and limits and
  the skill's steps together; they describe the same single card.

## 4. Choose where the card lives

| Home | Files | Use when |
| --- | --- | --- |
| **Yours** (the creator's Templates) | `effect-recipes/catalog.json` under `profileDir()`; schema in [user-effect-recipes.ts](../../../src/lib/local-store/user-effect-recipes.ts) | Default. Anything showing or naming the creator, their people or places, or assets cleared only for them. |
| **Shared** (every DreamCut user) | [promoted-recipes.ts](../../../src/lib/effects/promoted-recipes.ts), [recipe-visuals.ts](../../../src/lib/effects/recipe-visuals.ts), `public/recipe-previews/<id>/`, [docs/effects/catalog.json](../../../docs/effects/catalog.json) | The owner asks to ship it, and its demonstration and assets are generic or owned with the right to redistribute. Follow [template packaging](references/template-packaging.md). |

A sequence built from an existing effect (several hops, a line, an exit) is a new effect with
its own card and name, not a rewrite of the effect it uses: the creator recognises the existing
card by what it shows. Update an existing card only when the creator is refining that effect. Never copy a
Yours-only file, path or face into the shared card ([catalog privacy](../../../AGENTS.md#media-ingestion)).

## 5. Write the brief

- **Inputs**: what to film or supply, in the creator's words, one short title and direction
  each ("Lock the camera", "Mark where you stop").
- **Preparation**: what DreamCut makes (cut-outs, sounds, measurements); originals stay intact.
- **Request** (`prompt`): the skill, the build route, what to preserve, what is left out
  (no captions or grade), the dials to give, the checks, and the proposal boundary ("propose
  it for me to review; never apply it").
- **Limits**: only what was actually observed or is untested, including fresh-input reuse.
- Keep `skill` pointing at the owning craft skill and the reference and tutorial links intact.

## 6. Assets the effect uses

Sounds, images or presets the effect needs are named by their Library title in the skill
and request, never by file path. Assets made from a third party's video stay in the
creator's profile library (Your media) unless their redistribution right is documented;
the shared catalog takes only generic, redistributable assets (`pnpm check:catalog-privacy`).
A shared effect uses only sounds in DreamCut's shared library (the catalog, or the members' list
DreamCut Cloud serves and the editor fetches); a sound it needs that is still personal is added to
that library before the effect ships, never pointed to as a file. The demo stays silent when the
sound is not cleared to redistribute in the repository.

## 7. Demonstration

A Yours card leads with the creator's own result (`result`) and plays the raw footage they
supplied under You supply (`supplied`), so they recognise it and see what to bring. Rendering
the creator's project to make these is an export: ask first. Render without the parts left out
(scripts/render-preview.ts with an unposted proposal file that removes them). A shared demo
needs owned or licensed footage; a demo with the creator in it stays in Yours.

A shared demo's `manifest.json` receipt names the project and take it was built from; that is
where an agent looks first when the creator asks for "the video the effect shows".

Frame the gallery tile too. Tiles are short and wide (about 155×84) and fill with the example, so a
tall or square example shows only a slice. Set `tile` (`x`, `y` from 0 to 1, and `at` seconds, or
`at_seconds` in Yours) on the point and moment where the subject is legible, and look at the tile in
the editor at its real size.

## 8. Check

- Validate the Yours catalog with `userEffectRecipesSchema` (it rejects unknown fields) and,
  for shared cards, run `pnpm check:effects`, `src/lib/effects/recipe-visuals.test.ts` and
  `src/lib/effects/promoted-recipes.test.ts`.
- Open Templates in the editor and read the card as the creator would.
- Trace a fresh request: with only the card and the skill, list what an agent would ask for,
  prepare, build and check. Every step must be findable; fix the skill where it is not.
- Prove the one-click bar (step 3) on a disposable copy: one card, template input set, sounds
  in it, plain main dials, an empty `dial_sweep`, landing frames checked with
  `pnpm frame-state <copy> --proposal-file <card> --at <times>`.
- Give a shared effect its one-click eval ([effect-one-click](../../../docs/evals/effect-one-click.md)):
  an entry in `EFFECT_EVALS` ([effect-eval.ts](../../../src/lib/agent/effect-eval.ts)) naming its
  block, template input, the settings the template fixes and its sounds; reference and known-bad
  cards in `effect-eval.test.ts`; and a private case package from real footage (state before the
  effect, the creator's words) run with `pnpm eval:case`. Remove the effect from
  `EFFECTS_WITHOUT_EVAL`. A Yours-only effect gets the package; grade it with the same checks.
- Report what is in the effect, what was left out, where the card lives and what is untested.
