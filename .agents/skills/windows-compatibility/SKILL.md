---
name: windows-compatibility
description: Check that DreamCut installed from source works on Windows, from a Mac, using a Windows VM driven over SSH. It installs this checkout as the README tells a Windows user, connects an agent over MCP, and in Windows Chrome it creates a project, imports, places and plays clips, and exports. Use before pushing changes to the MCP server's startup/shutdown, native dependencies, child-process spawning, file paths, setup scripts, media preparation or export to the public repository (from releasing).
---

# Check Windows compatibility

The outcome is evidence that a Windows user who follows the README's Install section (`git clone`,
`pnpm install`, `pnpm bootstrap`, then `claude mcp add dreamcut -s user -- node <checkout>\bin\dreamcut.mjs mcp`
or the Codex equivalent) gets a working editor. Two checks give it, both on this checkout's working copy
(uncommitted changes included) copied into the VM:

- **Install check** ([scripts/install-and-verify.ps1](scripts/install-and-verify.ps1)) runs
  `pnpm install --frozen-lockfile` and `pnpm bootstrap`, then [scripts/vm/mcp-check.mjs](scripts/vm/mcp-check.mjs)
  connects as an agent does: `node bin/dreamcut.mjs mcp` answers `initialize`, lists its tools and exits
  when the agent disconnects.
- **Editor check** ([scripts/editor-check.mjs](scripts/editor-check.mjs)) acts as the person: in the
  VM's Chrome it opens the sign-in link, creates a project, imports two generated clips, adds them to the
  timeline, plays the preview, exports, and inspects the MP4 inside the VM.

No Claude Code, Codex or account sign-in is needed inside the VM. This tests the web editor that
`node bin/dreamcut.mjs` runs from a checkout, not the Electron desktop preview or the retired npm launcher.
It changes nothing outside the VM. It is step 5 of [releasing](../releasing/SKILL.md).

Why the VM is configured as it is (x64 Node on Arm, SSH, scheduled tasks, DevTools forwarding) is in
[references/vm-design.md](references/vm-design.md). Keep those reasons when changing the setup.

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
   Arm build of Node is first on PATH; native modules would then install for `win32-arm64`.
2. Copy the working copy: `scripts/copy-to-vm.sh`. To retry after a small fix, copy just the changed
   files: `scripts/copy-to-vm.sh mcp/server.mjs scripts/x.mjs`.
3. Install and run the install check (several minutes under emulation; longer on a first install):
   `scripts/vm.sh 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\dev\dreamcut\.agents\skills\windows-compatibility\scripts\install-and-verify.ps1'`
   It stops at the first failing step and prints the end of `C:\dev\install.log`.
4. Start the editor as a user's install runs it: `scripts/open-editor.sh`. It starts
   `node bin\dreamcut.mjs --no-open` from the checkout and Chrome on the VM's desktop, forwards Chrome's
   debugging port to the Mac, and prints a single-use sign-in link. The first start compiles the editor,
   which takes many minutes under emulation. Projects go to the checkout's `projects\` folder.
5. Run the editor check with that link: `node scripts/editor-check.mjs '<link>'` (5 to 15 minutes; the
   export dominates). A link works once; rerun step 4 for a fresh one.
6. Optionally run platform-sensitive unit tests in the VM, e.g.
   `scripts/vm.sh 'cd C:\dev\dreamcut; node --import tsx --test src/lib/render/audio-export.test.ts'`.

PowerShell mangles quotes in inline `node -e` code; copy a small script file over instead.

To look at something by hand, reuse the same session: connect Playwright to
`http://127.0.0.1:9229` (`chromium.connectOverCDP`), call `page.bringToFront()`, then act and take
screenshots. Clicking the UTM window from the Mac does not reach Windows apps reliably.

## Read the result

Success is every install step exiting 0 with `3/3 checks passed` from the MCP check, and
`N/N checks passed` from the editor check, whose last check confirms the MP4 has picture, sound and
the timeline's length. Report each failing check by name with its detail. The editor check prints
failed requests and leaves its project in the VM (`C:\dev\dreamcut\projects\<id>`) for inspection.

When the editor fails to start, `C:\dev\winui\editor.log` and `editor.err` hold its output; to see it
live, run `node bin\dreamcut.mjs --no-open` in `C:\dev\dreamcut` from the VM's own terminal.

Fix causes in shared code (setup scripts, server, editor), not by special-casing the checks,
unless a check itself assumes POSIX behaviour. A failure may not be Windows-specific. [references/windows-pitfalls.md](references/windows-pitfalls.md)
lists the failures already met and their fixes; check it first. Re-run the Mac side of anything you
change (the affected tests and `pnpm typecheck`), then copy the change to the VM and rerun the install check.

## Limits to report

- The VM is Windows on Arm running x64 Node under emulation, not an x64 PC. Before a launch, run both
  checks once on a real x64 Windows machine (a short-lived cloud VM is enough).
- No GPU: preview and export use the Browser renderer; the Graphics card renderer is untested.
- Not covered: the native file picker and drag-and-drop (the check uploads through the page's file
  input), cutouts, transcription, generation, and agent-driven editing through MCP beyond start-up.
