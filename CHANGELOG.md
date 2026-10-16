# Changelog

Notable changes to DreamCut. This project follows [Semantic Versioning](https://semver.org/)
once it reaches 1.0; until then, minor versions may include breaking changes.

## 0.2.0 — 2026-10-15

- First public open-source release under the Apache License 2.0.
- Data sharing setting reworded: **Share editing history to improve DreamCut (never media)**.
  It is on by default and can be turned off in User → Settings.
- Developer README with a template walkthrough.
- Install with your agent, no git needed: `claude mcp add dreamcut -- npx -y dreamcut mcp` (Apple Silicon Macs).
- Voice enhancement is optional (`pnpm setup:voice`); `pnpm bootstrap` no longer requires Python.
- Word Search Trace follows its Overlay length instead of stopping at 6.4 seconds.
