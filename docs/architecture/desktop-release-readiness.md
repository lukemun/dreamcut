# DreamCut release readiness

Status: **not ready for public distribution**. Updated 2026-10-09. This application plan interprets [official-source research](../research/2026-10-09-desktop-release-readiness.md) and supplements the [desktop acceptance audit](desktop-app-acceptance.md), which remains the requirement-level evidence owner.

## What should ship first

Target a macOS arm64 private preview using the current Electron/React/Next stack. Finish qualification of that package before adding another renderer, desktop framework or a second OS target. A local .app, a signed distributable and a tested release/update channel are separate milestones.

## Current assessment

The repository has isolated build and packaging entry points (`desktop/build.mjs`, `desktop/package.mjs`), scoped preload/IPC, app-managed services, signing/notarization configuration, update ownership, and opt-in main/service telemetry. The earlier qualification artifact is unsigned; its media manifest reports distributionReady false. These implementation/evidence distinctions are recorded in the [acceptance audit](desktop-app-acceptance.md).

A source check on 2026-10-09 passed 74 desktop tests, 15 editor UI tests, three settings-placement tests and typecheck. These are bounded checks, not current packaged-build qualification. Worktree is dirty; HEAD alone does not identify these changes. Current UI changes have not been packaged. A disk preflight found approximately 1.8 GiB free and 12 GiB in the existing generated desktop workspace; no replacement build was attempted. Preserve the existing package while freeing sufficient build space; actual peak build usage has not been measured.

## Ordered release gates

| Gate | Work and evidence needed | Current status |
| --- | --- | --- |
| 1. Reproducible candidate | Free build space; freeze candidate source/dependencies; production build, package and hash manifest; inventory fonts, WASM, workers, source maps and bundled media tools. Run relocated-package verifier. | Pipeline exists; latest UI rebuild blocked by space. |
| 2. Clean-machine acceptance | Launch installed app without checkout/system Node. Open/create/reopen projects, managed import, missing/moved files, read-only storage, offline startup, sleep/wake and restart. Test both claimed architectures separately. | Prior relocated fixture is partial evidence; real clean Mac remains unqualified. |
| 3. Editing and playback | On synthetic fixtures test portrait/landscape, audio sync, seeks, pause/end/replay, GPU/fallback, alpha/captions, capture and matched preview/export. Exercise apply/reset/Undo and pending/stale proposal recovery. | Source tests and bounded native checks exist; full matrix outstanding. |
| 4. Codex | Test signed-in/signed-out/missing/incompatible CLI, model selection, stream/cancel/reconnect, context marks, stale revisions, crash and concurrent human edits. Keep project audit journals separate from sanitized telemetry. | Catalog/native read-only turn observed; broader recovery and editing qualification outstanding. |
| 5. Process/security | Review scoped bridge, sender/origin checks, loopback auth, CSP, navigation, packaged fuses, dependencies and all child-worker lifetimes. Load-test concurrent preparation and cancellation; measure startup/memory/dropped frames with declared fixtures. | Partial implementation and fixtures; remaining job ownership and measurements tracked in acceptance audit. |
| 6. Diagnostics | Verify main, renderer and service events against a local collector, then an explicitly configured Sentry destination; release tags and stack symbolication; redact file paths, prompts, tokens and media. Exercise offline delivery/failure. | Main/service bounded collector evidence; renderer/remote symbolication still unqualified. |
| 7. Distribution inputs | Inventory actual shipped binaries, dependency notices, FFmpeg build options/source obligations, fonts, examples and media permissions. Exclude personal assets, projects, journals and credentials. | Media manifest is not distribution-ready; this is a release blocker, not permission to change project media. |
| 8. Signed staged update | Maintainer Developer ID/notary setup and HTTPS channel feed; signed/notarized artifact; install on clean Mac; update version A to B preserving projects/profile; interrupted-download/install and recovery tests. | Configuration exists; credentials/feed and end-to-end qualification outstanding. |

Do not treat unit success, a development window or an unsigned local package as release acceptance. Keep each gate's commands, source hash, OS/architecture, results and limits with its artifact. Publishing remains a separate release decision.

## Header and viewer decision

- Project header: brand, project navigation, Editor/Generate/Storyboard, preview/export settings immediately before Export.
- Chat: Connect, model selection and Disconnect stay with the conversation. They operate that session, not the video or export. If the header later needs agent status, show one status entry that opens those existing controls rather than duplicating them.
- Viewer: existing previous/play-pause/next controls float at the bottom-center of the actual composition. No reserved transport row. Retain the source aspect ratio and maximize its fit; workspace orientation never rewrites output dimensions.
- Keep floating controls visible and keyboard-reachable in this iteration. Auto-hide requires pointer/focus/touch and accessibility acceptance before adoption.
- Settings retain capture/safe zones/playback options. The existing fullscreen player keeps its local controls; it must not depend on a header hidden behind fullscreen.

UI control movement changes presentation only; no frame timing, decode, effect or export algorithms were changed. Fresh visual playback checks are tracked separately from renderer conformance and release qualification.

## Next implementation priority

Finish the creation-versus-selection menu migration described in the menu QA before UI freeze: captions/text creation, transition/effect discovery, selected-object Properties. Repair missing public demonstrations with owned synthetic media. Each new home must have a working target/action and Undo, not just a rail icon. This is additional work, not part of the completed floating-control change.
