# Effect recipes

**[Browse every effect: demos, inputs and agent requests](recipes.md)** ·
**[Contribute using the effect page template](creator-template.md)**

This repository catalog contains shared methods with evidence. The editor also shows
user-only recipes from the local profile; those are not contributed here. Personal
styles remain private parameter settings, a separate concept from a recipe.


## All templates

<!-- BEGIN EFFECT INDEX -->
These are the shared effects in the Templates gallery. Each link opens its demo, input brief, build sequence and the request your agent works from.

| Effect | What you supply | Evidence |
| --- | --- | --- |
| [Mask Glitch](recipes.md#fx-mask-glitch) | Ordered shots | Partial recreation · read limitations |
| [Clone Converge](recipes.md#fx-clone-converge) | Lock the camera; Film the empty set; Choose the stops and line | Partial recreation · read limitations |
| [Speed Entrance & Exit](recipes.md#fx-speed-entrance-exit) | Performance footage; Matching empty background | Implemented template · built with your agent |
| [Speed Effect](recipes.md#fx-speed-hops-to-camera) | One locked-off take; Marks where you stop | Implemented template · built with your agent |
| [Flash effect](recipes.md#fx-flash-effect) | One locked-off take of your walk to the camera; Marks where you flash | Implemented template · built with your agent |
| [Mask Glitch · Glow](recipes.md#fx-mask-glitch-glow) | Ordered pose or performance takes; Matching empty background | Implemented template · built with your agent |
| [Moving Grid Matte](recipes.md#fx-moving-grid-matte) | Moving subject footage; Background | Implemented template · built with your agent |
| [Paper cutout](recipes.md#fx-paper-cutout) | A shot with the subject | Implemented template · built with your agent |
| [Word Search Trace](recipes.md#fx-word-search-trace) | Two to four short shots; One word per shot | Implemented template · built with your agent |
| [3D Sketch Scene](recipes.md#fx-motion-sketch-3d) | What the scene shows | Implemented template · built with your agent |
| [Clone Flash](recipes.md#fx-clone-flash) | A still shot of a person | Implemented template · built with your agent |
| [Silhouette Window](recipes.md#fx-silhouette-window) | A shot of a person; Several short fill clips | Implemented template · built with your agent |
| [Cross into Negative](recipes.md#fx-cross-negative) | Two shots | Implemented template · built with your agent |
| [Video Letters](recipes.md#fx-video-letters) | A short word; A video | Implemented template · built with your agent |
| [Layered Paper Cutout](recipes.md#layered-paper-cutout) | Portrait; Music and hits | Demonstration · not catalog-verified |
| [Background removal](recipes.md#talking-head-cutout) | Photo or video | Demo not available yet |

Want to add one? Start with the [effect page template](creator-template.md) and [PR contribution guide](../../CONTRIBUTING.md#contribute-an-effect-or-editing-workflow).
<!-- END EFFECT INDEX -->

## Your own recipes

Recipes you save stay on your computer, in `effect-recipes/catalog.json` under your DreamCut
profile folder, with their example videos beside them. They show in Properties → Templates
next to the shared ones and are never uploaded. Sharing one is a pull request with the
evidence described below ([format](../../src/lib/local-store/user-effect-recipes.ts)).

Write inputs as filming directions: where the camera goes, what to do, how to keep lighting
and background consistent, and which original files to supply. Say when DreamCut prepares a
mask, so nobody is asked for a technical file they don't have.

Template demo videos are small proxies in `public/guide/effects/catalog/`, bound to the
catalog's recreation hash (`pnpm exec tsx scripts/prepare-guide-proxies.ts` regenerates them).

[Machine-readable catalog](catalog.json) · [JSON schema](catalog.schema.json) · [Recreation guide](template-authoring-guide.md) · [Contributing](../../CONTRIBUTING.md)

## Compound recipe example

[Masked flash + crisp click](../../.agents/skills/mask-glitch/references/masked-flash-click.md) is a skill-owned partial recipe: one white-mask accent and one source-anchored click, kept as editable actors. Its [architecture example](../architecture/compound-effect-recipes.md) separates the method, project instance, and optional saved personal style. It is not yet a separately packaged catalog entry or a one-click preset; the licensed sound is referenced rather than redistributed.

## Media redistribution

The Layered Paper Cutout example (`public/guide/effects/contour-first-half.mp4`, `contour-first-half.jpg` and `input-contour-current.png`) shows a person who cleared it for redistribution with DreamCut; that is not a broader license.

## Format and status

Each `recipe` includes a reference, optional recreation, owning skill, inputs, preparation, success criteria and before/after evidence. Every artifact records a portable path relative to this directory, SHA-256, kind, credit and rights basis. The owning skill links a `references/effect-evidence.json` receipt back to the same catalog entry.

- **Candidate:** reference analysis only; no recreation is claimed.
- **Partial:** recreation and input/output evidence exist, with explicitly recorded gaps.
- **Complete:** recreation, before/after evidence and all success criteria verified; no unresolved limitations. Schema validity alone does not prove visual quality.

Run `pnpm check:effects` to check format, files, hashes, reciprocal skill links and orphan receipts. The executable validator also enforces status rules. Run `pnpm check:effects --write-schema` after changing the format.

## Promoted workflows without public media

`src/lib/effects/promoted-recipes.ts` contains public construction briefs promoted
from working local recipes. Speed Entrance & Exit, Mask Glitch · Glow and Moving
Grid Matte are available in Guide and Library with optional demonstrations. They
are labelled implemented, with their remaining acceptance limits; this is not an
upgrade to the evidence catalog's complete status. Private reference files remain
local, and their redundant discovery cards are replaced by the shared briefs.

Public examples can be added later using generated source footage and an actual
editable construction. No personal working footage is required for promotion.
