# Contributing to DreamCut

Thanks for helping. DreamCut is Apache-2.0; by contributing you agree your work is released under it.

## Set up

```bash
pnpm install && pnpm bootstrap && pnpm dev
```

Node 22 or 24, pnpm, FFmpeg and Chrome. `pnpm setup:check` reports anything missing. The editor runs at
http://127.0.0.1:3123. Point Claude Code or Codex at the repo folder to edit through the agent.

<a id="contributing-an-effect"></a>

## Add a template

The easiest way to grow DreamCut. Pick one route:

1. **From the app (no code):** ask your agent to *"save this as a template"*, export the project, then
   **Templates → Yours → Share with DreamCut**.
2. **Motion graphic (code):** copy
   [`word-search-trace/`](.agents/skills/motion-graphics/templates/word-search-trace/) into
   `.agents/skills/motion-graphics/templates/<name>/`: an `index.html`, an optional
   `dreamcut.controls.json` for its sliders, and a short `<name>.md` brief.
3. **Effect from a reference video:** ask your agent to *"recreate this effect as a DreamCut template"*.
   It follows the [recreate-effect skill](.agents/skills/recreate-effect/SKILL.md); see
   [packaging a recreated effect](docs/effects/packaging.md).

In the PR, include a short demo, what creators supply, the sliders, credits and known limits. Use only
media you have the right to share. Need an idea? See
[template ideas](https://github.com/lukemun/dreamcut/issues?q=label%3Atemplate-idea).

## Change the editor

Read [AGENTS.md](AGENTS.md) and the [architecture overview](docs/architecture/README.md) first. The rules
that matter most: the project folder's `timeline.json` is the source of truth, agents propose edits
and people approve them, and exports always render from the original media.

For UI changes, follow [editor-ui-design](.agents/skills/editor-ui-design/SKILL.md) and run
`pnpm check:editor-ui`.

## Open a pull request

1. Branch from `main`; keep one logical change per PR.
2. Run `pnpm check:pr` (typecheck, tests and the repo checks).
3. Sign off every commit (`git commit -s`), certifying the
   [Developer Certificate of Origin](https://developercertificate.org/).
4. Describe what changed, why, and how you tested it.

Maintainers: see [releasing](docs/releasing.md).
