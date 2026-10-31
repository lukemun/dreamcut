# Working on DreamCut

DreamCut is open source under the [Apache License 2.0](LICENSE). This
guide covers setup and the checks every change goes through. Contributions are accepted under the same
license; sign off each commit (`git commit -s`) to certify the
[Developer Certificate of Origin](https://developercertificate.org/).

## Set up

```bash
corepack pnpm install && corepack pnpm bootstrap && corepack pnpm editor
```

Node 22 or 24, Git, FFmpeg and Chrome; the [README](README.md#install-it-yourself) says how to install each
on a new Mac. `corepack pnpm` runs the pinned pnpm without a global install (`corepack enable` once if you
want a plain `pnpm`). `pnpm setup:check` reports anything missing, and `node bin/dreamcut.mjs setup` installs
the caption, voice and cutout programs and models (about 4 GB). The editor runs at
http://127.0.0.1:3123 from a stable build. When changing editor code, run `pnpm dev`, a hot-reloading
editor at http://127.0.0.1:3129. Point Claude Code or Codex at the repo folder to edit through the agent.

<a id="contributing-an-effect"></a>

## Contribute an effect or edit

The easiest way to grow DreamCut's catalog. Pick one route:

1. **From the app (no code):** ask your agent to *"save this as a template"*, export the project, then
   **Templates → Yours → Share with DreamCut** (needs a free DreamCut account).
2. **Send it (no GitHub):** send a video of how you made it plus the finished edit, and the raw footage if
   you have it, through the [form on the mission page](https://dreamcut.io/mission#send). We turn it into a
   template with your name on it.
3. **Build it yourself (code):** ask your agent to *"recreate this effect as a DreamCut template"*. It
   follows the [recreate-effect skill](.agents/skills/recreate-effect/SKILL.md); see
   [packaging a recreated effect](docs/effects/packaging.md). For a motion graphic, copy
   [`word-search-trace/`](.agents/skills/motion-graphics/templates/word-search-trace/) into
   `.agents/skills/motion-graphics/templates/<name>/`: an `index.html`, an optional
   `dreamcut.controls.json` for its sliders, and a short `<name>.md` brief. Open a pull request with the
   change.

With a pull request, include a short demo, what creators supply, the sliders, credits and known limits. Use
only media you have the right to share.

## Change the editor

Read [AGENTS.md](AGENTS.md) and the [architecture overview](docs/architecture/README.md) first. The rules
that matter most: the project folder's `timeline.json` is the source of truth, agents propose edits
and people approve them, and exports always render from the original media.

For UI changes, follow [editor-ui-design](.agents/skills/editor-ui-design/SKILL.md) and run
`pnpm check:editor-ui`.

## Before you push

1. Keep one logical change per commit.
2. Run `pnpm check:pr` (typecheck, tests and the repo checks).
3. Describe what changed, why, and how you tested it.

Maintainers: see [releasing](docs/releasing.md).
