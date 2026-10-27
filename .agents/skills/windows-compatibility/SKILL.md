---
name: windows-compatibility
description: Check that DreamCut's npx editor works on Windows, from a Mac, using a Windows VM driven over SSH. It installs, starts and serves an agent, and in Windows Chrome it creates a project, imports, places and plays clips, and exports. Use before a release, or after changing packaging, the launcher, the MCP server's startup/shutdown, native dependencies, child-process spawning, file paths, media preparation or export. Publishing a release is the separate releasing procedure.
---

# Check Windows compatibility

The outcome is evidence that a Windows user who runs `claude mcp add dreamcut -- npx -y dreamcut mcp`
(or the Codex equivalent) gets a working editor. Two checks give it, both against the `win32-x64`
download built from this checkout (uncommitted changes included):

- **Install check** (`packaging/verify-web-runtime.mjs`, 31 checks) acts as a new user's agent: it
  installs the packed launcher, downloads the runtime from a local stand-in for GitHub Releases, answers
  MCP, starts the production editor, signs a browser in, applies an update and shuts down.
- **Editor check** ([scripts/editor-check.mjs](scripts/editor-check.mjs)) acts as the person: in the
  VM's Chrome it opens the sign-in link, creates a project, imports two generated clips, adds them to the
  timeline, plays the preview, exports, and inspects the MP4 inside the VM.

No Claude Code, Codex or account sign-in is needed inside the VM. This tests the web editor that
`npx dreamcut` runs, not the Electron desktop preview. It never publishes. It is step 2 of
[releasing](../releasing/SKILL.md); publishing is [release-publish](../release-publish/SKILL.md)
(`pnpm release --add-platform` attaches a Windows download to an existing release) and happens only
when the owner asks.

Why the VM is configured as it is (x64 Node on Arm, SSH, scheduled tasks, DevTools forwarding, the
local download server) is in [references/vm-design.md](references/vm-design.md). Keep those reasons
when changing the setup.

## Inputs

- An Apple Silicon Mac with UTM and a Windows 11 on Arm VM, set up by
  [references/vm-setup.md](references/vm-setup.md): x64 Node, pnpm, Git, FFmpeg, Chrome, OpenSSH for
  key login, Developer Mode, long paths and local scripts. Its interactive steps (Windows setup,
  licence screens, guest tools) need the owner at the controls or their approval for each licence.
- For the editor check, the VM signed in to its desktop (the UTM window may stay in the background).
- `DREAMCUT_VM_HOST` (the VM's address, usually `192.168.64.x`) and `DREAMCUT_VM_USER`; the key
  defaults to `~/.ssh/dreamcut_vm`. Ask the owner for these rather than guessing.
- On the Mac: `pnpm install` done (the editor check uses its `playwright-core`) and FFmpeg on PATH.

## Run it

Paths are relative to this skill's folder. Steps 3 and 6 take a while; run them in the background.

1. Confirm the VM answers: `scripts/vm.sh 'node -p process.arch'` must print `x64`. `arm64` means the
   Arm build of Node is first on PATH; the download would then be built for `win32-arm64`.
2. Copy the working copy: `scripts/copy-to-vm.sh`. To retry after a small fix, copy just the changed
   files: `scripts/copy-to-vm.sh mcp/server.mjs packaging/x.mjs`.
3. Build and run the install check (about 20 minutes under emulation):
   `scripts/vm.sh 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\dev\dreamcut\.agents\skills\windows-compatibility\scripts\build-and-verify.ps1'`
   It stops at the first failing step and prints the end of `C:\dev\build.log`.
4. Start the built editor as a user has it: `scripts/open-editor.sh`. It installs the packed launcher,
   serves the runtime locally, starts DreamCut and Chrome on the VM's desktop, forwards Chrome's
   debugging port to the Mac, and prints a single-use sign-in link (minutes on a first install).
5. Run the editor check with that link: `node scripts/editor-check.mjs '<link>'` (5 to 15 minutes; the
   export dominates). A link works once; rerun step 4 for a fresh one.
6. Optionally run platform-sensitive unit tests in the VM, e.g.
   `scripts/vm.sh 'cd C:\dev\dreamcut; node --import tsx --test src/lib/render/audio-export.test.ts'`.

PowerShell mangles quotes in inline `node -e` code; copy a small script file over instead.

To look at something by hand, reuse the same session: connect Playwright to
`http://127.0.0.1:9229` (`chromium.connectOverCDP`), call `page.bringToFront()`, then act and take
screenshots. Clicking the UTM window from the Mac does not reach Windows apps reliably.

## Building on the Mac

The Windows download is built inside the VM because it carries `node_modules` with native modules
compiled per platform and Node version (`better-sqlite3`; `sharp` through its per-platform package;
`onnxruntime-node` already ships every platform). A Mac-built `win32-x64` download is the intended
direction, after which steps 2 and 3 become a copy of `dist/web-runtime` and `dist/npm` into the VM;
it is not supported yet. It needs the isolated install in [desktop/build.mjs](../../../desktop/build.mjs)
to fetch Windows packages and a prebuilt Windows `better-sqlite3`, a build-output check for Mac paths,
and the install check passing in the VM on that download. Until then, build in the VM.

## Read the result

Success is every build step exiting 0, `31/31 checks passed` from the install check, and
`N/N checks passed` from the editor check, whose last check confirms the MP4 has picture, sound and
the timeline's length. Report each failing check by name with its detail. The editor check prints
failed requests and leaves its project in the VM (`%LOCALAPPDATA%\DreamCut\projects\<id>`) for inspection.

When the editor fails to start, run the installed runtime directly. Under `%TEMP%\dreamcut-first-run-*\`
(kept on failure), run
`node "<app data>\runtimes\app\<version>-win32-x64\bin\dreamcut.mjs" --no-open` with
`DREAMCUT_APP_DATA_DIR` set to that app data folder, and read its error output. For the editor check,
`C:\dev\winui\install.log` and `editor.err` hold the launcher's output.

Fix causes in shared code (packaging, launcher, server, editor), not by special-casing the checks,
unless a check itself assumes POSIX behaviour. A failure may not be Windows-specific: the editor check
was the first to export from the packaged editor at all. [references/windows-pitfalls.md](references/windows-pitfalls.md)
lists the failures already met and their fixes; check it first. Re-run the Mac side of anything you
change (the affected tests, `pnpm typecheck`, and `node packaging/verify-web-runtime.mjs` on the Mac
after a packaging change), then copy the change to the VM and rebuild.

## Limits to report

- The VM is Windows on Arm running x64 Node under emulation, not an x64 PC. Before a launch, run both
  checks once on a real x64 Windows machine (a short-lived cloud VM is enough).
- No GPU: preview and export use the Browser renderer; the Graphics card renderer is untested.
- Not covered: the native file picker and drag-and-drop (the check uploads through the page's file
  input), cutouts, transcription, generation, and agent-driven editing through MCP beyond start-up.
