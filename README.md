<p align="center">
  <img src="docs/assets/dreamcut-logo.png" alt="DreamCut logo" width="120" />
</p>

<h1 align="center">DreamCut</h1>

<p align="center"><b>Invent the next trend in video.</b><br>The local agentic video editor behind an open catalog of edits.</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0">
  <img src="https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Codex-8A63D2" alt="Claude Code and Codex">
</p>

<p align="center"><img src="docs/assets/readme/hero.gif" alt="Asking Claude Code for a headline in three fonts: the proposal arrives in DreamCut, the fonts are previewed, the size and position are tuned, and pressing A applies it to the timeline" width="760" /></p>

**The mission.** We're building an open catalog of edits and effects. A creator invents an edit and shows
how they made it, and it becomes a skill in the catalog with their name on it. A brand or small business
picks it and gets it on their own footage in one click. The aim is for the creators whose effects people
use to be paid for them. Creator payouts aren't live yet; that's where we're headed.
[Read the mission →](https://dreamcut.io/mission) · [dreamcut.io](https://dreamcut.io)

### From a creator's tutorial to one request

Marvin Appiah Korang ([futurist__](https://www.instagram.com/reel/DXW0u-zjLE7/)) showed how he makes
speed hops by hand. DreamCut turned his method into a template, so anyone can put it on their own footage.

<table>
<tr>
<td width="50%" align="center" valign="top"><img src="docs/assets/readme/speed-hops-by-hand.gif" width="270" alt="Marvin Appiah Korang's speed hops tutorial: the finished effect in a stairwell, then the steps in an editing app: cutting the clip, cutting himself out, setting keyframes and adding motion"><br><b>By hand</b> · <a href="https://www.instagram.com/reel/DXW0u-zjLE7/">Marvin's tutorial</a><br>Film the empty background, cut at every jump, cut yourself out, keyframe each hop, add motion blur. Repeat for every hop.</td>
<td width="50%" align="center" valign="top"><img src="docs/assets/readme/speed-hops-in-dreamcut.gif" width="270" alt="The same effect in DreamCut: the finished speed hops in a park, then selecting Speed hops, marking the stops, asking Claude to apply it, tuning the proposal card's sliders and applying it to the timeline"><br><b>In DreamCut</b> · one take, a few marks, one request<br><i>"Apply the speed effect to this clip and use all of my marks as the holding points."</i> Tune the card's sliders, then Apply.</td>
</tr>
</table>

**This repository is the editor**, the part that does the editing. Tell Claude Code or Codex what you want:
*"cut the long pauses"*, *"put the headline behind me"*, *"give it a warm film look"*. DreamCut builds it on
a real timeline, with clips, captions, masks, motion graphics and sound, and hands it back as a
**proposal**. You preview it, tune it with sliders, then apply or reject it. Nothing lands without your OK,
Undo works after applying, and everything stays editable by hand. The editor and your projects stay on your
machine. [What is vibe editing?](https://dreamcut.io/vibe-editing)

**Start here:** [Install](#install) · [Your first edit](#your-first-edit) · [Contribute an effect or edit](#contribute-an-effect-or-edit)

DreamCut runs from this repository on **macOS** (Apple Silicon first; Windows is experimental). You drive it
from Claude Code or Codex, which need a paid plan from Anthropic (Claude Pro or above) or OpenAI (a ChatGPT
plan that includes Codex); that usage is billed by them, separately from DreamCut.

## Templates

Effects your agent rebuilds with your own footage.

<table>
<tr>
<td rowspan="3" align="center"><img src="docs/assets/readme/flash-effect.gif" width="270" alt="Flash Effect: poses flash in white one after another down a path toward the camera"><br><b>Flash Effect</b> · after futurist__</td>
<td align="center"><img src="docs/assets/readme/clone-flash.gif" width="270" alt="Clone Flash"><br><b>Clone Flash</b></td>
</tr>
<tr><td align="center"><img src="docs/assets/readme/mask-glitch-glow.gif" width="270" alt="Mask Glitch Glow"><br><b>Mask Glitch · Glow</b></td></tr>
<tr><td align="center"><img src="docs/assets/readme/silhouette-window.gif" width="270" alt="Silhouette Window"><br><b>Silhouette Window</b></td>
</tr>
</table>

**[Browse all templates →](docs/effects/README.md#all-templates)** · Speed hops and Flash Effect footage: the
DreamCut maintainer. Other template footage from [Pexels](https://www.pexels.com/license/).

## Install

Open Claude Code or Codex and say: *"Follow the instructions at dreamcut.io/install."* Your agent checks what
your Mac is missing, shows you each command and runs it with your OK. On a new Mac, two steps need you:
a macOS window offering Apple's command line developer tools (click **Install**; they include Git), and the
Node.js installer, which asks for your Mac password.

### Install it yourself

You need:

- **Git.** On a Mac, run `xcode-select --install` and click **Install**.
- **[Node.js](https://nodejs.org/) 22 or 24** (not 23). On a Mac, open the `.pkg` installer from
  [nodejs.org/dist/latest-v24.x](https://nodejs.org/dist/latest-v24.x/).
- **[Google Chrome](https://www.google.com/chrome/)**, for exports.
- **FFmpeg.** With [Homebrew](https://brew.sh/), `brew install ffmpeg`. Without it, DreamCut's feature setup
  below installs one.

With Homebrew you can install all of them at once: `brew install git node@24 ffmpeg`, then
`brew link --overwrite --force node@24` so the `node` command finds Node 24.

Install the DreamCut plugin, which connects your agent to DreamCut. Claude Code:

```bash
claude plugin marketplace add lukemun/dreamcut-plugins
claude plugin install dreamcut@dreamcut
```

Codex: `codex plugin marketplace add lukemun/dreamcut-plugins`, then `codex plugin add dreamcut@dreamcut`.

Then install DreamCut itself. The plugin runs the copy at `~/DreamCut` (`$HOME\DreamCut` on Windows):

```bash
git clone https://github.com/lukemun/dreamcut.git ~/DreamCut
cd ~/DreamCut
corepack pnpm install
corepack pnpm bootstrap
```

`corepack pnpm` runs the pnpm version DreamCut pins, which comes with Node. `pnpm bootstrap` checks
everything DreamCut uses and stops if FFmpeg or Chrome is missing.

**Captions, "Enhance voice" and cutout templates** need extra programs and models (Whisper, Montreal Forced
Aligner, DeepFilterNet, SAM, and an FFmpeg for Macs without one; about 4 GB, once). A git install doesn't
download them by itself. Install them with `node bin/dreamcut.mjs setup` in `~/DreamCut`, and check what's
ready with `node bin/dreamcut.mjs doctor`.

Start a new chat and say **"Open DreamCut."** The editor starts on your machine and opens in your agent's
browser. The first start compiles the editor, which can take a few minutes. The first time, your agent asks
where to keep your projects.

If DreamCut's tools show up twice, you also connected it the older way; remove that connection with
`claude mcp remove dreamcut -s user` (Codex: `codex mcp remove dreamcut`). To connect a copy kept somewhere
other than `~/DreamCut` without the plugin: `claude mcp add dreamcut -s user -- node <copy>/bin/dreamcut.mjs mcp`.

**Updates:** when your agent opens DreamCut it checks GitHub, tells you when there is a newer version and
updates with your OK. You can also run `node bin/dreamcut.mjs update` in `~/DreamCut`, then start a new chat.
It only fast-forwards: a copy with your own changes or commits is left alone (update that one with git
yourself). Your projects live in the Library folder you chose, outside the repository, so updates never
touch them. You and your agent can read and change the code in your copy.

**On Windows** (experimental), install the prerequisites with
`winget install Git.Git OpenJS.NodeJS.LTS Google.Chrome Gyan.FFmpeg`, then run the same steps in PowerShell
with `$HOME\DreamCut` in place of `~/DreamCut`.

## Your first edit

1. In the editor, create a project and drop in a few short clips.
2. Open **Templates** and click one to select it (try **Word Search Trace**).
3. In your connected Claude Code or Codex chat, say where to use it:
   *"Use this on my clips, words FOG, HILL, DUSK, TRAIL"*.
4. Open **Proposals**, tune the sliders and click **Apply**. Undo works as usual.

## Contribute an effect or edit

A transition, a caption style, a new way to tell a story: if you made it, it belongs in the catalog. Pick
one route:

1. **Share it from the app.** Ask your agent to *"save this as a template"* and export the project, then
   open the template under **Templates** and choose **Share with DreamCut** (needs a free DreamCut account).
2. **Show us how you did it.** Send a video of you making it and the finished edit (add the raw footage if
   you have it) through the [form on the mission page](https://dreamcut.io/mission#send). No GitHub needed;
   we turn it into a template with your name on it.
3. **Build it yourself.** Ask your agent to *"recreate this effect as a DreamCut template"*, then open a pull
   request with a short demo. [CONTRIBUTING.md](CONTRIBUTING.md#contributing-an-effect) has the details.

Use only media you have the right to share.

## Your files

The editor runs on your computer, and your projects and footage stay there. DreamCut never uploads your
video, audio or images, except files you choose to send: references for cloud generation, or a template
you share with DreamCut.

### Help us improve

While you're signed in to DreamCut, editing history, suggested edits, feedback and tool usage are
uploaded to your account to improve the product, even if you never export. Signed out, nothing is uploaded, except one
anonymous install count the DreamCut plugin sends the first time DreamCut's tools start (the agent, the operating system and
the plugin version; no ID, path or email; skipped with `DO_NOT_TRACK=1` or `DREAMCUT_INSTALL_PING_URL=off`). Tool usage is daily counts of the DreamCut tools your
agent called and their failures, plus a short note when your agent had to work around a missing tool;
it carries no tool arguments or file paths. Sharing is on by default; turn it off in
**User → Settings → Privacy**, or set `DREAMCUT_CLOUD_INGEST_URL=off`.
No video, audio, images, frames, thumbnails or proxies are included.

Separately, your agent (such as Claude Code or Codex) may send content it works on,
including frames, to its provider under its own terms. Cloud generation also sends
reference files you explicitly provide for it.

## More

- [Help and troubleshooting](.github/SUPPORT.md) · [Changelog](CHANGELOG.md) · [Security](.github/SECURITY.md)

Open source under the [Apache License 2.0](LICENSE): use, change and share it for anything, including
commercial work ([third-party notices](docs/legal/THIRD_PARTY_NOTICES.md),
[trademark policy](docs/legal/TRADEMARKS.md)). Optional cloud features (generation credits, shared
templates) use a free DreamCut account at [dreamcut.io](https://dreamcut.io).
