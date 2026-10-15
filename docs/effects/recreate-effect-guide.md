# Recreate an effect: from reference to library entry

Most AI video tools generate finished assets you cannot control. DreamCut does the opposite: it helps you recreate effects you admire as editable layers and timelines, so every detail stays tweakable. This guide shows that loop end to end. Take a finished effect you love, break down how it is built, rebuild it as a reusable recipe, and file it so anyone can apply it to their own footage.

## The loop

1. **Capture the reference.** Save the clip or its source window: creator, link, exact timestamps. Credit the creator. The worked example below embeds a short excerpt of the original with its audio, credited to the creator.
2. **Analyze the construction.** Watch the whole thing, then go frame by frame through the entrance, transformation, and exit. Write a timing map: when each element first appears, when it settles, when the switch happens. Keep observed behavior separate from guesses.
3. **Define the reusable recipe.** Name the behavior, not the example asset: `object-led-scene-transition`, not "food plates." List required versus optional inputs, the adjustable parameters, and success criteria that say exactly what "done" looks like.
4. **Build it with your own assets.** Apply the recipe to different footage. If it only works on the reference's exact assets, it is not reusable yet.
5. **Catalog it.** Add the GIF preview and MP4, the catalog entry, and the structured record in `catalog.json`.

The full procedure, including capability assessment and the development handoff, lives in the [recreate-effect skill](../../.agents/skills/recreate-effect/SKILL.md).

## Worked example: FX-08

**The reference.** Watch the original snippet: [FX-08.mp4](media/FX-08.mp4) (about a second, with the reel's original audio), from [@celfstudies' reel](https://www.instagram.com/reel/DdN_aljAIY0/), source window 5.933-6.933s. Credit to the creator. The effect, in one sentence: objects from the next scene float in over the current shot, settle into their destination arrangement, the background switches to the new scene, and each object briefly flashes white.

**The analysis.** Frame-by-frame inspection broke it into three coordinated components that only work as one sequence:

- staggered entrances: each object enters individually over the outgoing shot and lands at its final position;
- one background switch: the outgoing scene cuts to the incoming scene underneath the settled objects;
- alpha-confined white blips: each object flashes white inside its own silhouette, in sequence.

The catalog entry keeps the former ranked analyses (FX-08 + FX-09) as combined source IDs, because the two entries turned out to be components of this single effect. That regrouping is marked as reviewed; other groupings in the catalog are still provisional.

**The recipe.** Proposed reusable recipe: `object-led-scene-transition`, owned by the [Mask Glitch skill (legacy pop variant)](../../.agents/skills/mask-glitch/SKILL.md). Inputs: outgoing scene; incoming scene with the objects in their final arrangement; one cutout or mask per object; entrance order and landing targets; background-switch time; per-object blip timing. The [33-bird recreation](media/FX-08-recreation.mp4) demonstrates pops and white flashes. It is partial: batched pops do not yet reproduce the reference’s floating trajectories, and fresh-input fidelity verification remains open.

**The library entry.** [FX-08 in the catalog](README.md): silent GIF preview, playable MP4, and the entry with inputs, sequence preparation, and success criteria. The last line of the success criteria is the reusability test: "Reuse with a different number and type of objects."

## Do it yourself

1. Pick an effect from a video you like. Note the creator, link, and exact timestamps.
2. Mute it and watch the motion. Write the components down in order.
3. Draft the recipe: name the behavior, list the inputs, define the success criteria.
4. Recreate it with your own footage in DreamCut.
5. File it through the effects-library lane in [Contributing](../../CONTRIBUTING.md).

## From recreation to contribution

A recreation becomes part of DreamCut in three stages:

1. **Catalog it** - the effect entry in `docs/effects/` (FX-08 in this guide is the template).
2. **Skill it** - package the reusable method as an effect skill, following the [recreate-effect skill](../../.agents/skills/recreate-effect/SKILL.md) and [skill-authoring](../../.agents/skills/skill-authoring/SKILL.md). Name the behavior, not the example asset.
3. **Contribute it** - open a pull request through the effects-library lane in [Contributing](../../CONTRIBUTING.md).

Each stage makes the next creator's starting point better: a cataloged effect teaches the eye, a skill teaches the agent, and a contribution teaches the community.
