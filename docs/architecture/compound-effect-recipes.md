# Compound effect recipes

[Architecture overview](README.md) · [Effects architecture](effects.md)

Status: a concrete skill-owned recipe is available; a general runtime compound-recipe compiler and linked compound-control UI are not implemented by this document.

## Why a recipe can contain several effects

A perceived treatment can be a coordinated collection of visual and audio operations. The reusable unit is the experience and its relationships: for example, a masked white flash plus a click timed to its onset. Its timeline representation should still expose the separate picture and sound actors.

A skill describes how to perform a class of work. A recipe specifies one repeatable construction within that class. A personal style records a creator's preferred recipe choices and values. A project instance binds those choices to actual sources, actors, and timeline anchors. These are different objects; a new repeated pairing does not require duplicating the entire skill or flattening its components into one clip.

```text
skill: procedure and supported operations
  → recipe: roles + shared anchors + timing relationships + parameters
  → optional personal style: chosen variant and preferred parameter values
  → project binding: target, source identities, prepared masks, beat/frame
  → one reviewable audiovisual proposal with separately editable actors
```

## Worked example: Masked flash + crisp click

The [recipe procedure](../../.agents/skills/mask-glitch/references/masked-flash-click.md) and [structured parameter contract](../../.agents/skills/mask-glitch/references/masked-flash-click.recipe.json) package the repeated masked-flash treatment under `mask-glitch`, with `sound-design` as the supporting procedure.

The first flash frame is the shared anchor. A two- or four-frame white region overlay begins there; the reference click starts one 30 fps frame earlier so its measured peak lands near that onset. The sound decay outlasts the visual flash. Changing flash duration therefore need not change sound duration, and moving the anchor requires rederiving both starts. This is composition of existing capabilities, not a new render primitive.

The working timeline contains 14 matching picture/sound pairs: five two-frame and nine four-frame flashes, all with the same gain and one-frame sound lead. Two representative mask regions were inspected at boundary frames. These observations establish a repeatable schedule, not a new-input fidelity test or a complete listening acceptance. The evidence stays tied to the source project/revision in a local extraction receipt; the reusable recipe carries no private project IDs or audio binary.

## Recipe versus instance state

| Shared recipe | Project instance | Optional personal style |
| --- | --- | --- |
| Asset roles and capabilities | Concrete media hashes and actor IDs | Selected recipe variant/version |
| Relative timing and anchors | Absolute output-frame anchor | Preferred flash duration |
| Parameter meanings and defaults | Per-instance two/four-frame choice | Preferred click identity and gain |
| Required control semantics | Supported proposal control references | Preferred sound/flash relationship |
| Verification and limitations | Evidence, preview, and approval state | Explicit save authorization and revision |

Never reuse the source example’s absolute timestamps, target IDs, or window masks on unrelated footage. Bind fresh inputs and validate registration. The exact sound is an asset dependency, not part of the shared code package; production-use clearance does not establish permission to redistribute the WAV.

## Current execution and controls

Today the agent reads the recipe, binds inputs, derives the relative schedule, and prepares supported `create_visual`, `create_audio`, or revision operations through the [proposal system](proposals.md). The JSON is a descriptive contract, not an accepted API request or a claimed runtime-loaded format. Existing validation, preflight, and human approval still govern application.

A single accent is one audiovisual review decision, with its components separately editable. Flash duration, amount, and click level are useful controls where the operation inventory exposes them. A shared anchor control would need an override contract that rederives all dependent starts. Independent start sliders do not supply that behavior today.

The current [personal-style store](../personal-styles.md) accepts scalar skill parameters; a variant selector can preserve this preference after an explicit save. Its `recipe_id` field refers to actual evidence-backed catalog entries, so this skill-local ID must not be placed there. The extracted bundle is not automatically saved as a style or applied to any timeline.

## Path to a runtime recipe feature

If this pattern becomes a first-class editor feature, the missing layer is a versioned binding and derivation contract: typed roles, parameter validation, dependency resolution, instance receipts, and linked overrides shared by preview and approval. It must define substitution, frame-rate conversion, insufficient source handles, absent assets, lane conflicts, reset, and undo. Recipe versions and evidence maturity are separate: a stable schema does not mean visual/audio acceptance is complete.

That future layer should reuse the existing proposal derivation and control registries. The worked recipe demonstrates the desired ownership boundary without introducing a parallel mutation engine or promising a one-click feature that does not exist.

A bounded [prepared reveal adapter](reveal-sequence-controls.md) now compiles ordered
normal-speed actors and linked audio into existing proposal timing controls. This
is not the general recipe compiler described above; it does not compile arbitrary
recipe JSON, prepare media, or schedule scene handoffs.

## Versioned execution entry point

[Tool discovery and recipes](tool-discovery-recipes.md) now provides `recipe_compile`
for the bounded `prepared-reveal-sequence` recipe, reusing the existing compiler.
This does not make the descriptive masked-flash recipe JSON executable or implement
a general runtime recipe language. Discover executable readiness explicitly.
