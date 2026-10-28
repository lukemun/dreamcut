# Getting help

- **Questions, bugs and ideas:** contact us through [dreamcut.io](https://dreamcut.io). Share only media you can
  redistribute.
- **Security issues:** follow [SECURITY.md](SECURITY.md).

## Troubleshooting

Run `pnpm setup:check` first; it reports missing prerequisites.

| Problem | Fix |
| --- | --- |
| `pnpm install` fails building `better-sqlite3` | Use Node 22 or 24 (`nvm use` reads `.nvmrc`). On macOS, `xcode-select --install` adds the build tools |
| `FFmpeg and ffprobe must both be available` | Install FFmpeg (`brew install ffmpeg` / `winget install Gyan.FFmpeg`) and open a new terminal |
| `Chrome is required for exports` | `pnpm exec playwright-core install chrome` |
| Port 3123 is already in use | Stop the other app, or run `pnpm exec next dev -H 127.0.0.1 -p 3133` |
| The agent doesn't see DreamCut's tools | Start the agent in the repo folder, approve the `timeline-editor` MCP server, keep `pnpm editor` running |
| "Voice enhancement is not installed" | `pnpm setup:voice` (optional, about 400 MB) |
| Videos aren't found by `video_search` | Ask your agent to describe your footage (it looks at the frames itself) |
