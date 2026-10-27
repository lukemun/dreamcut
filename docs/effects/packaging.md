# Packaging a recreated effect

Start with the [creator-facing effect page template](creator-template.md).
Demonstrations are optional. Every contribution needs an honest implementation/evidence status, what the
creator supplies, whether those inputs can be generated, an ordered explanation,
and a portable agent request. See [all current effect pages](recipes.md)
for examples. Creators share their own templates from Templates (Share with DreamCut); built-in templates
are added by the DreamCut team. A new renderer operator is not required when existing building blocks can
express the recipe.

Add the creator brief under its catalog ID in `src/lib/effects/creator-guides.ts`,
then run `pnpm exec tsx scripts/generate-effect-pages.ts --write` to update the
template index and recipe pages. `pnpm check:effects` rejects missing briefs or stale
pages. In the PR description include the effect ID, demo and input evidence,
rights/credits, tests with different inputs, available tuning controls and known
limitations. Follow the packaging steps below as well as the template checklist.

Contribute reusable **effect recipes**, not personal styles. Start with the [catalog and packaging template](README.md) and [recreation method](../../.agents/skills/recreate-effect/SKILL.md).

1. Choose an unused catalog ID and supply a reference clip. Record its source, credit, rights basis and SHA-256. Use owned, licensed or synthetic media, or a bounded credited excerpt you are entitled to share; attribution alone does not grant permission.
2. Recreate it with different assets. Preserve input files and output evidence, plus a comparison against explicit success criteria. A reference clip alone is a **candidate**, not a completed effect.
3. Put the reusable method in its owning `.agents/skills/<name>/SKILL.md`. Package before/after artifacts in `references/effect-evidence.json`, linking back to the catalog ID. Update the skill's evolution log.
4. Add the versioned recipe to `docs/effects/catalog.json`: reference, recreation, skill, inputs, preparation, success criteria, observations and limitations. Artifact paths are relative to `docs/effects/`; the evidence receipt carries the same recipe. Use **partial** while any fidelity or reuse checks remain unresolved. Only **complete** entries may claim all criteria passed.
5. Update the readable catalog and browser. Run `pnpm check:effects` for schema, hashes, path containment, reciprocal ownership and orphan checks, then `pnpm check:pr`. If changing the format, regenerate `catalog.schema.json` with `pnpm check:effects --write-schema`.
6. Open a PR with reference/recreation evidence, validation results and a DCO-signed commit (`git commit -s`). Keep personal style settings and local project files out of the contribution.

FX-08 demonstrates the packaging format with a partial recreation; FX-SCRATCHPAD uses the same receipt format for a static treatment. Neither is advertised as a verified fidelity benchmark. The remaining reference candidates retain their missing-evidence status.
