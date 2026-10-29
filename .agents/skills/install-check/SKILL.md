---
name: install-check
description: Check that a creator who installs DreamCut from its public GitHub repository and follows its instructions ends up with every program and model the editor's features need, and that a missing or broken one is installed, repaired or named with a command that works in a source install. Use before pushing (from releasing) changes to setup, `bin/`, MCP start-up, a runtime dependency, a model path or an error that tells the creator to install something, or when a feature fails on a creator's machine because something is missing. Windows is windows-compatibility.
---

# Check the new-user install path

The outcome is evidence that the install path works on a computer that has none of the maintainer's tools:
the install instructions (README, dreamcut.io) match what a source install does, a fresh setup installs every
feature's programs and models, `pnpm setup:check` reports them truthfully, and anything missing fails with a
message naming a command that exists in a source install. It changes nothing published; the site lives in its own
repository (dreamcut-cloud) and site changes are reported, not deployed.

## How DreamCut is installed

- From the public GitHub repository: `git clone`, `corepack pnpm install`, `corepack pnpm bootstrap`;
  agents connect through the DreamCut plugin (lukemun/dreamcut-plugins), which runs `node ~/DreamCut/bin/dreamcut.mjs mcp`.
  A fresh Mac has none of the prerequisites: Git comes from `xcode-select --install`, Node from the nodejs.org
  `.pkg` (or Homebrew's keg-only `node@24`, which needs `brew link --overwrite --force node@24`), and FFmpeg
  from Homebrew or setup. The npm launcher (removed from this repository) and its runtime download stay published at 0.3.0 but
  are not referenced: never point anyone at `npx dreamcut`.
- Updates ([mcp/install-updates.mjs](../../../mcp/install-updates.mjs)): `editor_open` and `dreamcut` report
  commits the install lacks; `dreamcut_update` or `node bin/dreamcut.mjs update` fast-forwards, runs
  `pnpm install` when the lockfile changed and restarts the editor. Test it on a disposable clone whose
  `origin` is the public URL, redirected with `git config url.<local bare repo>.insteadOf <public URL>`,
  never on the maintainer's checkout (it is marked `dreamcut.updates off`).
- `pnpm setup:voice`, `pnpm setup:speech` and `pnpm setup:matting` install each feature's programs and
  models; `node bin/dreamcut.mjs setup` ([scripts/setup-features.mjs](../../../scripts/setup-features.mjs))
  installs them all: conda-forge tools through a pinned micromamba (whisper.cpp, uv, Python with NumPy, a
  fallback FFmpeg), Montreal Forced Aligner, the speech models, voice enhancement and subject tracing; about
  4 GB, under the user cache ([scripts/feature-tools.mjs](../../../scripts/feature-tools.mjs)).
- `pnpm setup:check` (also `node bin/dreamcut.mjs doctor`, [scripts/doctor.mjs](../../../scripts/doctor.mjs))
  checks all of it.

[references/dependencies.md](references/dependencies.md) lists each dependency, the features that need it,
what installs it, what checks it and how it fails. Keep it current when you add or move one.

## Run it

1. **Instructions.** Read the site's install page (dreamcut-cloud `site/src/app/install/` and
   `site/src/components/site/InstallOptions.tsx`) and the README's Install section. Every command they give
   must exist in `package.json` or `node bin/dreamcut.mjs --help`, none may name `npx dreamcut`, and every
   size or requirement must be current.
2. **Inventory.** When code changed since the reference was written, find new dependencies: programs
   started with `spawn`/`execFile`, model and cache paths, `*_BIN`/`*_MODEL`/`*_PYTHON` variables, and
   setup scripts. Each needs an installer step, a doctor row and a clear failure message.
3. **Disk.** `df -h` first. A fresh feature setup needs about 8 GB free while installing; on a nearly full
   disk, test only the steps your change touches and say so.
4. **Fresh setup.** Run the setup into disposable folders, never the maintainer's own caches:
   `DREAMCUT_TOOLS_DIR=<tmp>/tools HF_HOME=<tmp>/hf node scripts/setup-features.mjs`. Steps whose results
   already exist on this computer are skipped; give them a disposable `HOME` too when they are what changed.
   Expect `Every DreamCut feature is set up.` and every step `done` in `<tmp>/tools/setup-state.json`.
5. **Only the installed tools.** Rerun the features with PATH reduced to Node, `/usr/bin:/bin` and the
   setup's tools (its conda-forge FFmpeg included), so nothing from Homebrew can stand in:
   - the media test suites:
     `node --import tsx --test src/lib/media-analysis/*.test.ts src/lib/local-store/*.test.ts src/lib/render/*.test.ts src/lib/color/*.test.ts src/lib/instruments/*.test.ts`
     (set `DREAMCUT_PYTHON` to the setup's Python; tests that make fixtures with an encoder the runtime
     does not ship, such as libx265, fail for that reason only);
   - transcription and word alignment on a spoken clip (`say -o clip.aiff "…"` on macOS), aligned with
     `HF_HUB_OFFLINE=1` and the fresh `HF_HOME`, as `speech_prepare` runs it: `scripts/transcribe.ts`,
     then `scripts/align.ts` (confirm the pronunciation review it asks for in the scratch file);
   - `node scripts/doctor.mjs` with the same environment.
6. **Repair.** A broken install must be found and fixed, not only a missing one: give a disposable `HOME`
   a voice environment whose launcher points at a renamed folder and check that `scripts/setup-voice.mjs --check`
   reports it and that the editor's message names `pnpm setup:voice`.
7. **Checks.** `pnpm typecheck` does not cover `scripts/*.ts`: run or parse every script you edited
   (`npx esbuild --log-level=error <file> > /dev/null`). Then the tests for what changed,
   `node --test scripts/setup-*.test.mjs`, and `pnpm check:tools` when
   a script was added. Delete the disposable folders afterwards.

## Traps already met

- Prerequisites the maintainer already has go unstated. The README, dreamcut.io's steps
  (`site/src/lib/install-instructions.ts`) and the plugin's install-dreamcut skill and `dreamcut_setup_status`
  text must name the same ones (Git, Node 22 or 24, FFmpeg, Chrome) and the same commands; change them together.
  `corepack enable` writes into Node's folder, which the nodejs.org installer can leave owned by root, so the steps
  use `corepack pnpm`.

- A file that exists is not a program that runs: a virtual environment moved or renamed under an earlier
  product name kept its launcher, whose `#!` pointed at a Python that no longer existed. Check by running
  it or by checking its interpreter.
- Messages name source-install commands (`pnpm setup:*`, `node bin/dreamcut.mjs …`), never `npx dreamcut`.
  The packaged runtime still ships no TypeScript source, so anything that reads or hashes `scripts/*.ts`
  must use the compiled `workers/*.mjs` (`workerImplementationFiles`); the maintainer's checkout hides that.
- The maintainer's machine hides gaps: Homebrew's `ffmpeg-full`, a Python with NumPy, an MFA wrapper and
  Hugging Face models already cached. Offline flags (`HF_HUB_OFFLINE=1`) then pass only where a model was
  fetched by hand. Test with reduced PATH and fresh caches (steps 4 and 5).
- conda-forge's FFmpeg has no vid.stab, so stabilization fails in step 5 by design; check it with the FFmpeg
  doctor tells a creator to install whenever the FFmpeg advice changes.
- Anything that runs `dreamcut mcp` from an installed runtime starts the 4 GB background setup unless
  `DREAMCUT_FEATURE_SETUP=0`; release checks must set it.

## Report

What was checked (instructions, inventory, fresh setup, reduced-PATH runs, repair) with each result, what was
skipped and why (disk, platform, time), site changes the owner should make, and dependencies that still have
no installer or no clear failure.
