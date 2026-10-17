# Changelog

Notable changes to DreamCut. This project follows [Semantic Versioning](https://semver.org/)
once it reaches 1.0; until then, minor versions may include breaking changes.

## 0.2.1 — 2026-10-16

First-run fixes for installing with your agent (`npx dreamcut mcp`):

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
- Editor drawers (Proposals, Library, Generate) are at most 440 px wide by default (640 px when dragged); the
  column behind an open drawer hides instead of showing cut off.
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
