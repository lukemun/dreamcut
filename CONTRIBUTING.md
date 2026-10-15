# Contributing to DreamCut

DreamCut is open source under the [Apache License 2.0](LICENSE) (see the [licensing guide](docs/licensing.md)). Contributions are welcome in two main lanes: growing the **effects library** and improving the **editor** itself. Docs fixes are welcome anywhere.

## Understand the system

Read the [software architecture overview](docs/architecture/README.md), then the technical document for the system you are changing. Architecture explains the design and implementation boundaries; the [standards](docs/standards/README.md) define the checks and invariants your change must satisfy. This guide covers contribution setup, packaging, and submission.

## First-time setup

Requires Node.js 22+, pnpm, and FFmpeg.

```bash
corepack enable
pnpm install
pnpm bootstrap
pnpm dev
```

`pnpm bootstrap` checks that Node, FFmpeg and Chrome are present and reports anything missing. Optional voice enhancement needs uv or Python 3.11 and about 400 MB; install it with `pnpm setup:voice`. A healthy checkout passes `pnpm setup:check` and `pnpm test`. Open `http://127.0.0.1:3123` to run the editor.

## Add a template

Templates are how DreamCut grows: each one teaches every creator's agent a new effect or motion
graphic it can build with their own footage. There are three ways to add one, from easiest to most
involved.

1. **Share it from the app (no code).** Make an edit you like, then ask your agent to *"save this as a
   template"*. Export the project, open **Templates → Yours**, select the template and choose
   **Share with DreamCut**. It goes into review for the community gallery, credited to you.
2. **Add a code-built motion template.** For titles, charts, word grids and other graphics made
   without footage, add a folder under `.agents/skills/motion-graphics/templates/<name>/` with
   `index.html` and an optional `dreamcut.controls.json` (the dials creators get), plus a short
   `<name>.md` brief. List it under "Packaged templates" in
   [the motion-graphics skill](.agents/skills/motion-graphics/SKILL.md). Copy
   [Word Search Trace](.agents/skills/motion-graphics/templates/word-search-trace/) as a starting point.
3. **Recreate an effect from a reference video.** Ask your agent to *"recreate this effect as a
   DreamCut template"* with a link or clip. It follows the
   [recreate-effect skill](.agents/skills/recreate-effect/SKILL.md) and packages the method, inputs,
   tuning controls and before/after evidence as described below.

For routes 2 and 3, open a pull request with a short demo, what creators need to supply, the dials
it offers, credits for any reference, and its known limits. Not sure where to start? Browse
[template ideas](https://github.com/lukemun/dreamcut/issues?q=label%3Atemplate-idea) or
[suggest one](https://github.com/lukemun/dreamcut/issues/new?template=template_idea.md).

<a id="contributing-an-effect"></a>

### Packaging an effect recipe


Start with the [creator-facing effect page template](docs/effects/creator-template.md).
Demonstrations are optional. Every contribution needs an honest implementation/evidence status, what the
creator supplies, whether those inputs can be generated, an ordered explanation,
and a portable agent request. See [all current effect pages](docs/effects/recipes.md)
for examples. Contributions are submitted as pull requests; a new renderer operator
is not required when existing building blocks can express the recipe.

Add the creator brief under its catalog ID in `src/lib/effects/creator-guides.ts`,
then run `pnpm exec tsx scripts/generate-effect-pages.ts --write` to update the
README index and recipe pages. `pnpm check:effects` rejects missing briefs or stale
pages. In the PR description include the effect ID, demo and input evidence,
rights/credits, tests with different inputs, available tuning controls and known
limitations. Follow the packaging steps below as well as the template checklist.

Contribute reusable **effect recipes**, not personal styles. Start with the [catalog and packaging template](docs/effects/README.md) and [recreation method](.agents/skills/recreate-effect/SKILL.md).

1. Choose an unused catalog ID and supply a reference clip. Record its source, credit, rights basis and SHA-256. Use owned, licensed or synthetic media, or a bounded credited excerpt you are entitled to share; attribution alone does not grant permission.
2. Recreate it with different assets. Preserve input files and output evidence, plus a comparison against explicit success criteria. A reference clip alone is a **candidate**, not a completed effect.
3. Put the reusable method in its owning `.agents/skills/<name>/SKILL.md`. Package before/after artifacts in `references/effect-evidence.json`, linking back to the catalog ID. Update the skill's evolution log.
4. Add the versioned recipe to `docs/effects/catalog.json`: reference, recreation, skill, inputs, preparation, success criteria, observations and limitations. Artifact paths are relative to `docs/effects/`; the evidence receipt carries the same recipe. Use **partial** while any fidelity or reuse checks remain unresolved. Only **complete** entries may claim all criteria passed.
5. Update the readable catalog and browser. Run `pnpm check:effects` for schema, hashes, path containment, reciprocal ownership and orphan checks, then `pnpm check:pr`. If changing the format, regenerate `catalog.schema.json` with `pnpm check:effects --write-schema`.
6. Open a PR with reference/recreation evidence, validation results and a DCO-signed commit (`git commit -s`). Keep personal style settings and local project files out of the contribution.

FX-08 demonstrates the packaging format with a partial recreation; FX-SCRATCHPAD uses the same receipt format for a static treatment. Neither is advertised as a verified fidelity benchmark. The remaining reference candidates retain their missing-evidence status.

## Contributing to the editor

Before changing editing behavior, read:

- [AGENTS.md](AGENTS.md) - how agents work in this repo
- [docs/standards/README.md](docs/standards/README.md) - engineering standards
- [docs/timeline-living-spec.md](docs/timeline-living-spec.md) - timeline semantics and the render-authority contract

The contracts that matter most: projects are folders and the timeline is the editable source of truth; preview may read a disposable proxy, but exports always use the declared render authority; agents prepare proposals, people approve them.

Editor UI changes follow [editor-ui-design](.agents/skills/editor-ui-design/SKILL.md) and include the [feature review record](docs/standards/editor-feature-integration.md#required-feature-review-record). Run `pnpm check:editor-ui` before visual review.

Keep pull requests small and focused. Run `pnpm typecheck` and `pnpm test` before opening one, and describe the behavior change plus how you tested it.

## Pull requests

Fork the repo, branch from `main`, and open a PR with a clear description of what changed and why. One logical change per PR.

Every contribution commit must include a `Signed-off-by` trailer (see below).

## Developer Certificate of Origin

Every contribution commit must include a `Signed-off-by` trailer. By signing off, you certify the [Developer Certificate of Origin 1.1](https://developercertificate.org/). Use your real name and an email address you control; Git can add the trailer when you commit:

```bash
git commit -s
```

If a pull request contains multiple commits, sign off each commit.
