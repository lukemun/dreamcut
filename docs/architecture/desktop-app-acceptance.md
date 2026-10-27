# Desktop acceptance audit

Status: **incomplete**. This audit maps the accepted
[desktop plan](desktop-app-plan.md) to bounded evidence and remaining work. It does
not replace the plan, reduce its scope or authorize release publication.

The current local qualification bundle is DreamCut 0.1.0, macOS arm64,
Electron 44.7.0. Its release metadata uses channel `local` and `feedUrl: null`.
The media-tools manifest has `distributionReady: false`. Production compilation and
local packaging passed; one recent build needed a retry after a Next font-loader
failure. A successful retry is not proof of reliable offline builds.

## Requirement map

| Plan requirement | Established evidence | Still required |
| --- | --- | --- |
| Retain React/Next, file-backed projects and browser development | Shared application source; owned authenticated service; isolated production build and relocated import fixture | Native current-build acceptance and broader offline/write-failure cases |
| Development refresh and restart | Real service accepts authenticated HMR, rejects unauthenticated HMR, recompiles changed React/CSS and shuts down with the socket open | Visible refresh and component-state retention in Electron; main/preload restart; readable startup-failure UI |
| Window lifecycle and existing project playback | Earlier checks on two projects plus current packaged-build computer-use play/pause/seek/replay/end on an existing 31.3-second project; timeline bytes unchanged | Window close/reopen and recovery UI; resolve/qualify earlier seek warning and GPU fallback; audible synchronization |
| Package runtime without development tools | App, media tools and worker dependency traces; relocated import/preparation and MCP project-health instrument with empty HOME and bundled/system-only PATH | Clean Mac or stronger filesystem isolation; optional dependencies/native ABI; complete fonts/WASM/resource coverage |
| Native project/media opening and persistence | Native project chooser/open events, per-root sessions, remembered project and durable data paths implemented | Computer-use chooser/import, multiple roots, relaunch, read-only storage, moved/missing files and data-preservation scenarios |
| Managed preparation and crash cleanup | Stable preparation records; quit, service crash/retry and forced main-host crash fixtures; registered worker groups exit and original bytes survive | Remaining request-bound subprocesses and reusable still-worker ownership; all nested launches; sleep/wake and native recovery |
| Bounded scheduling and responsive editing | Existing queue owners; per-composition animation exclusion regression test | App-wide concurrency/progress/cancellation/retry policy; measured import/analysis responsiveness and resource use |
| Packaged animation runtime | Pinned CLI version and blank scaffolding through authenticated endpoint pass outside checkout; no package manager on PATH | Browser check/preview/render and optional model/cloud features; trace warnings do not establish support |
| Installed Codex discovery and constrained sessions | Installed CLI discovery, supported session adapter, scoped dynamic tools, streaming/resume/cancel tests, packaged transport host-crash cleanup and synthetic live proposal/image trials recorded in plan | Native connection, missing/signed-out/incompatible CLI flows; concurrent-human-edit/failure cases and broader visual-editing acceptance |
| Selection/marks/revision context and human approval | Context tools and journal correlation; packaged proposal fixture creates pending drafts/corrections, rejects missing targets, flags stale drafts and leaves timeline unchanged | Native selected-media/marks/playhead/generation-target end-to-end checks; no inference of approval from selection |
| Conversation recovery | Project lease and durable archive/reset owner; completed-journal reset and partial-reset tests; unknown outcomes remain blocked | Native reset/keyboard/fresh-eyes acceptance; explicit owner-backed resolution of unknown mutation outcomes |
| Matched picture rendering and playback | Shared renderer design and earlier bounded native playback evidence | Same-source browser/Electron seek/layers/GPU/source-proxy cases, matched engineering preview/export fixtures, HDR/alpha and actual performance measurements |
| Audio export and playback parity | Six mixer/manifest tests pass against relocated packaged code using bundled Node/FFmpeg: pitch/gain/sample length/tail/run boundaries | Audible playback, A/V synchronization and matched picture/audio output; mixer tests do not establish these |
| Sentry where supported | Opt-in field reconstruction and attachment removal tests; real main-process SDK event and packaged compiled service request hook verified through local collectors | Renderer capture and delivery limits; real service-route failure triggering; remote ingestion/symbolication if configured; native crash reporting remains unimplemented |
| Signing, notarization and update infrastructure | Build-time configuration, release metadata, signature-gated update owner and failure/drain tests; local build has no feed | Maintainer credentials/feed, actual signed/notarized build and staged two-version install/data preservation; media distribution prerequisites |
| Documentation, research and handoff | Migration plan, official-source research, development commands, limitations and this audit | Reconcile final qualification results; current-build native acceptance; final code/public-content review before PR/release readiness |

The documented 73 desktop unit tests are not substitutes for the unverified native,
performance, codec or signed-update cases above. The latest relocated fixture also
runs the six audio tests and animation scaffolding; those are separately scoped
checks, not additional native UI acceptance.

## Evidence owners

- `desktop/verify-relocated-package.mjs`: disposable relocated clone, empty HOME,
  bundled/system PATH; import/scaffolding, owned waveform decode, MCP project-health
  and packaged mixer tests. It explicitly
  reports that OS filesystem isolation and native-window qualification are false.
- `desktop/verify-dev-refresh.mjs`: real development-service transport/rebuild proof,
  with no claim about visual refresh or retained component state.
- `desktop/verify-host-crash.mjs`, `verify-service-jobs.mjs`: live fixture-owned
  process groups, lifecycle and preparation recovery. These do not cover every
  subprocess launched by the application.
- `desktop/verify-proposal-bridge.mjs`: packaged service/MCP proposal boundary;
  optional live Codex owner mode is a separate inference run.
- `desktop/verify-codex-crash.mjs`: forced Electron-host termination with a stopped
  protocol-only child, including optional packaged transport modules; no model run
  and no claim of provider-side cancellation or mutation reconciliation.
- `desktop/verify-telemetry.mjs`: synthetic main-process event to a local collector;
  no remote Sentry acceptance is inferred.
- `src/lib/render/audio-export.test.ts` and `audio-manifest.test.ts`: exact assertions
  for the packaged offline mixer check. Only test files are added to the clone;
  shipped runtime files are unchanged.

Raw fixture data and local logs stay out of public documentation. Re-run a check
when its implementation/dependencies or acceptance question changes; reuse evidence
only at its recorded scope. See the [development workflow](../development-workflow.md)
for commands and [implementation record](desktop-app-plan.md#research-application-and-observability)
for narrower results and known failures.

## What can proceed now

Waveform, beat-analysis, catalog-audio, caption and compound-preview text commands
now use desktop ownership in the rebuilt package. Lifecycle and real waveform/catalog
conversion tests pass; compound alpha/timing/receipt tests pass through ordinary and
desktop-owned execution. Caption shutdown refusal preserves timeline bytes and releases
busy state. The relocated fixture observes an owned waveform worker and nonempty
peaks. This does not qualify installed transcription/alignment prerequisites or all
remaining request-bound/nested launch sites.

Independent engineering remains possible: finish ownership of request-bound and
nested jobs, define global scheduling, qualify optional runtime dependencies and
review recovery/failure paths. These are unfinished implementation work, not failures
caused by the screen lock.

Native playback, audio, chooser, chat, recovery and fresh-eyes visual checks need an
unlocked Mac. Signing/notarization/update delivery additionally need the explicitly
documented maintainer prerequisites. Neither condition licenses claiming completion
from unit tests. Broader workspace/drawer redesign remains deferred until the
creator can try the desktop editor.

### Local instrument cleanup follow-up

The source helper runner now terminates its private POSIX process group on helper
exit and timeout. Five focused tests pass, including real nested processes retaining
stdout/stderr pipes. Forced MCP termination is now covered by the shared IPC-lifetime crash guard
(see the follow-up below). Session-wide ownership of independently detached jobs
and service-owned HTTP operations remains incomplete. The qualification app was rebuilt and the same five tests passed against its
relocated runtime, alongside import, waveform, animation scaffolding, MCP project
health and six audio-contract tests. No native-window or filesystem-isolation claim
is inferred.

MCP input closure now cancels active local helpers through an AbortSignal and
refuses launches after closure. Source tests cover cancellation with nested
descendants and pre-aborted admission; proposal-authority and capability catalog
regressions also pass. A real MCP EOF fixture also passes: an active helper and nested child stop, the
server exits, and no late result is emitted. The qualification package was updated
with the MCP source changes while retaining the verified frontend build. All six
helper/disconnect tests passed in the relocated packaged runtime, alongside the
existing import, animation, waveform, instrument and audio checks. This does not
establish cancellation of service-owned HTTP jobs or forced host death.

### Desktop service telemetry follow-up

The desktop service now selects a stricter Sentry error policy when the host sets
`DREAMCUT_SERVICE_ROOT`. It reconstructs a generic error with bounded numeric stack
locations; arbitrary messages, tags, user/context data and attachment hints are
excluded, and logs/transactions are disabled. The normal browser configuration is
unchanged. Seven observability tests and typecheck pass. A real Next.js SDK test
sends one synthetic error to a loopback collector and verifies no creator-text
sentinel, attachment, home path or hostname appears. Production build and packaging passed. The relocated verifier invokes the compiled
`register` and `onRequestError` hooks with a synthetic request failure and verifies
one reconstructed error at a loopback collector. It waits for the error envelope,
not the first SDK envelope. The source SDK is bundled by Next, so this check uses
the shipped instrumentation rather than requiring a development SDK import.
This establishes packaged hook delivery; actual failing-route triggering, renderer
capture and remote ingestion/symbolication remain unqualified.

### Remembered-project concurrency

Remembering a project now writes through an exclusively created, invocation-owned
temporary file before atomic replacement. Twenty simultaneous saves leave one
complete valid record, mode 0600; fixture timelines and a pre-existing legacy temp
symlink target stay unchanged, with no new temp files left behind. All 68 desktop
tests pass. The three project-opening tests also pass using the relocated packaged
host module, alongside the existing qualification checks. Native chooser/relaunch
acceptance and power-loss durability are not inferred from these filesystem tests.

The dotted-folder identifier mismatch is fixed in desktop chat/session ownership,
recipe compilation and video search. Validation follows the store’s 1–128 character
letter/digit/dot/underscore/hyphen contract, excluding dot and dot-dot. Seventy-three
targeted tests pass, including actual MCP recipe/search requests and traversal
rejection. Packaged chat/session/search fixtures pass alongside existing relocated
checks. Native chooser-to-chat visual acceptance remains unverified.

### Cancellation during send preparation

Desktop chat cancellation bypasses the serialized send queue. A stop during
connection startup invalidates that pending send; a stop during fresh-context
preparation prevents subsequent inference and model-call charging. Once a Codex
turn exists, the existing scoped interrupt path owns cancellation. Seventy desktop
tests pass, including pending-send/startup/context gates and a later successful
request. The chat/session tests also pass against the relocated packaged host.
This fixes cancellation delayed by a pending send/start acknowledgement, not a
claim that ordinary Send awaited the whole response. Native Stop-button acceptance
and provider-side cancellation of already-dispatched operations remain unverified.

### Window disposal during pending work

Window disposal now closes an active editing transport immediately before waiting
for its serialized queue, rather than placing cleanup behind a blocked Send.
Repeated disposal shares one completion promise and removes navigation listeners.
The editing owner checks closure after context/charge awaits so a late result cannot
start inference on a closed session. Seventy-two desktop tests pass; packaged
chat/session tests cover pending-send disposal and context closure with no later
model call. All relocated checks pass. This is lifecycle evidence, not native
Quit/close visual acceptance or a claim about arbitrary hung startup dependencies.

### Confirmed forced service shutdown

`stopDesktopService` now reports forced success only after observing the owned
UtilityProcess exit. A refused kill or absent exit after the separate bounded
force deadline rejects shutdown, preventing update installation from treating a
signal request as completed cleanup. All 73 desktop tests pass, including delayed
exit/refusal/deadline and existing update-drain gates. A real Electron utility
fixture also passes in source and in the relocated package. This does not qualify
signed installation, native Quit interaction or all descendant-process lifetimes.

### MCP helper crash ownership

Local helper groups register with the shared independent crash guard before work
proceeds. Its IPC lifetime survives an abrupt MCP-server death and removes the
registered group. The canonical modules now live under `mcp/`, with desktop
compatibility entry points and explicit canonical host packaging. Eighty targeted
tests pass, including real forced MCP termination with a helper and nested child.
The relocated package passes the same fixture and existing qualification checks.
This covers descendants remaining in the helper's private group; separately
detached children, service-owned HTTP jobs and full host-death scenarios remain
separate qualifications.

### Shared guard regression qualification

After moving crash cleanup to the canonical shared modules, the real Electron host
crash fixture passed against the current packaged service: the service and stopped
media-worker group exited. The Codex crash fixture passed against packaged transport
modules with a protocol-only child and zero model calls. Separate service-crash and
graceful-quit fixtures both relaunched, retried preparation to ready and preserved
original source bytes. These fixture hosts use the installed Electron runtime with
packaged service/transport code; they do not establish current native app-window
playback, audible synchronization or signed-update behavior.

### Packaged import write failures

Real read-only media and project directories now have endpoint-level qualification
in the relocated package. Both failures leave the timeline, source manifest and
media directory unchanged; restoring write access allows one successful retry with
exactly one added asset. This exposed and fixed unregistered copies after manifest
commit failure. Source tests also preserve media when rename succeeded before a
late flush error and verify path retry reuse. Five ingestion tests, typecheck,
build, packaging and registry checks pass. Unreadable/ambiguous manifests retain
media conservatively; arbitrary post-commit processing failures and power-loss
recovery remain separate cases.

### Queue startup deduplication

Preparation and import queues now reserve their absolute queue path in the service
process before spawn, retaining it until child exit/error. This closes the window
before the child's disk lock exists without adding another persisted queue. Source
and packaged tests observe four launches for 400 requests across four project/queue
combinations, explicit retry after failure, and replacement safety against late
exit events. The real preparation fixture, typecheck, build and tool checks pass.
Global concurrency across workspaces, progress/cancellation policy and measured
playback responsiveness under load remain open; this startup bound does not prove
those broader requirements.

### Current native playback QA — 2026-10-09

Launched the current qualification bundle through computer use after quitting the
older build. The native folder chooser opened; automated path entry repeatedly
reset, so the creator completed folder selection. The chosen existing 31.3-second,
134-item project opened in its own managed service. Computer use verified play,
advancing pictures and captions, pause holding its position, backward seeking,
Home/End seeking, replay from the end, and automatic stop at the final frame.
A final click seek left the project paused midway. No fallback banner or media
warning appeared in the observed states. This is bounded interaction evidence,
not a frame-rate benchmark or explicit GPU-path qualification.

The timeline SHA-256 remained unchanged before and after the checks. Screenshot
evidence is retained locally outside the repository. Audio audibility and A/V sync
were not evaluated. The frame-state attempt could not reach the development
render-frame endpoint on port 3123; no new spatial/appearance-quality qualification
is claimed. UI redesign remains deferred.

### Native chat connection repair (2026-10-09)

The native Connect button exposed two startup issues in a project beneath a coding repository. The restricted editing session now disables inherited AGENTS.md loading (`project_doc_max_bytes: 0`), using the host’s editing instructions and tools instead. Configuration discovery includes the actual project cwd, so project-level MCP servers are disabled alongside global servers before the session is exposed. Read-only filesystem, disabled network and the unexpected-tool inventory check remain enforced. A real no-inference connection with the editing bridge succeeded; focused policy/session/IPC regression checks passed. Independent native UI retry then confirmed an editable composer and Disconnect after one Connect click. No prompt was sent; model-turn quality remains untested by this check.

### Native read-only chat and audit check (2026-10-09)

A bounded native chat request read the current project duration and returned 31.3 seconds. Working state cleared and the composer re-enabled. The app-owned checkpoint recorded one model call and three completed tool calls (two timeline reads and a feedback check), with before/after dispatch records and saved results. The project timeline hash was unchanged. This verifies a read-only turn and local audit persistence, not proposal-creation quality or remote audit upload. Conversation text remains in the linked Codex session; app-owned proposal/history records remain in the project. Raw local journals can contain project context and are not a sanitized upload artifact.

### Codex model selection

The desktop session exposes a bounded, paginated `model/list` catalog after connection. The renderer receives only model IDs, display labels and the effective/default selection. Sending carries text plus an optional catalog model ID through the existing scoped IPC and editing-session owner. The Codex adapter validates the ID before `turn/start`; sandbox, approval policy, dynamic tools and project ownership remain host-owned. Test coverage includes invalid model rejection and unchanged turn permissions. No model inference is needed to test catalog discovery or picker navigation.

## 2026-10-09 release-readiness follow-up

The [release gate plan](desktop-release-readiness.md) separates the existing local qualification package from a public distributable. Source verification passed typecheck, 15 editor UI tests, three settings-placement tests and 74 desktop tests. Independent visual acceptance at 1280×720 verified floating playback controls in both editor layouts, header settings placement, keyboard focus, play/pause and edit-point navigation. Expanded preview retains its existing controls. These checks do not establish audiovisual synchronization or packaged-build acceptance.

The current UI has not been rebuilt into the package: disk preflight found approximately 1.8 GiB free, with the existing generated desktop workspace occupying approximately 12 GiB. No replacement build or cleanup was attempted. Existing signing, clean-machine, distribution-license, remote telemetry and update qualification gaps remain open.
