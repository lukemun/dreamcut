---
name: releasing
description: Get a DreamCut version ready to ship and, when the owner says to release, ship it. Routes to the install check, the Windows check, the release build (dry run) and publishing, in that order. Use when the owner asks to release, prepare or check a release, or to make sure a new version will install and work for a new user. A single packaging or launcher change that only needs its own verification goes to install-check or windows-compatibility directly.
---

# Release DreamCut

The outcome is a version that a new creator can install from dreamcut.io and use on macOS and Windows,
published only when the owner asks. This skill orders the parts and holds the gates between them; each
part's procedure lives in its own skill and the command list in [docs/releasing.md](../../../docs/releasing.md).

## Authority

- Releasing is the owner's decision. "Get it ready", "check the release" or "will this install?" authorize
  steps 1 to 3 only. Publish (step 4) only on the owner's explicit words to release this version, in this
  conversation. Never bump `package.json`'s version, edit `packaging/release-hold.json` or push to release
  without that.
- A version listed in `packaging/release-hold.json` is held; report it and stop before publishing.
- Steps 1 to 3 change nothing outside this checkout, disposable folders and the Windows VM.

## Order

1. **New-user install path**: [install-check](../install-check/SKILL.md). The dreamcut.io instructions,
   a fresh install, the background feature setup and `npx dreamcut doctor` agree, and every feature's
   program and model is installed by them.
2. **Windows**: [windows-compatibility](../windows-compatibility/SKILL.md). Builds the `win32-x64`
   download in the VM and uses the editor through to an export.
3. **Release build**: [release-build](../release-build/SKILL.md). `pnpm release --dry-run` on the Mac,
   read against the checklist.
4. **Publish**: [release-publish](../release-publish/SKILL.md), only with the owner's go-ahead. Then the
   Windows download is attached from the VM (`pnpm release --add-platform`).

Steps 1 and 2 can run while the other is in progress (1 is on the Mac, 2 in the VM). Step 3 needs the
version and changelog the owner chose; step 4 needs 1 to 3 passing at the same commit. A fix made during
any step reruns the earlier steps it can affect: packaging, launcher or server changes rerun 1 to 3.

## Report

For each step: passed, failed (each failing check by name, with its detail) or not run (why). Then what a
creator on each platform gets that was not exercised (for example the x64 Windows hardware gap, or a
feature the checks do not reach), and the single next decision for the owner (ship, fix first, or hold).
