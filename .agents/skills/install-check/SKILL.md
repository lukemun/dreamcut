---
name: install-check
description: Check that a creator who installs DreamCut from dreamcut.io and follows its instructions ends up with every program and model the editor's features need, and that a missing or broken one is installed, repaired or named with a command that works in an installed DreamCut. Use before a release (from releasing), after changing setup, packaging, the launcher, a runtime dependency, a model path or an error that tells the creator to install something, or when a feature fails on a creator's machine because something is missing. Windows is windows-compatibility.
---

# Check the new-user install path

The outcome is evidence that the install path works on a computer that has none of the maintainer's tools:
the dreamcut.io instructions match what the launcher does, a fresh install sets up every feature's programs
and models, `npx dreamcut doctor` reports them truthfully, and anything missing fails with a message naming
a command that exists in an installed DreamCut. It changes nothing published; the site lives in its own
repository (dreamcut-cloud) and site changes are reported, not deployed.

## How DreamCut is installed

- `npx dreamcut install` / `npx dreamcut mcp` (the npm launcher, [packaging/launcher](../../../packaging/launcher/bin/dreamcut.mjs))
  downloads the runtime: a base layer (node_modules) and an app layer that carries, on macOS, the FFmpeg
  built by [packaging/build-ffmpeg.mjs](../../../packaging/build-ffmpeg.mjs).
- On its first start the runtime runs `dreamcut setup` in the background
  ([scripts/setup-features.mjs](../../../scripts/setup-features.mjs)): conda-forge tools through a pinned
  micromamba (whisper.cpp, uv, Python with NumPy, a fallback FFmpeg), Montreal Forced Aligner, the speech
  models, voice enhancement and subject tracing; about 4 GB, under the user cache
  ([scripts/feature-tools.mjs](../../../scripts/feature-tools.mjs)).
- `npx dreamcut doctor` ([scripts/doctor.mjs](../../../scripts/doctor.mjs)) checks all of it. A source
  checkout uses `pnpm setup:check`, `setup:voice`, `setup:speech` and `setup:matting` instead.

[references/dependencies.md](references/dependencies.md) lists each dependency, the features that need it,
what installs it, what checks it and how it fails. Keep it current when you add or move one.

## Run it

1. **Instructions.** Read the site's install page (dreamcut-cloud `site/src/app/install/` and
   `site/src/components/site/InstallOptions.tsx`), the README's Install section and the launcher's
   [edit-video skill](../../../packaging/launcher/skills/edit-video/SKILL.md). Every command they give
   must exist in the launcher (`npx dreamcut --help`) and every size or requirement must be current.
2. **Inventory.** When code changed since the reference was written, find new dependencies: programs
   started with `spawn`/`execFile`, model and cache paths, `*_BIN`/`*_MODEL`/`*_PYTHON` variables, and
   setup scripts. Each needs an installer step, a doctor row and a clear failure message.
3. **Disk.** `df -h` first. A fresh feature setup needs about 8 GB free while installing; on a nearly full
   disk, test only the steps your change touches and say so.
4. **Fresh setup.** Run the setup into disposable folders, never the maintainer's own caches:
   `DREAMCUT_TOOLS_DIR=<tmp>/tools HF_HOME=<tmp>/hf node scripts/setup-features.mjs`. Steps whose results
   already exist on this computer are skipped; give them a disposable `HOME` too when they are what changed.
   Expect `Every DreamCut feature is set up.` and every step `done` in `<tmp>/tools/setup-state.json`.
5. **Only the installed tools.** Rerun the features with PATH reduced to Node, `/usr/bin:/bin`, the shipped
   FFmpeg (`dist/media-tools/<platform>/bin`, from `node packaging/build-ffmpeg.mjs`) and the setup's tools,
   so nothing from Homebrew can stand in:
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
   reports it and that the editor's message names `npx dreamcut setup-voice`.
7. **Checks.** `pnpm typecheck` does not cover `scripts/*.ts`: run or parse every script you edited
   (`npx esbuild --log-level=error <file> > /dev/null`). Then the tests for what changed,
   `node --test scripts/setup-*.test.mjs packaging/build-ffmpeg.test.mjs`, and `pnpm check:tools` when
   a script was added. Delete the disposable folders afterwards.

## Traps already met

- A file that exists is not a program that runs: a virtual environment moved or renamed under an earlier
  product name kept its launcher, whose `#!` pointed at a Python that no longer existed. Check by running
  it or by checking its interpreter.
- An installed DreamCut has no `pnpm` scripts and no TypeScript source. Messages must name `npx dreamcut …`
  commands, and anything that reads or hashes `scripts/*.ts` must use the compiled `workers/*.mjs`
  (`workerImplementationFiles`); the maintainer's checkout hides both mistakes.
- The maintainer's machine hides gaps: Homebrew's `ffmpeg-full`, a Python with NumPy, an MFA wrapper and
  Hugging Face models already cached. Offline flags (`HF_HUB_OFFLINE=1`) then pass only where a model was
  fetched by hand. Test with reduced PATH and fresh caches (steps 4 and 5).
- conda-forge's FFmpeg has no vid.stab, so the shipped FFmpeg stays first on PATH; check stabilization
  whenever FFmpeg's source changes.
- Anything that runs `dreamcut mcp` from an installed runtime starts the 4 GB background setup unless
  `DREAMCUT_FEATURE_SETUP=0`; release checks must set it.

## Report

What was checked (instructions, inventory, fresh setup, reduced-PATH runs, repair) with each result, what was
skipped and why (disk, platform, time), site changes the owner should make, and dependencies that still have
no installer or no clear failure.
