# Solo development

`lukemun/DreamCut` is the single repository for everyday editor development, on `main`.

Direct pushes to main and short branches with pull requests are both supported. A second human approval
is not required by this workflow. Use a PR when you want a reviewable change or remote test results.

Keep personal notes and paid course drafts in `private/` or `personal/`, video projects in `projects/`,
and personal media in `library/`. These folders are ignored and also rejected if force-added to Git.
Keep API credentials in environment variables or ignored `.env` files. Use placeholder values in `.env.example`.
Ignored files need separate backups. Git cannot infer whether arbitrary prose, screenshots or source code
contains private information: review the staged diff before committing those materials.

Install Gitleaks 8.30.1, then enable local checks once per clone:

```sh
git config core.hooksPath .githooks
```

Pre-commit checks examine staged content and run the native code review on the changes the commit records, including
advisory quality and performance notes (Claude Code reviewer); pre-push checks
examine the history of each branch or tag being pushed, including files added and subsequently deleted since the destination revision, then run the
native review against `main`. Both direct pushes and PR pushes use the same hook. Set `DREAMCUT_REVIEW_BASE` when a
branch should be reviewed against another base. The reviewer is Claude Code with Opus (`DREAMCUT_CODE_REVIEW_TOOL=codex`
uses Codex). If the local reviewer session is unavailable, the explicit one-shot
escape hatch is `DREAMCUT_SKIP_CODE_REVIEW_HOOK=1`.
GitHub repeats the history scan on pushes and pull requests. That remote scan happens after upload;
it cannot prevent disclosure. Hooks can be bypassed and do not follow a clone automatically.

If a secret is committed locally, remove it from every affected local commit before pushing. If already
pushed, revoke or rotate the credential first. History rewriting can remove files or replace text in
the repository, but cannot recall other people's clones, forks or screenshots. GitHub may need to help
remove cached views and PR references. Deleting the latest file or adding an ignore rule is insufficient.

See GitHub's [sensitive-data removal guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Public documentation boundary

Keep `docs/` focused on product usage, contribution, durable standards, architecture, and directly relevant technical research. Keep competitor/editor evaluations, internal UX reviews and screenshots, personal project incidents, local workspace migrations, raw test receipts, and unadopted business or licensing drafts in ignored `private/`. Extract reusable requirements into their existing owner before removing a record. Published benchmarks need reproducible methods and explicit scope. Media needs a recorded public redistribution basis; workshop permission or attribution alone is insufficient. Repair incoming links when retiring a document.

Privacy scanning excludes the already-published destination ancestry on pushes. CI uses the push-before or PR-base revision. Every outgoing commit still contributes its complete file tree and blob contents, including subsequently deleted files; changing ignore rules cannot hide new outgoing artifacts. Manual scans can use `node scripts/check-private-files.mjs --base <published-sha>` or omit the base to inspect all history.

## Desktop development direction

The [accepted desktop migration plan](architecture/desktop-app-plan.md) targets a
macOS-first Electron app while retaining the existing React/Next.js editor and
browser workflow. The initial development shell is implemented; installers are not available yet.

For bundled English dictation, run `pnpm desktop:voice` once on the target host, then `node desktop/verify-voice.mjs`. See [local dictation and Windows qualification](architecture/local-dictation-windows.md) for prerequisites, the macOS/Windows CI workflow and remaining Windows release blockers.

Run `pnpm desktop:dev` to start an Electron window and its own authenticated local
Next.js service. Its `.next-desktop-dev` build directory and automatically assigned
port keep it separate from `pnpm dev`. Run `pnpm desktop:check` for service-boundary
tests. `pnpm install` permits the pinned Electron package to download its runtime.

`pnpm editor:build` builds the production editor (served by the packaged runtime download and the
desktop app) in `.desktop-build/source` from an explicit application
source list and cloned dependencies. It excludes workspace media and private dotenv
files, clears inherited build configuration except basic system paths/locale, and
disables webpack's disk cache. It currently requires macOS clonefile support.
`pnpm desktop:package` stages that build and creates a local unsigned application;
bounded package qualification is recorded in the desktop plan; clean-Mac and signed-release acceptance remain pending. Do not distribute these development builds.

Packaged projects and media catalogs default to the application's user-data directory,
outside the replaceable app bundle. Set `DREAMCUT_WORKSPACE_ROOT` in the launch
environment to reuse an existing workspace's `projects`, `catalogs/sfx`,
`catalogs/music`, `catalogs/images` and `catalogs/visual` directories. Existing per-library
`TIMELINE_*_DIR` overrides take precedence. This is currently a launch configuration;
a native workspace picker remains to be implemented.

Desktop startup discovers installed Codex through an explicit
`DREAMCUT_CODEX_EXECUTABLE`, absolute PATH entries, or standard user/Homebrew install
locations. It checks `--version` and `login status`, with bounded subprocesses,
and passes the discovered path to the existing worker adapter. It does not read
credential files, return account identifiers or start a model run. Discovery is
implemented; an interactive desktop Codex session and its approval boundary are
still pending qualification.

Quit requests now ask the owned service to stop, allow in-flight HTTP responses to
finish, and flush opted-in desktop error telemetry. Shutdown is bounded so a stuck
service cannot indefinitely prevent quitting. `pnpm exec electron
desktop/verify-service-lifecycle.mjs <packaged-service-directory>` verifies startup,
unauthenticated request rejection, graceful service exit and port closure using
Electron's real utility process and disposable data. Background-job drain/recovery
remains a separate migration requirement.

The Electron service sets `ELECTRON_RUN_AS_NODE` for its child environment so
existing `process.execPath` worker launches use Electron's Node mode. Packaging
includes worker scripts, MCP support modules and the complete `tsx` loader.
`pnpm exec electron desktop/verify-worker-runtime.mjs` checks TypeScript execution
and prepares a synthetic one-second video against the staged service. It verifies
30 output frames, duration, decoded non-silent audio, unchanged source bytes and
lock release in disposable data. Its minimal input PATH exercises desktop discovery
of installed macOS media tools. The verifier can use the bundled FFmpeg/ffprobe directory described below;
without that argument it may discover installed media tools. This does not qualify HDR, alpha, job recovery or audible output. This approach
depends on the `runAsNode` fuse remaining enabled; see
[Electron environment variables](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node).

The development window uses the existing Next.js refresh machinery.
`pnpm exec electron desktop/verify-dev-refresh.mjs` starts the actual desktop service
with a disposable React/CSS fixture. It checks the authenticated `/_next/hmr`
connection, rejects an unauthenticated connection, observes successful rebuilds,
reads changed React markup and the newly linked stylesheet, and verifies graceful
shutdown with the refresh connection open. This establishes server/transport behavior;
visual refresh and component-state retention in the native window remain unverified.
The fixture is removed afterward and does not touch editor source or user projects.
Main/preload and background-service changes need process restart; packaged release changes need a rebuilt application. The packaged
app will manage its own local service and runtime rather than require a terminal
or a developer checkout. Add verified commands here as implementation lands.

Desktop observability: launch with `SENTRY_ENABLED=1` and `SENTRY_DSN` to enable
main-process error reporting; `SENTRY_ENVIRONMENT` labels the environment. These
variables must be present in the Electron launch environment; desktop main does not
automatically load Next.js dotenv files. Existing Next.js reporting keeps its own
configuration. `pnpm exec electron desktop/verify-telemetry.mjs` checks a synthetic
event through the real SDK with a local transport and sends nothing remotely.
Native crash dumps, screenshots, automatic breadcrumbs and desktop tracing are off.
See the [sourced desktop findings](research/2026-10-08-desktop-media-stack.md) and
[implementation decisions](architecture/desktop-app-plan.md#research-application-and-observability).

For the desktop preparation lifecycle check, run
`node --import tsx desktop/verify-managed-preparation.mjs`. It creates disposable
synthetic video, launches the real preparation queue through desktop ownership,
interrupts it, retries through a fresh owner and checks readiness, source hashes
and lock cleanup. It requires FFmpeg on PATH and does not use existing projects.
The desktop owner currently covers media preparation; other background launchers
still require integration. This source-level check does not replace packaged-app
qualification after rebuilding.

After rebuilding and staging, run
`node_modules/.bin/electron desktop/verify-service-jobs.mjs .desktop-build/stage/service`
to exercise the compiled media-preparation route, service quit with active work,
and retry after service relaunch. It uses only disposable synthetic media and checks
original-byte preservation. Direct desktop launches now also own import, generation,
instrument, cutout, agent-preparation and visual-analysis workers. Independently
detached descendants and abrupt service-crash cleanup still need qualification.

Append `--crash` to the service-jobs check to forcibly kill the owned Electron
utility service with SIGKILL. The shell-side worker guard must remove its registered
worker group before a fresh service retries the fixture. This is a real abrupt-exit
check, distinct from calling the utility process's normal termination method.

The desktop shell provides **File → Open Project…** (⌘O). Choose the folder holding
`timeline.json`; the project opens in place. Another project root uses a separate
window/service, so its local work does not stop jobs in the earlier workspace.
Closing a window on macOS retains its service until Quit. Each service has a separate
browser session so its local authentication cookie cannot overwrite another's.
The last selected project is stored in `last-project.json` under Electron user data;
missing or invalid remembered paths fall back to the configured default workspace.
This native-opening implementation still needs the recorded computer-use acceptance
checks before it can be called qualified. Media import continues through the existing
editor flow; no native media-picker integration is claimed yet.

`node_modules/.bin/electron desktop/verify-media-import.mjs .desktop-build/stage/service`
checks Library's compiled upload endpoint with disposable still, audio and video
fixtures. It verifies copied bytes, provenance, video readiness and an unchanged
timeline, including a workspace path with spaces and Unicode. Optional model analysis
is disabled for this check and remains queued. The existing Library → Import media
file input is the native chooser entry point in Electron; its actual dialog and shelf
interaction require a separate computer-use check.

`node desktop/verify-relocated-package.mjs` also exercises fixed-helper command
selection, output bounds and nested-process cleanup using the packaged runtime.
These checks cover helper exit/timeout and real MCP input-disconnect cleanup,
plus forced MCP-server death for registered helper groups. Separately detached
children and cancellation of service-owned HTTP jobs remain outside that proof. It checks the qualification app from a
temporary location outside the checkout, with an empty HOME and only bundled/system
tools on PATH. It substitutes only the clone’s entry point with the import fixture;
the packaged service and workers stay unchanged. This caught a missing transitive
worker dependency that in-checkout tests masked. Packaging now uses an esbuild
TypeScript graph to discover worker package imports before NFT traces their runtime
files. The verifier checks media readiness, original hashes and timeline preservation.
It also checks the pinned animation CLI version, creates a blank animation through
the editor endpoint, and runs the six audio mixer/manifest tests with bundled Node
and media tools. It also prepares waveform peaks through the authenticated endpoint
and checks that decoding registers with the desktop worker owner. Only test files are added to the disposable clone; its runtime code
stays unchanged. Audio export tests do not establish audible playback or A/V sync. It does not prove animation preview/render, OS-denied repository
access, clean-Mac installation or native-window playback. A nested macOS sandbox attempt was rejected by Chromium; its sandbox was
not disabled to make that test pass.

Desktop staging now copies the installed macOS FFmpeg/FFprobe dependency closure
into `media-tools`, rewrites library references and signs the copied files for local
QA. It records original and bundled hashes, build configuration and available notices.
This does not modify Homebrew's files. Packaged launches prefer these tools on PATH.
To verify preparation without Homebrew executables, pass the staged bin directory as
the third argument to `desktop/verify-worker-runtime.mjs`; the verifier limits PATH
to that directory and system tools. This bundle is marked **not distribution-ready**:
its GPL-enabled FFmpeg and dependency source/notices need a release audit before
publication. The current goal does not authorize publishing a release.

Use `node desktop/package.mjs --qualification` to build a fresh app under
`.desktop-build/qualification-apps/` while leaving a running app in
`.desktop-build/apps/` intact. Pass the resulting app's `Contents/Resources/service`
to the service/import verifiers, and its `Contents/Resources/media-tools/bin` to the
worker-runtime verifier. These tests exercise the packaged resources; they do not
replace opening the resulting app and checking native menus, playback and dialogs.

`node desktop/verify-codex-connection.mjs` checks installed Codex through the
documented stdio app-server protocol: initialization, account readiness and model
availability only. It starts no inference turn and prints no account identifiers.
The host-only connection is not a renderer bridge or an editing authority. Do not
expose its generic request method to web content; the future editing adapter must
scope thread ownership, project context, tools and permission settings first.

`node desktop/verify-codex-session.mjs` additionally runs small synthetic model
turns in a disposable directory using the installed account. It checks streamed
output, durable thread resume and cancellation, then archives its own test thread.
Unlike the readiness check, this consumes inference. It never opens a user project.
Cancellation waits for `turn/started`: a successful `turn/start` response can arrive
before the turn is active. The test requires a terminal `interrupted` notification.

The session policy was qualified with CLI 0.162.0. It uses the experimental named
permission-profile API, restricts filesystem reads to the project and CLI runtime
plus the CLI's minimal system set, disables network execution, shell tools, apps,
plugins, web search and inherited MCP servers, and rejects host approval requests.
The CLI executable is resolved through symlinks before launch. Unknown MCP config
key syntax fails closed. These restrictions are engineering groundwork; they do
not yet provide the project-scoped proposal bridge or desktop chat integration.

`node desktop/verify-codex-adapter.mjs` qualifies the higher-level send/cancel/close
adapter using two synthetic turns in a disposable directory. It checks streamed
output, persisted ownership, close/reopen/resume and restored visible messages,
then queued cancellation
through the public adapter methods, verifies zero
tool calls, and archives its own test thread. This also consumes inference. The
adapter has a five-minute response deadline and closes on disconnect or ambiguous
start acknowledgement; it never automatically retries a message.

The host can supply its app `userData` directory to retain one Codex thread ownership
record per canonical project path under `codex-sessions/`. Records use private file
permissions and atomic replacement; they contain no message content or credentials.
Do not accept this directory or arbitrary thread IDs from renderer input. Missing or
invalid saved sessions surface an error instead of silently switching conversations.

`node desktop/verify-codex-tools.mjs` runs two synthetic inference turns through the
session adapter, real editing MCP subprocess and a private synthetic HTTP service.
It registers only timeline_get, verifies a random tool-only value reaches the
model's reply, checks two completed journal records across reconnect/resume, then
archives its test thread and removes its fixtures. It does not open or edit any
real project. Tool registration fingerprints must match when resuming a session;
unknown journal outcomes require reconciliation rather than automatic replay.

`node_modules/.bin/electron desktop/verify-proposal-bridge.mjs [service-root]`
checks the proposal transport against a compiled Electron service (default:
`.desktop-build/stage/service`). It seeds a disposable synthetic project and calls
the existing proposal tools through authenticated MCP plus the Codex tool bridge.
It verifies pending creation, missing-target rejection, stale-draft flagging,
linked correction, unavailable approval and a byte-identical working timeline.
There is no inference, user-project edit or human-approval simulation in this test.

Packaging copies staged service and media resources with APFS copy-on-write copies
on macOS, then resolves package links. This reduces temporary disk duplication while
keeping the app independent of the staging folder. The tool registry is an explicit
runtime resource; tracing only the Next server does not include the MCP catalog.
The proposal verifier loads MCP from the supplied service root, so use the built
app's Resources/service path to verify packaged dependencies rather than checkout
imports.

Add `--codex-owner` to the proposal-bridge verifier with a packaged Resources/service
path to test the combined owner and versioned editing instructions. This optional
mode consumes inference: installed Codex prepares a synthetic pending volume
proposal, and the verifier checks feedback capture, journaled creation and unchanged
timeline bytes. It archives its own thread afterward. The deterministic default
mode still makes no model calls.

### Desktop signing and channel configuration

The packager writes non-secret `Resources/app/release.json` with the application
version, macOS architecture, channel and update feed. The default channel is
`local`, with no feed. Preview/stable metadata enables the native DreamCut → Check for Updates…
action only in a matching packaged macOS build. There are no background checks.
The app verifies its Developer ID signature before contacting the configured feed.

For a future signed build, set `DREAMCUT_SIGN_IDENTITY` to the installed Developer
ID Application certificate identity and run `node desktop/package.mjs
--qualification --sign`. Signing occurs after copied resources and symlinks are
final, includes bundled media binaries, enables hardened runtime and runs a strict
signature verification. This path has not been exercised with a Developer ID.

Adding `--notarize` requires `DREAMCUT_NOTARY_PROFILE`, an existing macOS Keychain
profile for Apple's notarytool. That command uploads the app to Apple, waits for
notarization and validates its stapled ticket. It is an explicit release-preparation
operation; ordinary local packaging never uploads or signs with an account.
Certificate identities and profile names are build inputs and are not embedded in
release metadata. No credentials are requested or stored by this script.

`DREAMCUT_RELEASE_CHANNEL=preview` or `stable` requires `--sign` and an explicit
`DREAMCUT_UPDATE_FEED` HTTPS URL for that channel and architecture. URLs containing
credentials, queries or fragments are rejected. No production endpoint is assumed.
A signed build alone is not distribution clearance: the bundled FFmpeg dependency
manifest still reports incomplete source/notices qualification. No publication is
performed. Maintainer prerequisites remain a Developer ID certificate, notarytool
Keychain profile, reviewed media dependency obligations and a controlled update
host. Signed two-version update/data-preservation qualification is still required.

Implementation follows Electron's [code-signing guide](https://www.electronjs.org/docs/latest/tutorial/code-signing)
and [updater contract](https://www.electronjs.org/docs/latest/api/auto-updater).


The native updater asks before checking because Electron downloads an available
update automatically. A downloaded update offers Later or Restart Now and also
installs on the next normal launch. The host drains its Codex sessions, local
services and owned jobs before calling quitAndInstall. Repeated check/install
requests are coalesced; failed checks allow a manual retry. Messages do not display
server response bodies, local paths or signing diagnostics. Unsigned local builds
show that updates are unavailable and make no update request.

Updater controller tests cover matching release metadata, signature failure,
duplicate checks, download/error states, shutdown ordering and failed shutdown.
They use an injected updater and do not establish a signed two-version update or
preservation of actual user files through installation. Those checks, native-menu
visual acceptance, and hosted feed qualification remain outstanding.

### Starting a fresh desktop conversation

Chat → New conversation retains the prior Codex conversation and moves its local
ownership/journal records into `codex-conversation-archives` under app userData.
It does not alter the project or approve/reject proposals. After confirmation,
Connect to Codex starts a fresh conversation. This supports completed conversations,
exhausted conversation budgets and incompatible instruction/tool versions.

A live writer blocks the action. A tool call cut off mid-flight (crash or dropped
connection) is settled as `unconfirmed` when the creator reopens the conversation,
never as run or not run. The next message tells the agent which calls may or may not
have taken effect and to check current state before repeating them. Desktop tools only
stage reviewable work, so the residual risk is a duplicate draft, not an applied edit. A partially completed archive leaves a reset marker, and reconnection
asks the creator to finish New conversation. Source audit bytes are retained. This
protocol assumes one Electron host for that userData location; independent external
writers are not coordinated by its in-process ownership lease.

### Agent session health

Local only; not run in CI. `pnpm agent:health` needs no model or editor: it drives the
real harness MCP client, MCP server, journal and tool bridge with common model mistakes
and an interrupted call, and fails if any mistake throws instead of returning a tool
error or leaves the conversation unable to continue. `pnpm agent:smoke` (with `pnpm dev`
running) runs the signed-in Claude Code and Codex sessions on a disposable
`zz-agent-smoke` fixture: a frame check, a proposal, and a dropped connection followed by
another message. Each case must complete with nothing pending or unknown in the journal.
Options: `--provider claude|codex`, `--model <name>`, `--case frames|proposal|interrupted`.
Results go to `private/agent-smoke/`. Run both before cutting an installer.

### Desktop telemetry qualification

`node_modules/.bin/electron desktop/verify-telemetry.mjs` runs the real Electron
Sentry SDK against a temporary loopback HTTP collector, using synthetic private
sentinels only. An optional argument selects a packaged `Resources/app` directory.
No external Sentry DSN is used. The verifier initializes before Electron's ready
event, verifies opt-out, then checks the transmitted event envelope for excluded
context, attachments, home paths and host identity.

The capture boundary strips attachment hints as well as sanitizing event objects:
attachments are separate envelope items and are not removed by event-field
reconstruction alone. The shared Next.js browser/server policy does the same for
errors and transactions. This local collector test covers explicit main-process
error capture; it does not establish remote ingestion, source-map symbolication,
renderer/service capture, native-crash delivery or a guarantee for arbitrary future
integrations that bypass the configured capture path.

`node desktop/verify-host-crash.mjs [service-directory]` launches a disposable
Electron host, starts and suspends an owned preparation worker, forcibly terminates
that host, and checks that its service and worker group disappear. The test retains
only IDs reported by its own live fixture and cleans up its generated files. The
service’s independent cleanup process uses private IPC lifetime rather than persisted
job PID files, so it can clean up when Electron tears down the service after a host
crash. Normal service-crash/retry coverage remains in `verify-service-jobs.mjs`.

Animation actions use the bundled Node runtime and pinned HyperFrames CLI directly,
without requiring a separately installed package manager. HyperFrames telemetry and
skill updates are disabled in that launcher. Blank scaffolding has passed in the
relocated-package fixture; browser-based checks, preview and rendering still need
separate dependency and lifecycle qualification.

`node desktop/verify-codex-crash.mjs [packaged-app-resources/app-directory]`
starts an Electron host with a protocol-only child, suspends that child’s group,
terminates the host and waits for the group to disappear. It exercises the same
Codex transport cleanup owner without an account or inference. The optional path
selects packaged transport modules. This is distinct from provider-side cancellation
and does not clear or reconcile uncertain tool outcomes.

Packaged MCP local helpers use a fixed script-path allowlist with the current runtime
and tsx, rather than package scripts. The desktop editing owner supplies only basic
host runtime fields, including bundled media-tool PATH. The relocated fixture checks
project-health through the actual MCP connection and existing argument restrictions.
That result does not establish frame-state browser authentication or all helper
runtime dependencies.


Desktop service telemetry uses `desktopServiceSentryOptions` when the host supplies
`DREAMCUT_SERVICE_ROOT`, retaining explicit `SENTRY_ENABLED=1` plus `SENTRY_DSN` opt-in.
It reports reconstructed errors without arbitrary error text or tags; logs and
transactions are disabled in this mode. Run
`node --import tsx --test src/lib/observability/desktop-service-sentry.test.ts`
for a synthetic real-SDK loopback-collector check. This proves the policy’s SDK
envelope behavior, not actual Next request-hook capture or remote Sentry delivery.


`verify-relocated-package.mjs` also runs `verify-service-telemetry.mjs` with bundled
Electron in Node mode. It loads compiled Next instrumentation, calls the actual
registration/request-error hooks with synthetic data, and waits for the sanitized
error at a loopback collector. No external DSN is used. This qualifies compiled
hook delivery rather than a real failing-route trigger or renderer capture.


`node_modules/.bin/electron desktop/verify-service-stop.mjs` starts an isolated
unresponsive utility process and verifies that forced shutdown waits for its exit.
The relocated-package verifier runs this fixture with the packaged host module too.
It does not manipulate a user's editor service or project. Unconfirmed termination
rejects shutdown so update installation cannot continue on that result.

For local DMG creation and tests against an installed app, use [local installer builds and acceptance](architecture/local-installer-testing.md). `pnpm desktop:installer --app <DreamCut.app> --qualification` makes a local QA disk image after packaging; `pnpm desktop:verify-installed <DreamCut.app> [upstream-jfk.wav]` checks the bundle and native media tools. These commands do not publish or certify a release.
