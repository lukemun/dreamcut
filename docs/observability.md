# Local diagnostics with Sentry and OpenTelemetry

For the proposed task-level activity journal, multimodal input evidence, and its
boundary with edit history, see [agent activity architecture](architecture/agent-activity.md).
That design is not implemented by the monitoring configuration below.

Release builds report errors and bug reports to DreamCut's Sentry project: `pnpm editor:build` compiles in
the public settings from `packaging/release-telemetry.json` (production environment, 10% of traces,
release `dreamcut@<version>`), and the server falls back to those compiled values when it runs. When
`SENTRY_AUTH_TOKEN` is set on the release machine, the build uploads source maps for that release so stack
traces read as source; the maps are deleted before packaging and never ship. The builder's
own environment and `.env.local` are never used for a release. In a checkout, remote Sentry telemetry is
disabled unless explicitly enabled: copy the Sentry entries from `.env.example` into ignored `.env.local`,
supply your project's DSN for both runtimes, and set both enable flags to `1`, then restart the dev server.
The DSN is an ingestion address, not an administrative token.

The Next.js Sentry SDK owns the server OpenTelemetry provider and exports to Sentry.
Custom application spans use `@opentelemetry/api`. Do not register another OTel provider or
OTLP exporter: that would compete with this provider or duplicate events. Next requests and
browser navigations are automatically instrumented. Custom spans currently cover timeline
reads/writes, caption transcription/alignment and exports. Managed CLI/Python subprocesses
are timed by their parent operation, not internally instrumented. Agent applications running
outside this process are not instrumented by this setup.

Errors include uncaught server/client failures and unhandled promise rejections, Next.js
request and route-handler errors, React root errors and the shared editor error reporter.
When the graphics card preview falls back to Browser, the first failure of each kind per page
load is reported with its original error, the GPU worker's stack, a `gpu_failure` tag
(`admission`, `device-lost`, `timeout`, `unavailable` or `runtime`) and the graphics adapter's
model and driver strings. Admission failures (a scene feature the GPU path cannot draw yet)
are warnings; the rest are errors. Structured operation success/failure logs go to Sentry.
Raw console output is not forwarded.

A fifth of errors is sent (`sampleRate` 0.2), enough to see what fails and how often; a
new issue can take several occurrences to reach Sentry. Traces default to 100% under `pnpm dev` and 10% otherwise, enough to find slow
operations without paying for every request; override with `SENTRY_TRACES_SAMPLE_RATE` and
`NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`. Sampling covers instrumented spans, not every editor
frame, and is not an abuse-prevention boundary.

Session replay buffers the last minute of the browser editor in memory and is sent only with
a sampled error or when the creator sends Report a bug (`src/app/BugReportButton.tsx`, which
uses Sentry User Feedback and appears only where Sentry is enabled). Every report carries the
replay; the form has no option to leave it out. It records layout and
clicks, not media: inputs and editable text are masked; video, audio, canvas, images, iframes
and anything marked `data-replay-block` are recorded as empty boxes; `data-replay-mask` hides
other text; network bodies are not captured. Other on-screen text, such as project and clip
names, is visible in a replay. `REPLAY_PRIVACY` in `src/lib/observability/sentry-options.ts`
owns these rules. With a project open, the report form also offers "Attach this project's session
evidence", off for every report: when ticked it lists, before Send, what the attachment will hold
(the last 50 editing-memory events, that day's agent tool calls and tool signals for the project,
proposal ids and statuses, proposal timing attempts, the motion-graphic audit), read from local files
by `GET /api/projects/<id>/session-evidence` (`src/lib/observability/session-evidence.ts`) with
absolute paths replaced. It never includes an outside agent's conversation (Claude Code, Codex),
media, timelines, prompts or credentials; its purpose is a retro of an agent session from the report
alone. The editor does not install a standalone collector, profiling or OTLP
metrics exporter.
The optional local Codex log collector described below is a separate process, not a second
OpenTelemetry provider inside the editor.

Request bodies, cookies, headers, AI content, local variables and source context are disabled.
Last-mile hooks remove request objects, arbitrary extras, breadcrumbs, private contexts and
sensitive fields, the machine's host name, and redact URLs, private file and home paths
(macOS, Linux, Windows and `~`), media file names, query strings and credential patterns.
Stack frames keep only their app-relative location (`app:///_next/...`, `app:///src/...`,
`app:///node_modules/...`) so traces stay readable and source-mappable; page URLs, which can
name a project, become `app:///[page]`.
Never attach media, timelines, transcripts, prompts or command arguments to spans/logs/errors.
Scrubbing is defense in depth, not permission to log arbitrary user content.

Source-map upload is disabled unless a private `SENTRY_AUTH_TOKEN` is configured. An upload
token is never exposed through NEXT_PUBLIC variables or committed. Third-party SDK build
telemetry is disabled. Source maps may contain source code; enabling upload is a separate
maintainer choice.

Local configuration and the Sentry project do not opt other users into remote telemetry.
To stop this install's telemetry, set both enable flags to `0` and restart/rebuild.

## Electron desktop coverage

The desktop main process has a separate, opt-in Sentry owner in
`desktop/telemetry.mjs`. Enable it with `SENTRY_ENABLED=1` and `SENTRY_DSN` in the
Electron launch environment; main does not load `.env.local`. Existing Next.js
instrumentation continues to own web client/server events.

Desktop events report fixed operation names for startup, service failures, window
loading and renderer termination, plus uncaught exceptions and rejected promises.
The event policy reconstructs allowed fields, replaces exception text and strips
arbitrary context and file paths. Default integrations, screenshots, native dumps,
breadcrumbs, logs and performance tracing are disabled. This does not provide
internal instrumentation of media workers, worklets or native subprocesses.

`pnpm desktop:check` tests the event policy. Run
`pnpm exec electron desktop/verify-telemetry.mjs` to exercise the installed Electron
SDK with a local transport and synthetic private content. These checks have passed;
remote Sentry delivery and packaged-app telemetry remain unverified. See the
[research findings](research/2026-10-08-desktop-media-stack.md) and
[desktop implementation plan](architecture/desktop-app-plan.md#research-application-and-observability).

## Selected-tester rollout

Ship only the instrumentation and blank/off example configuration. Never include the maintainer's
DSN, organization or project ID in source, docs, release bundles or prebuilt browser assets.
Build public releases without the private environment files: NEXT_PUBLIC values are compiled
into JavaScript. Give selected testers separate Sentry client keys through a private channel;
revoke them individually when necessary. A distributed DSN is inspectable and copyable, not a
secret. Client sampling reduces normal traffic but cannot stop a modified client from sending
more. Sentry client-key rate limits cap errors; do not assume those limits also cap spans/logs.
Configure the applicable Sentry-side product quotas separately before a broader rollout.


## Local Codex model monitoring

Codex's native OpenTelemetry exporter supplies model usage and tool events. We use the
standard **OpenTelemetry Collector Contrib** OTLP receiver, transform processor and file
exporter to keep them local. DreamCut only supplies configuration and a read-only summary;
it does not infer tokens from console text. Native session checkpoints provide a separate, explicitly selected reconciliation source; the two sources are never added together.

This implementation covers Codex response usage and standard GenAI inference log events. Project/proposal attribution,
human outcome scoring, API/local model runners and a usage UI remain planned work.
It does not capture the current desktop chat unless that Codex process has been configured
and restarted to export to the receiver. The OTel transport cannot backfill historical sessions; the native activity importer can recover retained Codex checkpoints.

### Start and connect

Install [Collector Contrib](https://github.com/open-telemetry/opentelemetry-collector-releases/releases)
and put `otelcol-contrib` on PATH, or set `DREAMCUT_OTELCOL_EXECUTABLE` to its absolute path.
The configuration was verified with v0.162.0. A locally verified binary, when present at
`private/tooling/otel-0.162.0/otelcol-contrib`, is also recognized; binaries are not committed.
For automatic collection with the editor, set `DREAMCUT_OTEL_AUTOSTART=1` in ignored
`.env.local`. `pnpm dev`, `pnpm start` and `pnpm review:start` then launch the collector
before Next and pass its endpoint to server-launched Codex workers. `pnpm review` uses
that same review startup command. Stop the server to stop the collector it owns.
The launcher reads the same environment files as Next; defaults in `.env.example` stay off.

If the collector is unavailable, startup times out, or port 4318 is occupied, the editor
continues with a warning and without automatic worker telemetry. It never kills or trusts
an unrelated process on that port. To use an already-running collector, explicitly set
`DREAMCUT_CODEX_OTEL_ENDPOINT=http://127.0.0.1:4318/v1/logs`; that collector's lifecycle
remains external. An unexpected collector exit produces a warning; restart the server to
restore automatic collection. Set `DREAMCUT_OTEL_AUTOSTART=0` to disable automatic startup.

This starts a separate collector process, not another OTel provider inside Next. It does
not connect desktop Codex automatically. The `codex:local` wrapper is for separate CLI
sessions, which can use the receiver while the editor is running.

For standalone collection, run these commands from the repository:

```sh
pnpm otel:local --validate
pnpm otel:local
```

The collector binds only `127.0.0.1:4318`. Keep it running while collecting, and stop it
with Ctrl-C. A port conflict fails startup; do not run a second collector on that port.
In another terminal, start a Codex session with native local export:

```sh
pnpm codex:local
```

This wrapper adds only OTel settings; existing Codex model, authentication and permission
configuration still applies. To collect editor-launched Codex workers instead, start the
editor with `DREAMCUT_CODEX_OTEL_ENDPOINT=http://127.0.0.1:4318/v1/logs`. Worker overrides
are supplied explicitly because the existing worker uses `--ignore-user-config`.
Without an explicit endpoint or successful automatic startup, worker behavior is unchanged.

For desktop/other Codex sessions, merge [the example OTel section](../scripts/otel/codex.config.example.toml)
into the user Codex configuration, preserving existing sections. Existing processes may
require restart; verify actual receipt before claiming coverage. The repository does not
modify a user's global Codex configuration automatically. Configuration keys were checked
against Codex CLI 0.144.4. Newer content-logging options should remain off when present.

### Storage, privacy and coverage

Files live under `profileDir()/otel`, honoring `DREAMCUT_PROFILE_DIR`, or an explicit
`DREAMCUT_OTEL_DIR`. The launcher creates the directory with private permissions.
Each file rotates at 100 MB with no automatic count or age deletion. This preserves accounting history across rollover; disk usage grows until explicitly cleaned. Restart the collector after changing this policy. Rotation is not a receipt guarantee for events a provider never emitted.

Only the log pipeline is enabled. The collector removes log bodies, prompts, tool
arguments/results, error text, identity/contact fields and unlisted attributes before
writing. It retains model/conversation IDs, token counts, timing, tool names and status.
Codex prompt logging is off, but native tool events can contain snippets before collection;
the collector's allowlist is therefore required even for metadata-only storage. There
is no cloud exporter and no second provider registered in the editor's Sentry process.
This does not change the user's separate Codex analytics preference or inference provider.

OTLP is best effort, not billing-grade exactly-once delivery. Collector downtime, process
termination and retention can leave gaps. The file exporter is an upstream alpha component;
pin and validate upgrades rather than assuming its format is permanent. No telemetry is
permission to edit, approve or export a project.

### Read token consumption

```sh
pnpm model-usage
pnpm model-usage --json
pnpm model-usage --model MODEL --since 2026-09-30
pnpm model-usage --conversation CONVERSATION_ID
```

Reports group by UTC day, provider, runtime, conversation and model. They sum **per-response** token counts
from native `codex.sse_event` / `response.completed` or standard
`gen_ai.client.inference.operation.details` log records, not cumulative session
counters or duplicate trace/metric copies. Input includes its cached subset; output includes
its reasoning subset. Exact timestamped delivery replays are deduplicated. Unknown fields,
malformed records and missing usage are reported as coverage gaps. No events means no
observed data, not proof of zero consumption. These totals are not an API bill, and a
completed response is not an accepted edit. Records without timestamps cannot be reliably
deduplicated; they are counted with an explicit warning counter.

### Connecting another model runner

The collector and report are provider-independent; exporting usage is still the runner's
responsibility. Send OTLP/HTTP JSON logs to `http://127.0.0.1:4318/v1/logs`, with one
terminal `gen_ai.client.inference.operation.details` event per inference (including failures).
Use OTLP `eventName` or the `event.name` attribute. Retained standard attributes are:

- `gen_ai.provider.name`, `gen_ai.operation.name`, `gen_ai.conversation.id`.
- `gen_ai.request.model`, `gen_ai.response.model` (preferred when reported), `gen_ai.response.id`.
- `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`.
- Optional `gen_ai.usage.cache_read.input_tokens` and `gen_ai.usage.reasoning.output_tokens` subsets.

Include the event timestamp. Omit unavailable usage instead of estimating it or reporting
zero. Instrumentation must normalize provider totals to include cache in input and reasoning
in output; raw API fields do not necessarily share these semantics. Failed calls with usage
are counted; failed calls without usage remain coverage gaps. Error text/type is reduced to
a boolean before storage. Prompts and responses are stripped, including standard message fields.

The reader's Codex adapter translates its native fields at the boundary. Codex provider stays
`unknown` unless explicitly reported; a model name does not establish its hosting provider.
Filter with `pnpm model-usage --provider PROVIDER`. Existing retained Codex logs still work.
Do not emit both native and standard copies for the same inference: replay deduplication does
not reconcile different instrumentation sources. Traces, metrics-only integrations, and
content stored in event bodies are not usage sources for this log-only reader.

These fields follow the [OpenTelemetry GenAI event conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-events.md),
checked 2026-09-30. The conventions are in development; verify exporter compatibility when
adding a runner. This does not install an API SDK, configure another runner, or evaluate model quality.

### Verify without paid inference

```sh
pnpm verify:local-otel
pnpm verify:local-otel --codex-native
```

Set `DREAMCUT_OTELCOL_EXECUTABLE` if the collector is not on PATH. The verification uses a
temporary directory and available loopback port; it tests OTLP receipt, content removal,
duplicate delivery and retained files across restart. The optional native check starts the
installed Codex against a synthetic local Responses API, verifying real Codex export with
fixed fixture usage, without calling a paid model. Synthetic usage is deleted afterwards
and never presented as production consumption.

Sources: [Codex OTel configuration](https://developers.openai.com/codex/config-advanced#observability-and-telemetry),
[versioned Codex event implementation](https://github.com/openai/codex/blob/rust-v0.144.4/codex-rs/otel/src/events/session_telemetry.rs),
and [Collector file exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.162.0/exporter/fileexporter).

## Local agent activity capture

With `DREAMCUT_ACTIVITY_CAPTURE=1`, managed Codex and Claude workers also write
durable numeric receipts under `profileDir()/worker-usage/`. Inspect them with
`pnpm model-usage --source workers`. Receipts contain runtime identity, lifecycle
and reported token counters, not prompts or generated content. Failed workers
without usage remain explicitly unknown. External adapters require their own
instrumentation. These receipts can overlap OTel or native session observations;
do not sum the three sources. Native Claude session accounting remains separate
from these managed-worker receipts.

The initial session adapter now records tool calls/results from Codex and Claude Code
sessions scoped to the current repository. This includes shell/script requests and
file-change requests that bypass the named MCP boundary. It writes a local per-session
report and a capability-discovery index under `profileDir()/agent-activity/`. It does
not require another OTel collector, a tracing service, or an agent restart.

```sh
pnpm agent-activity --watch
# Optional first-start historical scope (ISO timestamp):
pnpm agent-activity --since 2026-01-01T00:00:00Z
```

First start defaults to now; subsequent starts resume the saved scope and byte cursors.
Use a separate `--directory` for a different historical scope. Run from the repository.
`DREAMCUT_ACTIVITY_CAPTURE=1` in ignored `.env.local` enables capture with the existing
server launcher. It is off by default. An already-running watcher retains ownership;
a second launcher reports that fact without stopping the existing process. A standalone
watcher uses Ctrl+C to stop; a server-owned watcher ends with its server launcher.

The adapter reads repository-matching Codex session metadata and Claude's repository
session directory, including subagent files. It never imports user/assistant prose or
reasoning records. It retains bounded, redacted tool arguments/results and image payload
counts, not binary images. Redaction covers common credential forms; these files are
still private diagnostic content and must not be published or forwarded remotely.

Each entry preserves native call identity and source byte offset. Results are joined
by call ID; deterministic record IDs prevent duplicate projection after restart. Capture
has one process owner per workspace. Partial final lines wait for completion. Malformed,
or truncated input appears as coverage gaps. Oversized complete records span read chunks instead of being skipped. Source files,
working timelines, history and proposals are never changed by this adapter.

Outside-MCP calls are **candidates for review**, not confirmed missing app capabilities.
A coding agent may be building a feature, wrapping an existing tool or doing routine
inspection. Text-based capability hints do not establish nested execution or success.
Image delivery does not prove the final model request or visual understanding; file-change
requests do not prove the resulting filesystem diff. Explicit task/project joins,
actual artifact lineage, native Claude telemetry accounting and automatic retro evidence
remain unimplemented. Numeric Codex token checkpoints and model-context records are retained alongside tool records; prose, hidden reasoning and binary media remain excluded.

There is no event-storage cap or automatic expiry. Reports add storage. Stop the owner
before explicitly removing saved diagnostics; runtime-owned source sessions remain separate.
The importer normally reads 16 MiB chunks, extending a read until an oversized record is
complete. Partial final records remain pending. Event appends are flushed before advancing
the source cursor; failed writes are retryable rather than silently skipped.

Use `pnpm agent-activity --rebuild --drain` with the watcher stopped to recover historical
capture losses from retained native sources. Rebuild archives the previous records and
state, retains historical gap counts, and resets the derived import. `--drain` catches up
complete pending records; `--watch` continues capture. Recovery cannot recreate a deleted
or truncated original session. These are local diagnostics, not editorial mutations.

`pnpm model-usage --source native --conversation ID` reads the recovered numeric Codex
checkpoints. It deduplicates repeated snapshots, checks each cumulative increment against
reported response usage, and exposes resets, mismatched intervals, prior-to-capture usage,
parse errors and pending source bytes. The latest absolute counter and scoped response
sum are separate and must not be added. Native Claude usage is not implemented; OTel
remains the separate provider-independent path. Neither path infers editing-only costs
from a mixed conversation.

The OTel report distinguishes Codex's unmetered completion notices from its usage-bearing
completion events; notices are not a denominator of distinct model responses. When event
time is absent, collector receipt time enables date filtering with explicit provenance.
Neither duplicate-looking notices nor receipt timestamps establish exactly-once billing.

Verification: `pnpm exec tsx --test src/lib/observability/agent-activity.test.ts` checks
Codex/Claude adapters, image delivery, excluded reasoning, redaction, workspace isolation,
partial writes, locking and restart behavior. Live runtime coverage must be reported
separately from synthetic adapter tests.

