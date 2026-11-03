# Experimental Rust preview and export

The opt-in editor backend replaces video source decoding with Rust/FFmpeg while
retaining the existing browser composition, effects, text, tracking, transitions,
and audio pipeline. It is integrated into the real Player and tracked export jobs.
Standard remains selectable. This is still experimental: representative real-time
playback, visual/audio acceptance, high-resolution capacity and failure recovery
have outstanding checks.

## Runtime ownership

The shared timeline helpers resolve authored source time and composition state.
Preview uses verified proxies; export retains original/processed render authority.
The local server validates source paths, metadata and presentation timestamps,
then sends bounded requests to persistent Rust/FFmpeg decoders. Returned RGBA
packets validate every source ID, dimension and payload before publishing.

Two complete browser scenes alternate during native preview. Each scene settles
video sources before alpha, chroma and LUT drawing, then publishes picture, text
and geometry together. Its effects use settled draw mode, so hidden and completed
scenes do not run additional animation-frame drawing loops. Late preparation uses
the existing coordinated picture/audio waiting state. Seeks and edits invalidate
stale scenes. The normal browser preview retains its live effect drawing behavior.

Rust decodes; the browser composes. This is not a GPU compositor, hardware-decoding
implementation, zero-copy transport, native audio engine or browser-free renderer.
Authored audio remains in the existing preview mixer and browser/FFmpeg export
pipeline. Native export errors fail explicitly instead of silently changing backend.

## Setup and launch

From the repository root, after `pnpm install`:

```sh
pnpm setup:rust
pnpm dev:rust
```

Open `http://localhost:3143`. The preview's gear beside fullscreen contains
**Renderer for preview & export → Standard / Rust / Browser GPU**, the shared
prepared/direct playback choice where applicable, and preview quality. One renderer
choice selects both preview and new exports; Browser GPU uses CanvasKit rather than
Rust. Conflicting legacy preferences require confirmation in that control.
Switching engines does not change the timeline. Both engines use the same prepared cache and completed-video player. Prepare before
playing waits for the complete preview; Play directly can still buffer when a frame
is late. Preparation currently supports edits up to 60 seconds.

`setup:rust` uses the existing `Cargo.toml` and `Cargo.lock`. It checks Cargo/rustc,
FFmpeg/ffprobe, zscale and VP8/VP9 alpha decoders; runs a locked release build and
Rust tests; and decodes a disposable test clip through the helper's real protocol.
It pins the build output to `native/preview/target`, matching the server even when
`CARGO_TARGET_DIR` is set elsewhere. Build output is ignored by Git. The command is
repeatable; Cargo reuses unchanged build artifacts.

On an interactive macOS terminal with Homebrew, missing Rust/FFmpeg packages can be
installed after a yes/no prompt. Noninteractive runs and Linux report missing
prerequisites with recovery instructions. No administrator commands, environment
file changes or dependency installation occur in check mode:

```sh
pnpm setup:rust --check
pnpm setup:rust --help
pnpm test:setup:rust
```

macOS is locally verified. Linux follows the same helper path but has not had an
end-to-end setup acceptance run. Windows is rejected with an explicit message until
the runtime's executable/path handling supports it. Chrome and the rest of the
editor dependencies are covered by the regular `pnpm bootstrap` workflow.

### Isolation and production builds

`pnpm dev:rust` enables both server/client native flags and uses `.next-native` on
port 3143. It does not copy project storage. To preserve working cuts, use a worktree
and private copies with explicit storage roots:

```sh
TIMELINE_PROJECTS_DIR="$PWD/private/native-test/projects" \
  DREAMCUT_PROFILE_DIR="$PWD/private/native-test/profile" \
  pnpm dev:rust
```

Populate those directories with your intended test copies first. The setup command
never copies or modifies a project. Keep any automatic learning/retros disabled in
an experimental copied profile.

For an optimized server, the public flag must be present **during the build**, and
the server flag must also be present when starting it. Restart/rebuild after changing
these flags; setting only a runtime public flag does not change an existing bundle.
Use the same project/profile roots at build and startup when testing in isolation.

```sh
DREAMCUT_NATIVE_PREVIEW=1 NEXT_PUBLIC_DREAMCUT_NATIVE_PREVIEW=1 \
  TIMELINE_NEXT_DIST_DIR=.next-native-production pnpm exec next build --webpack
DREAMCUT_NATIVE_PREVIEW=1 NEXT_PUBLIC_DREAMCUT_NATIVE_PREVIEW=1 \
  TIMELINE_NEXT_DIST_DIR=.next-native-production pnpm exec next start -H 127.0.0.1 -p 3144
```

The supported webpack build avoids the font-query failure encountered with the
current Turbopack production build. Development still uses Turbopack.

Export jobs retain `backend: standard | rust`; receipts identify the source decoder
and compositor. CLI exports accept `--backend rust` under the same explicit export
authorization. Setup and checks do not export a creator's project.

## Bounds and verification

- Decode surfaces allow up to 4096 pixels per axis; preview respects verified proxy
  dimensions and composition size. This bound is not a 4K performance guarantee.
- Each source batch allows eight sources; larger scenes use serial batches and
  publish only after all batches complete. Four helper workers execute at once;
  up to 64 requests wait in a bounded queue with explicit timeouts.
  Queues serialize ownership, idle helpers expire, and file/helper changes invalidate
  retained decoders. Native request memory and multi-project capacity remain bounded
  workloads to verify, not unlimited concurrency claims.
- Common codecs use presentation-packet indexes. Ambiguous clocks, including packets
  marked for discard, use decoded-frame timestamps. Natural loops preserve the
  decoded presentation tail when stream metadata declares a shorter duration.
- Declared matrix, primaries and range drive sRGB conversion while retaining alpha.
  Common SDR transfer tags follow Chromium’s sRGB display interpretation; applying
  their normative transfer instead darkens footage relative to the browser. Untagged
  inputs use a bounded SD/HD fallback. HDR/wide-gamut output is not certified. VP8/VP9 alpha
  decoding uses the probed codec rather than the filename extension.

```sh
cargo test --manifest-path native/preview/Cargo.toml
python3 native/preview/tests/pixels.py
pnpm typecheck
pnpm verify:playback
pnpm verify:renderer
```

Against an isolated server, `DREAMCUT_VERIFY_NATIVE=1 pnpm verify:renderer` exercises
46 registered effect controls, six moving-video transition families, source clocks,
3D, LUTs, tracking, repeated seeks, reset and encoded output. Set
`TIMELINE_PROJECTS_DIR` and `TIMELINE_EDITOR_BASE_URL` to that isolated instance.
`tsx scripts/verify-playback-contract.ts --native` checks complete-scene playback,
paused drawing, seeks, replay, transport rates and retimed picture/audio export.
Passing those synthetic checks is separate from real-project visual/listening and
continuous-playback acceptance. Read current receipts and failure logs rather than
assuming an older successful receipt describes the current build.

`verify-native-projects.ts --full-source --export` explicitly renders copied projects
through the full shared composition and independently collected authored audio.
The older default `NativeComparisonFixture` is a diagnostic CPU scene compositor
with a restricted allowlist and copied reference audio. It is not the active editor
backend and cannot establish full composition or independent audio support.

`DREAMCUT_VERIFY_NATIVE=1 pnpm exec tsx scripts/verify-alpha-preview.ts` uses
the same isolated root/base URL settings to verify moving transparency and outline
layers over three replays, repeated seeks and all 60 encoded source positions.
Expected positions follow the encoded source PTS, including WebM millisecond
rounding. Its receipt is separate from the Standard callback-starvation proof.
