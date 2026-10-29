# Getting help

- **Questions, bugs and ideas:** contact us through [dreamcut.io](https://dreamcut.io). Share only media you can
  redistribute.
- **Security issues:** follow [SECURITY.md](SECURITY.md).

## Troubleshooting

Run `pnpm setup:check` first; it reports missing prerequisites.

| Problem | Fix |
| --- | --- |
| `pnpm install` fails building `better-sqlite3` | Use Node 22 or 24 (`nvm use` reads `.nvmrc`). On macOS, `xcode-select --install` adds the build tools |
| `FFmpeg and ffprobe must both be available` | Install FFmpeg (`brew install ffmpeg` / `winget install Gyan.FFmpeg`) and open a new terminal, or without Homebrew run `node bin/dreamcut.mjs setup` (about 4 GB, with the caption, voice and cutout programs) |
| `node: command not found` after `brew install node@24` | Homebrew keeps that version off PATH: `brew link --overwrite --force node@24` |
| `corepack enable` fails with a permission error | Skip it and use `corepack pnpm install` and `corepack pnpm bootstrap` |
| `Chrome is required for exports` | `pnpm exec playwright-core install chrome` |
| Port 3123 is already in use | Stop the other app, or run `pnpm exec next dev -H 127.0.0.1 -p 3133` |
| The agent doesn't see DreamCut's tools | Check the DreamCut plugin is installed (`claude plugin list`), then start a new chat. Working in the repository folder instead: approve its `timeline-editor` MCP server and keep `pnpm editor` running |
| DreamCut's tools appear twice | Remove the older connection: `claude mcp remove dreamcut -s user` (Codex: `codex mcp remove dreamcut`) |
| Captions, "Enhance voice" or cutouts say a program or model is missing | `node bin/dreamcut.mjs setup` installs them all (about 4 GB, once); `node bin/dreamcut.mjs doctor` shows what is ready |
| "Voice enhancement is not installed" | `pnpm setup:voice` (optional, about 400 MB) |
| Videos aren't found by `video_search` | Ask your agent to describe your footage (it looks at the frames itself) |
