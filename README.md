<p align="center">
  <img src="docs/assets/open-edit-logo.png" alt="DreamCut logo" width="160" />
</p>

<h1 align="center">DreamCut</h1>

<p align="center"><b>An open-source video editor where AI agents propose edits and you approve them.</b></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0 license"></a>
  <img src="https://img.shields.io/badge/node-22%20%7C%2024-339933" alt="Node 22 or 24">
  <img src="https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Codex-8A63D2" alt="Works with Claude Code and Codex">
</p>

DreamCut is a local, agent-native video editor. You describe an edit in plain words to your coding
agent (Claude Code or Codex), and it works on a **real timeline with real layers**: clips, captions,
masks, motion graphics, music and sound. Each change arrives as a **proposal** you can preview, tune
with sliders and then apply or reject. Nothing touches your cut until you say so.

> **Status:** early and moving fast. Built for developers and technical creators who are comfortable
> running a local dev server. macOS is the most tested platform; Windows and Linux are in progress.

## Why DreamCut

- **A timeline, not a black box.** The agent edits the same `timeline.json` you see in the editor.
  Everything stays editable by hand afterwards.
- **You approve every change.** Agents can only *propose* edits to your working cut. You preview each
  one, adjust its dials and click **Apply**, and **Undo** still works afterwards.
- **Tunable results.** Each proposal comes with the controls that matter for that edit (timing,
  intensity, color, position and so on), so you can get it exactly right without re-prompting.
- **Templates.** Reusable effects such as *Word Search Trace*, *Clone Flash* and *Masking Hook*
  that your agent rebuilds with your own footage. Recreate an effect you saw online and share it back.
- **Learns your style.** DreamCut remembers your editing preferences in a readable `STYLE.md`, so each
  new project starts closer to how you like it.
- **Local and file-based.** Each project is a folder. Your media stays on your machine and the editor
  binds to `127.0.0.1` only.
- **Open rendering.** Preview and export share one frame runtime: Browser GPU (CanvasKit) by default,
  with Chrome and FFmpeg for export. An optional Rust decoder is available.

## Install with your agent (no git needed)

The quickest way in if you use **Claude Code** or **Codex** and don't want to touch source code.
Currently for **Apple Silicon Macs**.

1. Install [Node.js](https://nodejs.org/) (the LTS download) and FFmpeg (`brew install ffmpeg`, or
   ask your agent to install it for you).
2. Add DreamCut to your agent. In a terminal, run one of these:

   ```bash
   claude mcp add dreamcut -- npx -y dreamcut mcp
   ```

   ```bash
   codex mcp add dreamcut -- npx -y dreamcut mcp
   ```

3. Start your agent and say: **"Open DreamCut."** The first start downloads the editor (about
   300 MB) and your agent shows its progress. After that, DreamCut opens in your browser.
4. Ask for an edit: **"Make a Word Search Trace video from the clips in ~/Movies/hike."** Your agent
   builds it, and you review, tune and apply it in the editor. See the [tutorial](#tutorial-make-a-word-search-trace-video-from-a-template).

To run the editor without an agent, use `npx dreamcut`. Updates install automatically in the background.

## Quick start (from source)

Requirements:

| Need | Notes |
| --- | --- |
| **macOS** (most tested), Linux or Windows | Windows and Linux support is in progress |
| **Node.js 22 or 24** (LTS) | Node 23 and other odd-numbered releases can't build a native module |
| **pnpm** | Run `corepack enable` once, or install pnpm yourself |
| **FFmpeg** | macOS: `brew install ffmpeg`. Windows: `winget install Gyan.FFmpeg` |
| **Google Chrome** | Used for exports. `pnpm exec playwright-core install chrome` installs it |
| **Claude Code or Codex** | Your existing subscription; the agent does the editing |

> **Heads-up:** DreamCut shares *editing history* (never your media) after each export to improve
> the agent. It's on by default; turn it off under **User → Settings**. See [Data sharing](#data-sharing).

```bash
git clone https://github.com/lukemun/dreamcut.git
```

```bash
cd dreamcut && corepack enable && pnpm install
```

```bash
pnpm bootstrap
```

```bash
pnpm dev
```

`pnpm bootstrap` checks Node, FFmpeg/ffprobe and Chrome and reports anything missing with install
instructions. Run `pnpm setup:check` to re-check at any time. Optional voice enhancement (cleaning up
speech) needs uv or Python 3.11 and about 400 MB; add it with `pnpm setup:voice`.

Open **http://127.0.0.1:3123**. To try it without your own footage, create a sample project:

```bash
pnpm seed-demo
```

### Connect your agent

The agent talks to the editor through an MCP server (`mcp/server.mjs`, registered as `timeline-editor`).

- **Claude Code:** run `claude` from the repository root. The checked-in `.mcp.json` registers the
  server, and [`AGENTS.md`](AGENTS.md) (symlinked as `CLAUDE.md`) gives the agent its operating guide.
- **Codex:** register the server once from the repository root, then run `codex` there:

```bash
codex mcp add timeline-editor -- node "$(pwd)/mcp/server.mjs" --profile=full
```

Keep `pnpm dev` running while you work. The agent opens the project in the editor so you can watch
proposals arrive.

## Tutorial: make a "Word Search Trace" video from a template

This walkthrough uses a built-in template. A letter grid sits over your footage, and on each cut a
hand-drawn outline circles one hidden word. All the outlines stay on screen.

<table>
<tr>
<td align="center"><img src="public/recipe-previews/word-search/grid.jpg" width="160" alt="Letter grid over the first shot"><br><sub>1 · Letter grid</sub></td>
<td align="center"><img src="public/recipe-previews/word-search/first-word.jpg" width="160" alt="First word circled"><br><sub>2 · First word circled</sub></td>
<td align="center"><img src="public/recipe-previews/word-search/all-words.jpg" width="160" alt="Every word circled"><br><sub>3 · Every word circled</sub></td>
</tr>
</table>

**You'll need:** two to four short **vertical (9:16)** shots, about 1–2 seconds each, and one word
per shot (A–Z, up to 12 letters). The example uses four Pexels clips and the words `FOG`, `HILL`,
`DUSK` and `TRAIL`.

### 1. Create a project with your shots

In the editor, open **Projects → New project**. Drag your shots into the **Library** and onto the
timeline in the order you want them. You can also ask your agent to do this:

```text
Create a new DreamCut project called "word search" and import ~/Movies/hike/fog.mov,
hill.mov, dusk.mov and trail.mov onto the timeline in that order.
```

Imports are copied into the project folder by default, and your originals are never modified.

### 2. Find the template

Open the project, then select the **Templates** tab at the top of the editor's left rail. Search for
**Word Search Trace** and open its card. The card shows a playable example, what you need to supply,
and a ready-made request for your agent.

### 3. Send the request to your agent

Click **Copy request** on the card, paste it into Claude Code or Codex, and add your words:

```text
Use the Word Search Trace template with my footage in the "word search" project.
Words, one per shot: FOG, HILL, DUSK, TRAIL. Run TRAIL diagonally.
```

The agent reads the template's construction brief and its owning skill
([`motion-graphics`](.agents/skills/motion-graphics/SKILL.md)). It builds the letter grid and outlines
as editable layers timed to your cuts, then submits the result as a proposal. It does not change your
timeline directly.

### 4. Review, tune and apply

Open the **Proposals** drawer with the **P** button in the top bar. The proposal plays in the preview exactly as it would
be applied. Use its controls to adjust the result: the words and their directions, how fast each
outline draws, letter size and colors. Further dials are under **Advanced adjustments**.

When it looks right, click **Apply**. If it's not what you wanted, click **Reject** or tell the agent
what to change, and it will send a revised proposal. **Undo** works after applying, like any other edit.

### 5. Export

Click **Export** in the top bar to render an MP4 with Chrome and FFmpeg. Finished exports are also
copied to `~/Movies/DreamCut` (`~/Videos/DreamCut` on Windows and Linux).

**Other templates follow the same flow:** find a card, supply its inputs, copy the request and review
the proposal. See the [effect catalog](#effect-catalog) below, or
[recreate an effect from a reference video](.agents/skills/recreate-effect/SKILL.md) and contribute it.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `pnpm install` fails building `better-sqlite3` | Use Node 22 or 24 (`nvm use`, the repo has an `.nvmrc`). On macOS, `xcode-select --install` provides the build tools |
| `FFmpeg and ffprobe must both be available` | Install FFmpeg (see Requirements) and open a new terminal |
| `Chrome is required for exports` | `pnpm exec playwright-core install chrome` |
| Port 3123 is already in use | Another DreamCut or app is running there; stop it, or start this one with `pnpm exec next dev -H 127.0.0.1 -p 3133` |
| The agent doesn't see DreamCut's tools | Start the agent from the repository folder, approve the `timeline-editor` MCP server when asked, and keep `pnpm dev` running |
| "Voice enhancement is not installed" | `pnpm setup:voice` |

Still stuck? See [SUPPORT.md](SUPPORT.md).

## Features

| Area | What you get |
| --- | --- |
| **Editing** | Multi-lane timeline, trims, splits, transitions, keyframes, masks and cutouts, captions, motion graphics, music and sound effects |
| **Agent workflow** | Proposals with previews, sliders, options and atomic Apply/Undo. Auditions compare alternative takes or treatments side by side |
| **Assembly** | Build a first cut from a script and footage, including spoken-take selection with word-level alignment for talking-head video |
| **Templates** | Gallery of reusable effects, your own saved templates, and community templates |
| **Memory** | Records your direction and outcomes, suggests style preferences, and keeps a readable `STYLE.md` you can edit |
| **Library** | Per-project media plus a personal library shared across projects, with search over analyzed footage |
| **Rendering** | Browser GPU (CanvasKit) preview and export, a standard browser path and an optional Rust native decoder |
| **Generation (optional)** | Image and video models, staged as a draft you review before anything is generated |

## Effect catalog

<!-- BEGIN EFFECT INDEX -->
Browse every shared effect and reference study below. Each link opens its demo, input brief, build sequence and copyable agent request. Reference-only entries are ideas to assess, not verified implementations.

| Effect | What you supply | Home | Evidence |
| --- | --- | --- | --- |
| [Shopping basket fills as items are picked](docs/effects/recipes.md#fx-12) | Shopping footage; Basket and products | Properties → Templates | Reference example |
| [Floating translucent project screen](docs/effects/recipes.md#fx-14) | Laptop footage; Screen content | Properties → Templates | Reference example |
| [Gesture-matched outfit change](docs/effects/recipes.md#fx-06) | Two outfit takes | Properties → Templates | Reference example |
| [Foot-to-camera location change](docs/effects/recipes.md#fx-07) | Two location takes | Properties → Templates | Reference example |
| [Objects float in → scene switches → white blips](docs/effects/recipes.md#fx-08) | Starting scene; Destination scene | Properties → Templates | Partial recreation · read limitations |
| [Drinks enter before their background](docs/effects/recipes.md#fx-11) | Starting and drinks shots | Properties → Templates | Reference example |
| [Restaurant builds over the shot, then becomes the scene](docs/effects/recipes.md#fx-16) | Walking and restaurant shots | Properties → Templates | Reference example |
| [Laptop-edge scene wipe](docs/effects/recipes.md#fx-15) | Closing laptop shot; Destination shot | Properties → Templates | Reference example |
| [Paper unfolds across cuts, then becomes a handheld title](docs/effects/recipes.md#fx-02) | Title artwork and scenes; Paper and handoff footage | Properties → Templates | Reference example |
| [Persistent time and activity labels](docs/effects/recipes.md#fx-05) | Footage and chapter labels | Properties → Templates | Reference example |
| [Lunch before/after match cut](docs/effects/recipes.md#fx-10) | Before and after lunch | Properties → Templates | Reference example |
| [Dinner before/after match cut](docs/effects/recipes.md#fx-19) | Before and after dinner | Properties → Templates | Reference example |
| [Remove-to-show title reveal — provisional](docs/effects/recipes.md#fx-20) | Background and title | Properties → Templates | Reference example |
| [White paper outline](docs/effects/recipes.md#fx-scratchpad) | Artwork; Border preference | Properties → Templates | Partial recreation · read limitations |
| [Inverse Video captions — Blue steel option](docs/effects/recipes.md#fx-inverse-captions) | Background and words | Properties → Templates | Reference example |
| [Film Burn](docs/effects/recipes.md#fx-film-burn) | Two shots; Optional burn texture | Properties → transition join | Partial recreation · read limitations |
| [Mask Glitch](docs/effects/recipes.md#fx-mask-glitch) | Ordered shots | Properties → Templates | Partial recreation · read limitations |
| [Camera Flash](docs/effects/recipes.md#fx-camera-flash) | Two shots and cut point | Properties → transition join | Partial recreation · read limitations |
| [Blackout](docs/effects/recipes.md#fx-blackout) | Cover and uncover takes | Properties → transition join | Partial recreation · read limitations |
| [Whip Pan](docs/effects/recipes.md#fx-whip-pan) | Matching camera turns | Properties → transition join | Partial recreation · read limitations |
| [Negative Pop](docs/effects/recipes.md#fx-negative-pop) | Subject and background | Properties → Templates | Reference example |
| [Scene Portal](docs/effects/recipes.md#fx-scene-portal) | Host footage; Insert and destination | Properties → Templates | Reference example |
| [Speed Entrance & Exit](docs/effects/recipes.md#fx-speed-entrance-exit) | Performance footage; Matching empty background | Properties → Templates | Implemented template · built with your agent |
| [Mask Glitch · Glow](docs/effects/recipes.md#fx-mask-glitch-glow) | Ordered pose or performance takes; Matching empty background | Properties → Templates | Implemented template · built with your agent |
| [Moving Grid Matte](docs/effects/recipes.md#fx-moving-grid-matte) | Moving subject footage; Background | Properties → Templates | Implemented template · built with your agent |
| [Word Search Trace](docs/effects/recipes.md#fx-word-search-trace) | Two to four short shots; One word per shot | Properties → Templates | Implemented template · built with your agent |
| [Explainer Sequence](docs/effects/recipes.md#fx-motion-explainer) | Your title and key point; One number; Three steps and a closing line | Properties → Templates | Implemented template · built with your agent |
| [Animated Chart](docs/effects/recipes.md#fx-motion-chart) | A title; Two to six labels and values | Properties → Templates | Implemented template · built with your agent |
| [Plan Comparison](docs/effects/recipes.md#fx-motion-plans) | Plan names and prices; Up to five features | Properties → Templates | Implemented template · built with your agent |
| [Walkthrough Steps](docs/effects/recipes.md#fx-motion-walkthrough) | Two to four steps; A screenshot per step (optional) | Properties → Templates | Implemented template · built with your agent |
| [Kinetic Type](docs/effects/recipes.md#fx-motion-kinetic) | A short phrase; The beat or word times (optional) | Properties → Templates | Implemented template · built with your agent |
| [Masking Hook](docs/effects/recipes.md#fx-masking-hook) | One shot of a person | Properties → Templates | Implemented template · built with your agent |
| [Clone Flash](docs/effects/recipes.md#fx-clone-flash) | A still shot of a person | Properties → Templates | Implemented template · built with your agent |
| [Silhouette Window](docs/effects/recipes.md#fx-silhouette-window) | A shot of a person; Several short fill clips | Properties → Templates | Implemented template · built with your agent |
| [Lyric Pop](docs/effects/recipes.md#fx-lyric-pop) | A shot; The word | Properties → Templates | Implemented template · built with your agent |
| [Cross into Negative](docs/effects/recipes.md#fx-cross-negative) | Two shots | Properties → Templates | Implemented template · built with your agent |
| [Layered Paper Cutout](docs/effects/recipes.md#layered-paper-cutout) | Portrait; Music and hits | Properties → Templates | Demonstration · not catalog-verified |
| [Talking-Head Background Removal](docs/effects/recipes.md#talking-head-cutout) | Original recording | Properties → Templates | Demo not available yet |

Want to add one? Start with the [effect page template](docs/effects/creator-template.md) and [PR contribution guide](CONTRIBUTING.md#contributing-an-effect).
<!-- END EFFECT INDEX -->

## Data sharing

DreamCut gets better at editing by learning from real edits. **Sharing is on by default and you can
turn it off at any time.**

**What is shared:** after you finish an export, DreamCut sends that project's *editing history*: the
directions you gave the agent (in your words), the proposals it made and its reasons, which ones you
applied, rejected or tuned, and a summary of the timeline changes. We use this to improve how the
agent edits and what it suggests.

**What is never shared:** your media. That includes video, audio, images, generated assets, exports,
thumbnails and proxies. File paths, source URLs and caption transcripts are also never sent.

- **Turn it off:** **User → Settings → Learning and privacy →** uncheck **Share editing history to
  improve DreamCut (never media)**, or set `DREAMCUT_CLOUD_INGEST_URL=off`.
- **Identity:** packets carry a random install ID that isn't derived from your machine or name. If
  you sign in to a DreamCut account, packets are linked to that account.
- **No impact on your work:** a failed upload never affects the export or anything stored locally.

Directions you type can contain personal details, so leave sharing off for projects you'd rather keep
private. Details: [export retrospective contract](docs/standards/export-retrospective-contract.md#cloud-export-sharing).

## Optional cloud features

Editing, preview, export and the agent tools need no account. An **DreamCut account** adds image and
video generation (models such as Kling, Veo and Seedance, paid with credits), shared community
templates, and style sync across machines. The account service currently runs at
[dreamcut.io](https://dreamcut.io).

Generation is never automatic. The agent stages a draft in **Library → Generate** with the model,
prompt, references and price in credits, and nothing is generated until you click **Generate**.

## For developers

### How it fits together

```text
 Claude Code / Codex ──MCP──▶ mcp/server.mjs ──HTTP──▶ Next.js editor (127.0.0.1:3123)
                                                        │
                                   proposals ◀──────────┤──▶ projects/<id>/timeline.json
                                   (you Apply/Reject)   │    media, history, renders
                                                        └──▶ frame runtime → preview + export
```

- **Projects are folders.** `timeline.json` is the editing source of truth, alongside `metadata.json`,
  media, history snapshots and export receipts. `projects/` is git-ignored, and
  `TIMELINE_PROJECTS_DIR` relocates it.
- **One editing surface.** Coding agents and the in-editor chat use the same MCP tools, and
  `pnpm check:agent-parity` keeps them aligned.
- **Agents propose and people approve.** Direct timeline writes are only allowed inside a fresh
  agent-built assembly, and only until it's handed to you.
- **Skills are the know-how.** Editing craft lives in [`.agents/skills/`](.agents/skills/README.md):
  cut pacing, captions, motion graphics, sound design, effect recreation and more.

Start with the [architecture overview](docs/architecture/README.md), then the
[standards index](docs/standards/README.md). [`AGENTS.md`](AGENTS.md) is the operating guide every
agent reads.

### Repository layout

```text
src/            Next.js editor, local store, frame runtime, renderers
mcp/            MCP server and tool catalog for agents
.agents/skills/ editing skills (the agent's craft knowledge)
docs/           architecture, standards, effect catalog, research
native/         optional Rust preview decoder
desktop/        Electron desktop shell (in progress)
packaging/      npm launcher and Claude Code / Codex plugin
scripts/        setup, verification and evaluation tooling
testing/        redistributable fixtures
```

### Useful commands

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm check:pr
```

`pnpm check:pr` runs the full pre-PR gate: tool schemas, catalog privacy, typecheck, the effect
catalog and tests. Other entry points include `pnpm review <id>` (stable review server on port 3124),
`pnpm project-health <id>`, `pnpm frame-state <id>` (appearance evidence) and `pnpm setup:rust` (the
optional native decoder). See `package.json` for the rest.

### Configuration

Environment variables use the `DREAMCUT_` prefix; see [`.env.example`](.env.example). Most settings
also accept the older `OPENEDIT_*` names.

## Grow the template library

Every template makes every creator's agent more capable. Three ways to add one:

- **From the app:** save an edit as a template, export the project, then **Templates → Yours →
  Share with DreamCut**. No code needed.
- **As code:** add a motion-graphics template (HTML plus a controls file) under
  [`.agents/skills/motion-graphics/templates/`](.agents/skills/motion-graphics/templates/).
- **From a reference:** ask your agent to *"recreate this effect as a DreamCut template"* and open a
  pull request with its demo and evidence.

Step-by-step: [Add a template](CONTRIBUTING.md#add-a-template). Have an idea but no time?
[Suggest a template](https://github.com/lukemun/dreamcut/issues/new?template=template_idea.md).

## Contributing

Contributions are welcome, especially new **templates and effects**, editing skills and editor
improvements. Read the [contribution guide](CONTRIBUTING.md), including
[adding a template](CONTRIBUTING.md#add-a-template). Only include media you have the
right to share. Please follow the [code of conduct](CODE_OF_CONDUCT.md) and report security issues
as described in [SECURITY.md](SECURITY.md).

## License

DreamCut is open source under the [Apache License 2.0](LICENSE). See the
[licensing guide](docs/licensing.md). Third-party dependencies and bundled media keep their own
licenses ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). The DreamCut name and logo are covered
by the [trademark policy](TRADEMARKS.md).
