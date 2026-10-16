# Getting help

- **Questions and ideas:** [GitHub Discussions](https://github.com/lukemun/dreamcut/discussions).
- **Bugs:** a [bug report](https://github.com/lukemun/dreamcut/issues/new?template=bug_report.md) with the
  smallest steps that reproduce it. Use synthetic or redistributable media only.
- **Security issues:** follow [SECURITY.md](SECURITY.md), not a public issue.

## Troubleshooting

Run `pnpm setup:check` first; it reports missing prerequisites.

| Problem | Fix |
| --- | --- |
| `pnpm install` fails building `better-sqlite3` | Use Node 22 or 24 (`nvm use` reads `.nvmrc`). On macOS, `xcode-select --install` adds the build tools |
| `FFmpeg and ffprobe must both be available` | Install FFmpeg (`brew install ffmpeg` / `winget install Gyan.FFmpeg`) and open a new terminal |
| `Chrome is required for exports` | `pnpm exec playwright-core install chrome` |
| Port 3123 is already in use | Stop the other app, or run `pnpm exec next dev -H 127.0.0.1 -p 3133` |
| The agent doesn't see DreamCut's tools | Start the agent in the repo folder, approve the `timeline-editor` MCP server, keep `pnpm dev` running |
| "Voice enhancement is not installed" | `pnpm setup:voice` (optional, about 400 MB) |
| Installed with `npx`: "DreamCut is still downloading" | The download carries on in the background; ask your agent again in a few minutes, or run `npx dreamcut install` in a terminal to wait for it |
| Installed with `npx`: "DreamCut has no Library yet" | Tell your agent where to keep your projects (for example `~/Movies/DreamCut Library`) |
| Videos aren't found by `video_search` | Ask your agent to describe your footage (it looks at the frames itself) |
