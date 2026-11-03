# Working on DreamCut

DreamCut is open source under the [Apache License 2.0](LICENSE). This
guide covers setup and the checks every change goes through. Contributions are accepted under the same
license; sign off each commit (`git commit -s`) to certify the
[Developer Certificate of Origin](https://developercertificate.org/).

## Set up

```bash
corepack pnpm install && corepack pnpm bootstrap && corepack pnpm editor
```

Node 22 or 24, Git, FFmpeg and Chrome; the [README](README.md#install) says how to install each
on a new Mac. `corepack pnpm` runs the pinned pnpm without a global install (`corepack enable` once if you
want a plain `pnpm`). `pnpm setup:check` reports anything missing, and `node bin/dreamcut.mjs setup` installs
the caption, voice and cutout programs and models (about 4 GB). The editor runs at
http://127.0.0.1:3123 from a stable build. When changing editor code, run `pnpm dev`, a hot-reloading
editor at http://127.0.0.1:3129. Point Claude Code or Codex at the repo folder to edit through the agent.

To use a checkout outside `~/DreamCut`, remove the DreamCut plugin and connect the checkout directly
(`codex mcp add dreamcut -- node /absolute/path/to/dreamcut/bin/dreamcut.mjs mcp`; for Claude Code,
`claude mcp add dreamcut -s user -- node /absolute/path/to/dreamcut/bin/dreamcut.mjs mcp`).
Use one connection route; duplicate tools mean an older one is still connected. Sign-in and browser access
are set up per computer, not copied by cloning.

<a id="contributing-an-effect"></a>

## Contribute an effect or editing workflow

Templates are the easiest way to grow DreamCut. If you know how to make an effect (a speed hop, a clone
flash, a text-behind-you title), you can package that workflow so anyone's agent can rebuild it on their
own footage. A template is two things:

- **A skill** your agent follows: what the creator supplies, how to prepare it, how to build the effect
  from DreamCut's native pieces, and which controls the creator tunes. See
  [`clone-converge.md`](.agents/skills/video-compositing/templates/clone-converge.md) for a finished one.
- **A card** in Templates: a playable Input (the untreated take) and Result, the controls and known limits.

You don't write either by hand. Ask your agent, starting from whatever you have:

| You have | Ask your agent | It follows |
| --- | --- | --- |
| The effect working in a DreamCut edit | *"Package this effect as a template"* | [effect-authoring](.agents/skills/effect-authoring/SKILL.md) |
| A reference video or tutorial of someone else's effect | *"Turn this into a DreamCut template"* | [template-authoring](.agents/skills/template-authoring/SKILL.md) |
| A motion graphic idea | *"Make this a motion graphic template"* | Copy [`word-search-trace/`](.agents/skills/motion-graphics/templates/word-search-trace/): an `index.html`, optional `dreamcut.controls.json` for its sliders and a short brief |

template-authoring analyzes the reference, builds an editable version, then has a fresh agent rebuild it
from the saved skill alone and grades the result, so the template is proven to work without you in the
loop. Any agent works (Claude Code, Codex or another that reaches DreamCut's tools); use the strongest
model it offers. More detail: [packaging a template](docs/effects/packaging.md) and the
[template guide](docs/effects/template-authoring-guide.md).

Then share it:

1. **Pull request:** commit the skill or template, its catalog entry and evidence, and the Input and
   Result clips. Run `pnpm check:effects` and `pnpm check:catalog-privacy`, then open a pull request
   that lists what creators supply, the controls and known limits.
2. **No GitHub:** use **Templates → Yours → Share with DreamCut** (or ask your agent to "share this
   template with DreamCut"). We review it the same way.

Use only media you have the right to share. Don't commit other people's footage, names or links; describe
a reference as "a public tutorial".

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
