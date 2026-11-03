# install-check — evolution log

## Purpose
Show that a creator who installs DreamCut from dreamcut.io and follows its instructions gets every program and
model the editor's features use, on a computer without the maintainer's tools, and that a missing or broken one
is installed, repaired or named with a command that works in an installed DreamCut. Scope: the site's install
instructions, the launcher and runtime download, the background feature setup, `dreamcut doctor`, and the
failure messages that send a creator to them; macOS here, Windows through windows-compatibility. It never
publishes or deploys. Good looks like: every dependency has an installer, a doctor row and a clear failure;
the fresh setup and reduced-PATH runs pass; skipped parts are named with the reason.

## 2026-10-25 — first audit and retro

- **Observation:** "Enhance voice" failed on the owner's Mac with `spawnSync …/deepFilter ENOENT`: the voice
  environment was found by `existsSync` under an earlier product name, but its launcher's `#!` pointed at a
  folder renamed since. Auditing every runtime dependency then found: nothing installed whisper-cli, the Whisper
  models, MFA or its models, or a Python with NumPy; error messages named `pnpm` scripts that an installed
  runtime does not have; `speech_prepare` and cutout treatments hashed `scripts/*.ts` sources the package no
  longer ships, so they always refused in an installed runtime; alignment runs offline and needed a Hugging Face
  model that only the owner's machine had cached; conda-forge's FFmpeg lacks vid.stab; and the owner's
  Homebrew `ffmpeg-full` (79 libraries) was what made stabilization and frame-check labels work locally.
  While fixing, two edits broke `scripts/transcribe.ts` and `scripts/align.ts` (backticks inside template
  literals) and `pnpm typecheck` passed, because it does not cover `scripts/`; only running them caught it.
  The release check would also have started the new 4 GB background setup into the real user cache.
- **Decision:** The owner chose to install everything up front ("2 GB is small for a video editor") and to
  ship DreamCut's own FFmpeg with stabilization under the GPL's conditions. Built: the background
  `dreamcut setup` (conda-forge through pinned micromamba), `dreamcut doctor`, `setup-voice` with repair,
  `setup-speech` with pinned models, a lean FFmpeg from pinned sources with its licences and corresponding
  source published per release, compiled-worker fingerprints, and `DREAMCUT_FEATURE_SETUP=0` in the release
  check. This skill records the method so the next audit does not rediscover the traps: run programs rather
  than trusting files, test with reduced PATH and fresh caches, parse edited scripts, and keep disposable
  folders away from the owner's caches (the disk was 99% full).
- **Verification:** On the owner's Mac: the tools and MFA steps installed into a scratch folder in about 4
  minutes; with Homebrew off PATH, transcription and offline word alignment of a synthesized clip aligned 13
  of 13 words; 806 of 807 media/local-store/render/color/instrument tests passed on the shipped FFmpeg alone
  (the last passes when its libx265 fixture encode uses Homebrew); a renamed-venv fake home was reported and
  rebuilt; typecheck, `check:tools` and the setup tests passed. Not run: a full fake-home setup of voice and
  tracing (disk), Windows, and a full `pnpm release --dry-run`. This skill itself is a written procedure from
  that work, not yet executed as written.

## 2026-10-27 — source install is the only documented path

- **Observation:** The owner decided DreamCut installs from the public GitHub repository; the npm launcher
  stays published at 0.3.0 but is not referenced, since its users hit issues they cannot work around.
- **Decision:** The procedure checks the source install (`pnpm bootstrap`, `pnpm setup:*`,
  `node bin/dreamcut.mjs`), and failure messages name those commands instead of `npx dreamcut`.
- **Verification:** Each replacement command (`pnpm setup:check`, `setup:speech`, `setup:voice`,
  `setup:matting`, `pnpm bootstrap`, `node bin/dreamcut.mjs setup|doctor|mcp|--help`) ran once on the owner's
  Mac and exited 0. The skill was not run end to end on a clean computer.

## 2026-10-28 — fresh-Mac prerequisites and setup in a git install

- **Observation:** An audit of the install path for a non-technical creator on a new Mac found FFmpeg missing
  from the README, dreamcut.io and the plugin's steps although `pnpm bootstrap` stops without it; Homebrew
  assumed but never named (and Homebrew's `node@24` is keg-only, so `node` stays missing after
  `brew install`); `corepack enable` failing where Node's folder is root-owned; and `node bin/dreamcut.mjs setup`
  installing programs a git install never put on PATH, so doctor kept reporting them missing.
- **Decision:** `runtimeEnvDefaults` gives a git install setup's programs after the system's own (Python and MFA
  only once setup installed them). The steps name every prerequisite with a no-Homebrew route
  (`xcode-select --install`, the nodejs.org `.pkg`, FFmpeg through setup), use `corepack pnpm`, and say setup
  runs by hand in a git install. The README, site and plugin say the same.
- **Verification:** `node --test scripts/setup-features.test.mjs`; `node scripts/doctor.mjs` with PATH reduced
  to `/usr/bin:/bin` finds setup's FFmpeg and whisper-cli, and names `brew install ffmpeg` or setup when the tools
  folder is empty; `corepack pnpm --version` with a fresh `COREPACK_HOME` and no TTY. Not run on a new Mac.
