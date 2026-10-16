<p align="center">
  <img src="docs/assets/open-edit-logo.png" alt="DreamCut logo" width="120" />
</p>

<h1 align="center">DreamCut</h1>

<p align="center"><b>The open-source video editor where AI agents propose edits and you approve them.</b></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://www.npmjs.com/package/dreamcut"><img src="https://img.shields.io/npm/v/dreamcut" alt="npm"></a>
  <img src="https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Codex-8A63D2" alt="Claude Code and Codex">
</p>

<p align="center"><img src="docs/assets/readme/editor.png" alt="The DreamCut editor: templates, preview and timeline" width="900" /></p>

Tell Claude Code or Codex what you want. DreamCut builds it on a real timeline, with clips, captions,
masks, motion graphics and sound, and hands it back as a **proposal**. You preview it, tune it with
sliders, then apply or reject it. Everything runs locally and stays editable by hand.

## Templates

Effects your agent rebuilds with your own footage.

<table>
<tr>
<td><img src="docs/assets/readme/clone-flash.gif" width="260" alt="Clone Flash"><br><b>Clone Flash</b></td>
<td><img src="docs/assets/readme/moving-grid-matte.gif" width="260" alt="Moving Grid Matte"><br><b>Moving Grid Matte</b></td>
<td><img src="docs/assets/readme/silhouette-window.gif" width="260" alt="Silhouette Window"><br><b>Silhouette Window</b></td>
</tr>
<tr>
<td><img src="docs/assets/readme/cross-negative.gif" width="260" alt="Cross into Negative"><br><b>Cross into Negative</b></td>
<td><img src="docs/assets/readme/mask-glitch-glow.gif" width="260" alt="Mask Glitch Glow"><br><b>Mask Glitch · Glow</b></td>
<td><img src="docs/assets/readme/motion-kinetic.gif" width="260" alt="Kinetic Type"><br><b>Kinetic Type</b></td>
</tr>
</table>

**[Browse all templates →](docs/effects/README.md#all-templates)** · Footage from [Pexels](https://www.pexels.com/license/)

## Install

**With your agent** (Apple Silicon Mac; needs [Node.js](https://nodejs.org/) and `brew install ffmpeg`):

```bash
claude mcp add dreamcut -- npx -y dreamcut mcp
```

For Codex: `codex mcp add dreamcut -- npx -y dreamcut mcp`. Then tell your agent **"Open DreamCut."**
The first start downloads the editor (about 300 MB).

**From source** (Node 22 or 24, pnpm, FFmpeg, Chrome):

```bash
git clone https://github.com/lukemun/dreamcut.git && cd dreamcut && pnpm install && pnpm bootstrap && pnpm dev
```

Open http://127.0.0.1:3123, then run `claude` or `codex` in the repo folder; `.mcp.json` connects the agent.

## Your first edit

1. Create a project and drop in a few short clips.
2. Open **Templates**, pick one (try **Word Search Trace**) and click **Copy request**.
3. Paste it into your agent with your details: *"…with my clips, words FOG, HILL, DUSK, TRAIL"*.
4. Open **Proposals**, tune the sliders and click **Apply**. Undo works as usual.

## Data sharing

After an export, DreamCut shares that project's **editing history** (your directions, the agent's
proposals and what you applied or tuned) to improve the agent. **Never your media**: no video, audio,
images, file paths or transcripts. It's on by default; turn it off in **User → Settings**, or set
`DREAMCUT_CLOUD_INGEST_URL=off`.

## More

- [Contributing](CONTRIBUTING.md): set up, add a template, open a PR.
- [Architecture](docs/architecture/README.md) and [agent guide](AGENTS.md): how editing, proposals and rendering fit together.
- [Help and troubleshooting](.github/SUPPORT.md) · [Changelog](CHANGELOG.md) · [Security](.github/SECURITY.md)

Apache-2.0 ([license](LICENSE), [third-party notices](docs/legal/THIRD_PARTY_NOTICES.md),
[trademark policy](docs/legal/TRADEMARKS.md)). Optional cloud features (generation credits, shared
templates) use a free DreamCut account at [dreamcut.io](https://dreamcut.io).
