# Windows runtime and installs for non-developers

Plan, 2026-10-24. Platforms: Apple Silicon Macs and Windows (x64; Windows on Arm runs the x64 build).
Intel Macs are out of scope. Not implemented except where marked done.

Goal: someone who has never opened a terminal can add DreamCut to Claude Desktop or ChatGPT Desktop on
either platform, with nothing else installed. Commands remain only for Claude Code, Codex and `npx`.

## Where things stand

- **Runtime feed:** only `darwin-arm64` (dreamcut.io/downloads/runtime/latest.json, 0.2.0). Release 0.2.1 is held
  (`packaging/release-hold.json`). Windows editor code exists, but no Windows runtime has been built.
- **Claude Desktop:** the extension (`packaging/build-claude-extension.mjs`) works end to end on Apple Silicon.
  Claude installs the `.mcpb` itself, so no OS code signing is needed; unsigned, Claude's dialog notes the
  developer is unverified. Built locally only. The site link `/downloads/claude/dreamcut.mcpb` returns 404 until
  the file is uploaded to Blob `dreamcut/claude/`.
- **ChatGPT Desktop:** a `curl … | bash` command that writes a local plugin into `~/.codex/plugins`. ChatGPT has no
  open-a-file install flow, so a terminal-free install needs a double-click installer.
- **Done (local, unpublished):** the launcher runs the runtime on a pinned, checksum-verified Node 24.19.0
  (`packaging/launcher/lib/private-node.mjs`), downloaded once. This fixes `npx` installs on Node 22/23 (release
  builds' native modules need Node 24) and lets Windows and Mac share one Node story.
- **Media tools:** the runtime has no FFmpeg (it uses the creator's install). Imports, thumbnails, audio and export
  need it. Export also needs Google Chrome.

## 1. Claude Desktop download (Mac now, Windows with the runtime)

1. Publish a launcher version that contains `private-node.mjs` (npm), then build the extension from that
   published version (like `packaging/build-chatgpt-installer.mjs` does), not from the checkout.
2. Upload `dreamcut-<version>.mcpb` and a stable `dreamcut.mcpb` copy to Blob `dreamcut/claude/`; check the live
   link returns the file.
3. Turn on the site's Claude Desktop option (`CLAUDE_DESKTOP_READY` in `InstallOptions.tsx`).
4. Optional: sign with `mcpb sign` to drop Claude's "unverified" note.
5. Windows: add `win32` to the manifest's `platforms` once the Windows runtime is in the feed.

Page steps: **Download for Claude Desktop → open the file → click Install → start a new chat.**

## 2. ChatGPT Desktop without a terminal

The installer logic exists (`packaging/chatgpt-installer/setup.mjs`); it needs a double-click wrapper per platform:

- **Mac:** a `.pkg` whose post-install step runs the existing setup for the signed-in user. A downloaded `.pkg` must be
  signed with a *Developer ID Installer* certificate and notarized, or macOS blocks it. This Mac has no signing
  identity: it needs an Apple Developer Program membership (about $99 a year).
- **Windows:** a small installer (`.exe`, e.g. Inno Setup or NSIS) that runs the same setup with the pinned Windows
  Node. Unsigned installers trigger SmartScreen warnings; sign with Azure Trusted Signing or an OV certificate.
- Both keep the current guarantees: no admin rights, no system Node, only DreamCut's own folders, a checksum-pinned
  payload.

Page steps: **Download for ChatGPT Desktop → open it → restart ChatGPT → Plugins → install DreamCut.**
Until a signed installer exists, the curl command should not be offered to non-developers; it can sit under an
"Advanced" heading or be removed.

## 3. Windows runtime

Needs a real Windows machine: a Windows 11 PC, or a Windows 11 Arm VM with x64 Node for `win32-x64`. Native modules
(`better-sqlite3`, `sharp`, `esbuild`) must be built and loaded on Windows; a Mac cannot produce or test them.

1. Pin the build Node: `pnpm release` refuses unless it runs on Node v24.19.0 (both platforms), so every build's
   native modules match the launcher's private Node.
2. On Windows, at the release commit: `pnpm install`, `pnpm editor:build`, `node desktop/package.mjs --service-only`,
   `node packaging/build-web-runtime.mjs`, then `node packaging/verify-web-runtime.mjs`.
3. Media layer: publish FFmpeg/ffprobe as a third runtime layer (`dreamcut-media-<platform>-<id>`), built with
   `desktop/media-tools.mjs` (the pinned BtbN Windows build and the relinked Homebrew build on Mac) and put first on
   the service's `PATH`. Licence decision below.
4. Export browser: find Chrome, then Edge (Chromium) on Windows; if neither exists, download a pinned Chrome for
   Testing with `@puppeteer/browsers` (already in the base layer).
5. Manual pass on a clean Windows account (no Node, no FFmpeg): Claude Desktop extension and ChatGPT installer,
   import a clip, preview, export, apply an update.
6. When the owner releases: `pnpm release --add-platform` on the Windows machine attaches `win32-x64` to the same
   release and merges it into the feed.

## Owner decisions

- Release timing: 0.2.1 is held; nothing here bumps or un-holds a release.
- FFmpeg licence: GPL builds (x264 for H.264 export) carry source and notice obligations when DreamCut hosts them;
  LGPL builds avoid that but use the OS hardware encoder (VideoToolbox, Media Foundation). Needs legal review.
- Signing: Apple Developer ID (Mac `.pkg`, optional `.mcpb` signing) and a Windows signing service.

## Install page wording once Windows ships

"Add DreamCut to Claude Desktop, ChatGPT Desktop or your coding agent. For Mac (Apple Silicon) and Windows."
Each desktop option shows a download button and the three steps above; Claude Code, Codex and `npx` keep commands.
