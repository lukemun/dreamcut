<p align="center">
  <img src="docs/assets/dreamcut-logo.png" alt="DreamCut logo" width="120" />
</p>

<h1 align="center">DreamCut</h1>

<p align="center"><b>The video editor where AI agents propose edits and you approve them.</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/license-FSL--1.1--ALv2-blue" alt="FSL-1.1-ALv2">
  <img src="https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Codex-8A63D2" alt="Claude Code and Codex">
</p>

<p align="center"><img src="docs/assets/readme/hero.gif" alt="Asking Claude Code for a headline in three fonts: the proposal arrives in DreamCut, the fonts are previewed, the size and position are tuned, and pressing A applies it to the timeline" width="760" /></p>

Tell Claude Code or Codex what you want. DreamCut builds it on a real timeline, with clips, captions,
masks, motion graphics and sound, and hands it back as a **proposal**. You preview it, tune it with
sliders, then apply or reject it. The editor and your projects stay on your machine, and everything
stays editable by hand.

Make a product demo, explain an idea, or give your footage a new treatment. Start with a
request, preview the proposed edit, adjust it, and apply it when it looks right. Undo
remains available after applying.

**Start here:** [Install](#install) · [Your first edit](#your-first-edit)

DreamCut runs from this repository on **macOS** (Apple Silicon first; Windows is experimental). Claude Code
and Codex require their own account and access; their usage is separate from DreamCut.

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
</tr>
</table>

**[Browse all templates →](docs/effects/README.md#all-templates)** · Footage from [Pexels](https://www.pexels.com/license/)

## Install

Open Claude Code or Codex and say: *"Follow the instructions at dreamcut.io/install."* It runs the steps
below for you, asking first.

To do it yourself, you need [Git](https://git-scm.com/), [Node.js](https://nodejs.org/) **22 or 24** (not 23)
and [Google Chrome](https://www.google.com/chrome/) for exports. Install the DreamCut plugin, which connects
your agent to DreamCut. Claude Code:

```bash
claude plugin marketplace add lukemun/dreamcut-plugins
claude plugin install dreamcut@dreamcut
```

Codex: `codex plugin marketplace add lukemun/dreamcut-plugins`, then `codex plugin add dreamcut@dreamcut`.

Then install DreamCut itself:

```bash
git clone https://github.com/lukemun/dreamcut.git ~/DreamCut
cd ~/DreamCut
corepack enable
pnpm install
pnpm bootstrap
```

Start a new chat and say **"Open DreamCut."** The editor starts on your machine and opens in your agent's
browser; the first start compiles it, which takes a minute or two. The first time, your agent asks where
to keep your projects.

Captions, "Enhance voice" and cutout templates use extra programs and models (FFmpeg, Whisper, Montreal
Forced Aligner, DeepFilterNet, SAM; about 4 GB, once). Install them with
`node bin/dreamcut.mjs setup`, and check what's ready with `node bin/dreamcut.mjs doctor`.

**Updates:** when your agent opens DreamCut it checks GitHub, tells you when there is a newer version and
updates with your OK. You can also run `node bin/dreamcut.mjs update` in `~/DreamCut`, then start a new chat.
It only fast-forwards: a copy with your own changes or commits is left alone (update that one with git
yourself). Your projects live in the Library folder you chose, outside the repository, so updates never
touch them. You and your agent can
read and change the code in your copy.

**On Windows** (experimental), install the prerequisites with
`winget install Git.Git OpenJS.NodeJS.LTS Google.Chrome`, then run the same steps in PowerShell with
`$HOME\DreamCut` in place of `~/DreamCut`.

## Your first edit

1. In the editor, create a project and drop in a few short clips.
2. Open **Templates** and click one to select it (try **Word Search Trace**).
3. In your connected Claude Code or Codex chat, say where to use it:
   *"Use this on my clips, words FOG, HILL, DUSK, TRAIL"*.
4. Open **Proposals**, tune the sliders and click **Apply**. Undo works as usual.

## Your files

DreamCut edits locally. We never collect your footage for product improvement.

### Help us improve

While you're signed in to DreamCut, editing history, suggested edits, feedback and tool usage are
uploaded to your account to improve the product, even if you never export. Signed out, nothing is uploaded. Tool usage is daily counts of the DreamCut tools your
agent called and their failures, plus a short note when your agent had to work around a missing tool;
it carries no tool arguments or file paths. Sharing is on by default; turn it off in
**User → Settings → Privacy**, or set `DREAMCUT_CLOUD_INGEST_URL=off`.
No video, audio, images, frames, thumbnails or proxies are included.

Separately, your agent (such as Claude Code or Codex) may send content it works on,
including frames, to its provider under its own terms. Cloud generation also sends
reference files you explicitly provide for it.

## More

- [Help and troubleshooting](.github/SUPPORT.md) · [Changelog](CHANGELOG.md) · [Security](.github/SECURITY.md)

Fair source under the [Functional Source License 1.1, ALv2 Future License](LICENSE): use, change and
share it for anything except a competing commercial product, and each version becomes Apache 2.0 two
years after its release ([third-party notices](docs/legal/THIRD_PARTY_NOTICES.md),
[trademark policy](docs/legal/TRADEMARKS.md)). Optional cloud features (generation credits, shared
templates) use a free DreamCut account at [dreamcut.io](https://dreamcut.io).
