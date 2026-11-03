# Recreate an effect: from reference to library entry

Most AI video tools generate finished assets you cannot control. DreamCut does the opposite: it helps you recreate effects you admire as editable layers and timelines, so every detail stays tweakable. This guide shows that loop end to end. Take a finished effect you love, break down how it is built, rebuild it as a reusable recipe, and file it so anyone can apply it to their own footage.

## The loop

1. **Capture the reference.** Save the clip or its source window and exact timestamps in your own notes. Keep the reference local: do not commit someone else's footage, names or links to the repository.
2. **Analyze the construction.** Watch the whole thing, then go frame by frame through the entrance, transformation, and exit. Write a timing map: when each element first appears, when it settles, when the switch happens. Keep observed behavior separate from guesses.
3. **Define the reusable recipe.** Name the behavior, not the example asset: `object-led-scene-transition`, not "food plates." List required versus optional inputs, the adjustable parameters, and success criteria that say exactly what "done" looks like.
4. **Build it with your own assets.** Apply the recipe to different footage. If it only works on the reference's exact assets, it is not reusable yet.
5. **Catalog it.** Add the GIF preview and MP4, the catalog entry, and the structured record in `catalog.json`.

The full procedure, including capability assessment and the development handoff, lives in the [template-authoring skill](../../.agents/skills/template-authoring/SKILL.md).

## Worked example: Mask Glitch

**The reference.** A short transition where each new shot's subject first appears as a white silhouette, then turns to full colour as the scene switches.

**The analysis.** Frame-by-frame inspection found one continuous handoff per cut: at 30 fps, the incoming subject shows white for two frames and original colour for three, then the scene switches. No empty frame falls between handoffs, and every mask stays aligned to its own subject.

**The recipe.** `mask-glitch`, owned by the [Mask Glitch skill](../../.agents/skills/mask-glitch/SKILL.md). Inputs: ordered shots with matching subject masks. Success criteria: each handoff lands on the cut, the white matte matches the incoming subject exactly, and the masks remain separate editable rows.

**The library entry.** [Mask Glitch in the catalog](README.md): its demo, built from owned poses over licensed library photos, plus the entry with inputs, preparation, success criteria and remaining limits.

## Do it yourself

1. Pick an effect from a video you like. Note the creator, link, and exact timestamps.
2. Mute it and watch the motion. Write the components down in order.
3. Draft the recipe: name the behavior, list the inputs, define the success criteria.
4. Recreate it with your own footage in DreamCut.
5. File it through the effects-library lane in [Contributing](../../CONTRIBUTING.md).

## From recreation to contribution

A recreation becomes part of DreamCut in three stages:

1. **Catalog it** - the effect entry in `docs/effects/` (Mask Glitch in this guide is the template).
2. **Skill it** - package the reusable method as an effect skill, following the [template-authoring skill](../../.agents/skills/template-authoring/SKILL.md) and [skill-authoring](../../.agents/skills/skill-authoring/SKILL.md). Name the behavior, not the example asset.
3. **Share it** - open a pull request (see [Contributing](../../CONTRIBUTING.md#contributing-an-effect)), or save it as a template and share it from **Templates → Yours → Share with DreamCut**.

Each stage makes the next creator's starting point better: a cataloged effect teaches the eye, a skill teaches the agent, and a shared template reaches other creators.
