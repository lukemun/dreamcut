# Local installer builds and installed-app acceptance

## Scope and decision

Build locally; upload reviewed installers to the website/storage provider separately. GitHub Actions is optional qualification infrastructure, not a hosting or release requirement. Start with a macOS DMG containing DreamCut.app and an Applications shortcut. The existing package owner remains `desktop/package.mjs`; `make-installer.mjs` adds the disk image. Research: [installed desktop testing findings](../research/2026-10-09-installed-desktop-testing.md).

The public-download gate is separate from artifact creation. An unsigned local QA image must not be presented as a production release. No upload or publication occurs in these commands.

## Local commands

Prepare speech once per target host, then build the latest source:

```sh
pnpm desktop:voice
pnpm desktop:check
pnpm typecheck
pnpm desktop:build
pnpm desktop:package --qualification
pnpm desktop:installer --app "$PWD/.desktop-build/qualification-apps/DreamCut-darwin-arm64/DreamCut.app" --qualification
```

Use `darwin-x64` on an Intel host. The installer command reads version and architecture from the package, rejects missing runtime resources, external/broken links, common private inputs and altered model bytes, checks available disk space, and produces a versioned DMG plus SHA-256 and JSON receipt under `.desktop-build/installers/`. It mounts the completed image read-only and compares the complete file/link content digest with the original package. The audit requires executable bits on the application and bundled tools, and the digest includes file permissions. First launch still needs native acceptance; a content digest alone does not prove it.

Installer output is not overwritten silently. The receipt always keeps `websiteReady: false`; explicit release review follows the matrix below. Package scanning catches specified private paths, not all possible secrets or licensing issues.

For a website candidate, configure a Developer ID signing identity and a notarization Keychain profile using the existing packaging variables `DREAMCUT_SIGN_IDENTITY` and `DREAMCUT_NOTARY_PROFILE`, then:

```sh
pnpm desktop:package --sign --notarize
pnpm desktop:installer --app "$PWD/.desktop-build/apps/DreamCut-darwin-arm64/DreamCut.app"
```

The non-qualification installer path rejects an incomplete media redistribution audit, a failed signature/Gatekeeper assessment or missing stapled app ticket. The outer DMG signing/notarization workflow remains a release follow-up; do not interpret these checks as a finished public-distribution workflow.

After copying a candidate out of the checkout to a test installation location:

```sh
pnpm desktop:verify-installed "/path/to/test-install/DreamCut.app" ".desktop-build/whisper-source/samples/jfk.wav"
```

This read-only package audit runs bundled FFmpeg/FFprobe on a synthetic tone with a minimal PATH and temporary HOME. It starts bundled Whisper and, when given the upstream JFK fixture, checks an actual expected transcript. It removes temporary outputs. It does not launch the full GUI, access the creator's microphone, edit projects or establish clean-machine acceptance. Existing `verify-service-lifecycle.mjs` additionally exercises authenticated service startup, denial of unauthenticated requests, shutdown and port closure; this is a service test, not an installed GUI test.

## Acceptance matrix

Run on disposable projects and isolated user data. Retain version, architecture, OS, artifact SHA-256, results and logs. Failures block promotion; a skip is not a pass.

| Layer | Test and expected result | Automation/status |
|---|---|---|
| Source contracts | Sender isolation, safe writes, cancellation, recovery, process ownership | Existing desktop contracts; run before packaging |
| Package integrity | Runtime files/model present, no external links or developer secrets, model hash valid | Implemented `inspectInstalledPackage`; negative fixtures cover corruption, missing files and link escape |
| Installer container | DMG verifies, mounts read-only, app content matches, Applications shortcut correct | Implemented; synthetic native DMG round-trip passed, full application image pending disk space |
| Bundled engines | FFmpeg encodes synthetic audio, FFprobe reads it, Whisper recognizes known speech without Homebrew PATH | Implemented installed verifier; run against newly packaged artifact |
| Clean first launch | Browser-downloaded candidate, drag to Applications, eject DMG, launch through Finder without Node/Homebrew/source checkout; no security bypass | Required native check on a clean account/machine; pending |
| Editing | Open/import synthetic audio/video/still/text; play/seek/mute; change a control, save, quit, reopen; pixels/audio and saved state agree | UI acceptance pending, both workspace layouts and narrow panels |
| Rendering | Owned renderer's short deterministic export fixture, expected duration/frame size/audio; no user-project export | Reuse renderer contract fixtures; packaged-runtime execution pending |
| Voice | Allow/deny microphone, stop/cancel, silence, two-minute limit, project switch; review text before Send, no automatic transmission | IPC/unit checks exist; native permission and real microphone acceptance pending |
| Agent/audit | No Codex installed, signed out, connected; model selection; human proposal approval/undo; history persists after restart | Native acceptance pending; never agent-approve a user's proposal for testing |
| Resilience | Quit during work, crash/relaunch, no orphan processes or held ports, no corrupted project; offline startup and missing media handled | Existing process contracts; installed crash and recovery scenarios pending |
| Upgrade | Install N, create disposable project/draft/preferences, replace with N+1, reopen; data preserved; failed/interrupted update recoverable | Needs two signed artifacts and migration fixtures; pending |
| Uninstall/reinstall | Remove application only; explicitly retained projects/profile survive; reinstall opens them | Disposable installation test pending; do not delete creator data |
| Website artifact | Download bytes equal reviewed checksum; expected version/architecture; Gatekeeper and stapled ticket work online/offline | Pending hosting and signing; no upload authorized by build alone |

For repeatable GUI regression tests, Electron documents WebdriverIO and experimental Playwright support. A future harness should target the packaged executable, use disposable profiles, retain failure screenshots/logs and stub dialogs only for deterministic control-flow tests. Real native file pickers, OS permissions, Gatekeeper and production security settings require a separate acceptance pass; do not weaken release fuses to make a test pass. Current agent-driven GUI verification uses computer use. No new GUI automation dependency was added here.

## Evidence from this run — 2026-10-09

- Fresh production `desktop:build` succeeded.
- `desktop:package --qualification` failed with ENOSPC during dependency staging. Removed only the failed generated `.desktop-build/stage` directory afterward; preserved existing app artifacts and all project data.
- The host reports zero valid code-signing identities. No signing credentials were read or exported.
- `pnpm desktop:check`: 82 tests passed before adding the opt-in native container test. `DREAMCUT_TEST_DMG=1 node --test desktop/installed-package.test.mjs`: all 4 tests passed, including a real small synthetic DMG creation/verify/read-only-mount/content-comparison round-trip. Its generated test image and receipts were removed.
- No full DreamCut DMG, installed GUI acceptance, signed release, upgrade or Windows acceptance is claimed.
- Free enough space before retrying. Allow at least 8–10 GiB as a practical working target; this is our conservative budget, not a platform requirement. The installer computes its own minimum from the actual bundle size.

Windows remains governed by [local dictation and Windows qualification](local-dictation-windows.md): native worker cleanup, Windows execution, installer generation, signing and clean-machine testing remain open. No new agent skill is needed; these checks belong in scripts, tests and release documentation.

Follow-up: packaging now fails before replacing staging if less than 2 GiB is available. This conservative preflight does not guarantee sufficient space for every package; DMG creation separately checks its size-based budget.

The follow-up native audit run passed all 5 tests, including executable-permission loss rejection and DMG permission/content round-trip. The low-space preflight was exercised on the host and refused packaging before creating any staging directory. Available space remained about 643 MiB.


## Local build completion — 2026-10-09

The previous disk-space blocker was cleared. Version 0.1.0 for macOS arm64 was built, packaged and installed outside the checkout. The compressed local-QA DMG is approximately 809 MiB; its app contains approximately 1.70 GB of files including the base-English Whisper bundle. The first production compilation failed inside the remote Google font loader; a retry of the unchanged isolated source passed. No font fallback or dependency patch was applied.

Evidence:

- Desktop contracts: 83 passed, one skipped, zero failures.
- Package integrity, executable permissions, Whisper model checksums and mounted DMG content comparison passed.
- Installed-package checks passed with minimal PATH: bundled FFmpeg encoding, FFprobe decoding, Whisper executable startup and expected known-speech transcription.
- The installed GUI opened an existing project; Dictate message was enabled and reached Listening. It returned to idle with an empty composer after the cancellation interaction, which was interrupted by native window-control errors. No chat message was sent. Live spoken draft insertion remains unverified.
- A separate local app profile was used because a running development app held the default single-instance lock.

This supersedes the earlier full-package disk blocker. The artifact remains unsigned, local-only and not website-ready. Clean-machine installation, signed permission behavior, playback qualification, upgrade/uninstall and Windows gates remain open. Build receipts under ignored `.desktop-build/installers/` retain checksums and container evidence; they do not establish these remaining gates.

Native application artwork is sourced from `src/app/icon.png`, shared with the editor header. `desktop/app-icon.mjs` prepares macOS ICNS and Windows ICO containers during packaging. The installed Mac icon was visually verified in Finder; Windows container generation was checked, but native Windows display remains unverified.

## Window-close regression — 2026-10-09

A creator-reported close error exposed a gap in the mock-only chat lifecycle tests. A real Electron window reproduced `TypeError: Object has been destroyed`: the closed handler read `window.webContents.id` after Electron destroyed the window. Chat registration now captures the contents reference and its ID while alive; cleanup revokes the captured ID and removes listeners without reading the destroyed window. URL inspection also checks contents lifetime first.

`pnpm desktop:check-window-close` opens hidden disposable windows, loads a local synthetic page, closes and recreates them three times, and runs cleanup again after closure. It captures uncaught errors/rejections and fails on timeout. It does not open a project, connect to a model, record audio or send a message. The real-window test failed before the fix and passed afterward; the destroyed-object regression is also part of `desktop:check`.

To exercise the newly packaged cleanup implementation using the matching development Electron runtime:

```sh
pnpm desktop:check-window-close "/path/to/DreamCut.app/Contents/Resources/app"
```

This checks native window lifecycle against packaged shell modules. It is not a substitute for the full installed-app service test or manual close, reopen and Quit checks. Before handing off a candidate, run desktop contracts, the native close test against its shell, installed engine verification and the service lifecycle check. Creator QA should cover red-window-close/reopen, Quit/relaunch, dictation Stop/Cancel, and save/reopen on a disposable project. Record failures separately from packaging success.
