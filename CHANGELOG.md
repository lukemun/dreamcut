# Changelog

Notable changes to DreamCut. This project follows [Semantic Versioning](https://semver.org/)
once it reaches 1.0; until then, minor versions may include breaking changes.

## Unreleased

- DreamCut is open source under the Apache License 2.0 (previously FSL-1.1-ALv2). See `docs/licensing.md`.
- Exports never carry a watermark, signed in or not.

## 0.3.0 — 2026-10-27

The first editor update since 0.2.0. It includes the 0.2.1 first-run fixes, which were never published.

Install and platforms:

- Windows: `npx dreamcut` installs and runs the editor on Windows (x64), including import, preview and export.
- Downloads come from dreamcut.io. `npx dreamcut --help` prints usage instead of opening the editor, and unknown
  options are refused.
- Under Claude Code or Codex, links open in the agent's built-in browser instead of the system browser.
- An agent that missed the tool list after first-run setup is told to start a new session or reconnect.
- Preview and export work without WebGPU (WebGL2, or software drawing on computers with no graphics card).

Editing:

- Templates: select a template card and ask your agent to use it; a full-height Templates drawer; Paper cutout and
  speed-hops-to-camera templates; template drafts, motion looks and community effects.
- Proposal cards fit on one line (Replay R, Original B, Apply A, Reject X); a card refused while a clip prepares
  validates again once it is ready; later cards can move drawn shapes and change their entrance or exit.
- Native shapes and sketch drawings, caption word styling, a general camera, relative placement and colour-grading parity.
- Storyboard planning canvas, and video references that play with in/out trims in the Generate drawer.
- Guided requests to recreate an effect from a reference video.
- Smoother playback: preview buffers once and then plays through, replays come from cache, and shapes and video draw
  faster. Preview matches export frame for frame.
- Preview plays directly by default; landscape canvases show title-safe guides.
- Library sounds and B-roll clips download from DreamCut Cloud the first time you play or add them.

Account and reports:

- Report a bug includes your signed-in email, and can attach the project's session evidence if you choose.
- Membership offer after sign-up; chat-first landing.

## 0.2.2 — 2026-10-24

Launcher only (npm): downloads move to dreamcut.io. The editor stayed at 0.2.0.

## 0.2.1 — 2026-10-16 (not published)

Held and never released; these changes ship in 0.3.0. First-run fixes for installing with your agent (`npx dreamcut mcp`):

- Templates are found by name, and DreamCut's skills ship with the editor. Any agent (Claude Code, Codex,
  Cursor) reads them with `capability_catalog get skill:<name>`, with no checkout needed.
- Motion graphics render in the installed editor; the HyperFrames check no longer fails on a missing file,
  and a failed check reports its cause.
- The first download carries on if the chat closes, a later chat picks it up, and partial downloads are cleaned up.
- Your agent asks where to keep projects before the first one, instead of failing with a file error.
- Review links point at the editor that is actually running, with a sign-in link for a new browser.
- Footage is described by the agent you're using (`media_describe`). Background analysis by another model is
  off unless you set `DREAMCUT_IMPORT_ANALYSIS=worker`.
- `editor_open` says it opened nothing; open the link it returns.
- Cutout templates can be set up on a fresh install: `cutout_setup` (or `pnpm setup:matting` /
  `npx dreamcut setup-matting`) installs subject tracing after you agree, about 1 GB once.
- `run_instrument` (frame-state, qc) works in the installed editor: the right projects folder, address and session.
- Surface tracking uses the same one-time install (it now includes OpenCV); an older install updates in place.
- Editor drawers (Proposals, Library, Generate) slide over the timeline at full height but are at most 440 px
  wide by default (640 px when dragged); the Library/Properties column behind an open drawer hides.
- Shorter README with an editor screenshot and a template gallery; the full template list moved to `docs/effects/`.
- Tidier repository root: catalogs under `catalogs/`, community files under `.github/`, legal notices under `docs/legal/`, matting and OpenTelemetry scripts under `scripts/`.
- Dependabot groups minor and patch updates into one weekly PR.

## 0.2.0 — 2026-10-15

- First public open-source release under the Apache License 2.0.
- Data sharing setting reworded: **Share editing history to improve DreamCut (never media)**.
  It is on by default and can be turned off in User → Settings.
- Developer README with a template walkthrough.
- Install with your agent, no git needed: `claude mcp add dreamcut -- npx -y dreamcut mcp` (Apple Silicon Macs).
- Voice enhancement is optional (`pnpm setup:voice`); `pnpm bootstrap` no longer requires Python.
- Word Search Trace follows its Overlay length instead of stopping at 6.4 seconds.
- Runtime downloads come from this repository's GitHub Releases.
