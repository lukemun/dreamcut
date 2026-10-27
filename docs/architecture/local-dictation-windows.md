# Local dictation and Windows qualification

Status: implemented local dictation candidate; Windows packaging workflow configured, not yet run on Windows. This is not a release approval.

## Decision and creator experience

Bundle whisper.cpp with the English base model for a consistent offline transcription path on macOS and Windows. Native OS recognition and browser Web Speech remain alternatives, not implicit fallbacks: their availability, language downloads and data handling differ. See the [primary-source findings](../research/2026-10-09-local-dictation-windows.md) and [source inventory](../research/raw/local-dictation-windows/sources.md).

The creator dictates a message in the desktop chat composer, stops recording, reviews the resulting text, and sends it normally. The existing shared Button owns the microphone, Stop and Cancel actions. This additional control serves voice input; it does not replace marks, model selection or Send. Dictation appends to the draft and never submits it. Cancel discards the active recording/transcription. Text can be edited normally; dictation does not mutate a timeline or create an undo entry. It is currently English-only, limited to two minutes per recording, and returns a transcript after Stop rather than partial live text. Browser-only chat has no native voice bridge.

The base English model is 147,964,211 bytes; the measured macOS arm64 bundle including executable and notices is about 150.5 MB. Upstream estimates about 388 MB memory for the base model; actual application peak memory includes the renderer, recorded audio, resampling and other editor work. No accuracy or ordinary-PC latency claim follows from the smoke test.

## Ownership and privacy

- `desktop/prepare-voice.mjs` pins source and model revisions, verifies the model hash, builds a static CPU executable and retains engine/model licenses. Release packaging checks file hashes and host architecture before copying the bundle.
- `VoiceInput.tsx` owns microphone capture, bounded recording, mono 16 kHz PCM conversion, draft insertion and cancellation. The browser receives no executable or filesystem API.
- `dictation-ipc.mjs` requires a registered application window, its main frame and an open project. A user recording action arms one bounded request. Navigation, closure and cancellation revoke it.
- `dictation.mjs` validates the audio envelope, chooses fixed executable/model paths, runs with a timeout and removes temporary audio/transcript files in `finally`. Abrupt process or machine termination can bypass this cleanup; startup scavenging of stale owned temporary directories remains a follow-up.
- Electron permits audio capture only while this recording grant is armed; unrelated media permissions remain denied. macOS usage text is included in packaging. Native permission and signed hardened-runtime behavior still require device acceptance.
- Audio transcription itself has no network step. Sending the resulting message follows the existing Codex chat path and its normal data handling. Audio and transcript bodies must not be sent to Sentry; this implementation adds no voice telemetry.

## Development and packaging workflow

Use the existing desktop workflow rather than creating a new agent skill. Platform behavior belongs in executable tests, build configuration and this acceptance record.

```sh
pnpm desktop:voice
node desktop/verify-voice.mjs
pnpm desktop:check
pnpm typecheck
pnpm check:editor-ui
pnpm desktop:dev
```

Preparation requires Git, CMake and a native C++ toolchain. Windows uses Visual Studio C++ build tools; the CI Windows runner supplies them. Each host builds its own native executable. Model bytes are shared across architectures, not the engine binary. Prepared downloads and binaries live under ignored `.desktop-build/`, never in Git.

The [desktop qualification workflow](../../.github/workflows/desktop-qualification.yml) runs macOS and Windows jobs, prepares the speech bundle, tests a public upstream speech fixture, builds the application and packages an unsigned local candidate. Windows installs its dependencies in the isolated build tree, preserves Windows environment variables, bundles checksum-pinned media tools and materializes symlinks for a portable package. It uploads qualification manifests only, not a public app download. Pull requests and manual workflow dispatch trigger it; it has not been pushed or dispatched as part of this local task.

```sh
pnpm editor:build
pnpm desktop:package --qualification
```

Windows packaging requires `DREAMCUT_WINDOWS_MEDIA_DIR` pointing to the verified FFmpeg distribution with `bin/ffmpeg.exe`, `bin/ffprobe.exe`, required DLLs and notices. The CI workflow supplies that directory. Windows signing/nonlocal release channels fail closed. A packaged app directory is not an installer: installer generation, signing and update delivery are separate remaining work.

## Acceptance evidence and remaining gates

Verified locally on macOS arm64:

- Pinned engine compiled successfully; dynamic dependencies were limited to macOS system libraries.
- Real base-English inference recovered the expected phrase from the upstream JFK sample. No user microphone recording or private media was used.
- `pnpm desktop:check`: 79 tests passed. Contracts exercise audio rejection, temporary-file cleanup, fixed invocation arguments, sender isolation and cancellation/navigation invalidation.
- `pnpm typecheck` passed; `pnpm check:editor-ui`: 15 tests passed. `node desktop/verify-voice.mjs` passed after the final WAV validation change.

The installed macOS arm64 candidate launched on 2026-10-09. The enabled Dictate message control entered Listening; after the cancellation interaction it returned to idle with the composer empty. Window-control interruptions occurred during cancellation, so this is bounded UI evidence. Known-speech inference passed against the installed bundle with a minimal PATH. Live spoken draft insertion, denied permissions, and independent fresh-eyes acceptance remain unverified.

Windows release blockers:

1. Run the new workflow on Windows and resolve any native build, path, symlink or packaging failures. Only macOS execution is established here.
2. Replace remaining POSIX process-group cleanup in owned workers and watchdogs with Windows lifecycle ownership, preferably Job Objects with kill-on-close, and test graceful quit plus service/renderer crashes. Negative process-group IDs are not a Windows implementation.
3. Validate Codex discovery and execution on a clean Windows machine. Current discovery recognizes native `.exe` candidates or an explicit executable path; npm `.cmd` wrappers are not resolved.
4. Exercise import, preview, audio, frame capture, export fixtures, proposals/approval/undo and audit persistence from a moved packaged directory without developer tools installed. Include paths with spaces and non-ASCII names, denied microphone permission, silence, disconnect, cancellation and project changes.
5. Choose and test a Windows installer, establish code signing and update feeds, and test upgrade/uninstall while retaining user projects. Native microphone behavior must be checked in signed macOS and Windows packages.
6. Complete the FFmpeg redistribution/source/notices audit before distributing the GPL-enabled Windows media bundle. Current media manifests intentionally remain not distribution-ready.

The full production package and local QA DMG were rebuilt on 2026-10-09 after disk space was freed; see the installed-app acceptance record. Existing unrelated inspector-contract failures from the preceding UI work remain outside this change; report them separately from the passing desktop and editor-UI gates.
