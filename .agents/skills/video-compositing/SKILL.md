---
name: video-compositing
description: Compose layered video, images, overlays, masks, keys, crops, and effects in a DreamCut timeline.
---

# Video compositing

Before constructing an effect, follow the [continuous-source effect gate](../../../docs/standards/effect-capabilities.md#continuous-source-effect-gate). Keep a continuous performance on one source clip with timed effects; document and justify any derivative or extra cut before preparing the proposal. Missing native controls are capability gaps, not permission to silently split or bake the treatment.

Read `../open-edit-proposals/SKILL.md` before timeline work.
Read `../spatial-composition/SKILL.md` for multi-actor layout and evidence requirements.

Reason explicitly about canvas geometry, source aspect ratio, layer order, overlap, masks, and safe areas. Keep effects editable and use allowlisted effect controls. Validate representative frames at the start, middle, and end of an overlap.

Keep independently adjustable visual actors as separate elements, but place actors belonging to one scene in the same proposal option so the combined preview can be assessed.

For **Mask Glitch**, consecutive mask handoffs, or the legacy **Pop-in white flash** variant, use [mask-glitch](../mask-glitch/SKILL.md) as the named entry point; it owns sequence timing and uses this skill for construction.

For moving person or object masks, use [rotoscope](../rotoscope/SKILL.md) for source-matched tracking, correction, and matte verification before composition.

## Extract objects from a still

Follow [object cutouts and scene transitions](references/object-cutouts.md) when a
photo supplies independently animated objects. It defines required inputs, mask
options, source-pixel extraction, cleanup, registration, and acceptance. Generated
masks are optional; supplied alpha, manual masks, and compatible segmentation tools
can supply the same mask contract. Check actual tool availability and input support.

For reference recreations, consume the measured timing map from
[recreate-effect](../recreate-effect/SKILL.md#preserve-the-reference-timing).
Keep entrances, the background handoff, and object flashes in one coordinated recipe.

## Packaged templates

- [Clone Flash](templates/clone-flash.md): cut-out copies of the subject from later in the take arrive beside them with a white flash.
- [Silhouette Window](templates/silhouette-window.md): short fill clips play only inside the subject's moving silhouette.
- [Cross into Negative](templates/cross-negative.md): a cross opens onto the next shot as a black-and-white negative and widens to fill the frame.
- [Speed Entrance & Exit](templates/speed-entrance-exit.md): the subject's cutout streaks into a still, empty set with motion blur and streaks out again.
- [Moving Grid Matte](templates/moving-grid-matte.md): the original footage shows only through square cells that follow the subject's silhouette.

## Effect recipe evidence

[Catalog-linked input/output evidence](references/effect-evidence.json) records reference, recreation, hashes, and limitations. Candidate and partial records do not establish a verified reusable effect.

## Learned refinements

- Scope colour and brightness effects to the intended actors and beats, then verify at representative frames that embedded and reveal layers retain their independently intended colour.
- Use the current approved graded source as color authority for its derivatives, and verify every plate, cutout, mask-context layer, and replacement shot matches it at representative reveal and settled frames.
