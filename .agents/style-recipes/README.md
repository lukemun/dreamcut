# Style recipes

Optional, versioned art-direction presets for DreamCut. Style recipes describe a subjective look; they do not define permissions, safety rules, construction correctness, or universal quality gates. See the [agent knowledge architecture](../../docs/agent-knowledge-architecture.md) for the authority and promotion boundaries between recipes, skills, standards, and My Style.

Use the three layers this way:

- **Skills** explain how to build and verify a treatment reliably.
- **Style recipes** name one optional aesthetic expression of that treatment: palette, rhythm, texture, softness, shadow character, and other tunable choices.
- **My Style** (authoritative `STYLE.md`) records when a creator tends to choose a treatment. It remains the personal authority and may point to a recipe by ID.

A recipe is never active merely because it exists in this catalog. Current user direction wins, followed by project-specific decisions and applicable active personal preferences. If none selects a recipe, ask only when the choice materially changes the result; otherwise use restrained, reversible parameters and identify them as a working choice.

Keep deterministic algorithms, proposal requirements, source preservation, and acceptance checks in the execution skill. Keep creator-specific defaults out of this repository catalog unless they are intentionally generalized into an optional named treatment.

## Catalog

| Recipe | Treatment | Character |
| --- | --- | --- |
| [blue-steel-inverse-captions](blue-steel-inverse-captions.md) | [video-typography](../skills/video-typography/SKILL.md) | Clean inverted glyphs over warm footage; optional look for Inverse Video. |
| [progressive-color-paper-stack](progressive-color-paper-stack.md) | [layered-paper-cutout](../skills/layered-paper-cutout/SKILL.md) | White-to-color paper echoes with successively wider, rounder sheets and restrained collage depth. |
