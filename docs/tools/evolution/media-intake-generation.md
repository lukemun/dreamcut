# Import media and stage authorized generation — evolution

Capability: `media-intake-generation`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Import media and stage authorized generation. Import and generation drafts; submission and timeline placement have separate authorization.

## 2026-09-30 — initial capability registration

- **Observation:** Repository script/catalog audit found this capability family. This
  is code/discovery evidence, not measured editing frequency or a new runtime trial.
- **Decision:** Register existing implementation; audit remaining authoring-contract gaps incrementally.
- **Version:** Initial registry record; existing tool/recipe versions are unchanged.
- **Verification:** Catalog membership and owner/evolution paths checked by `check:tools`.
  Runtime behavior was not re-certified by this inventory.
- **Acceptance for next change:** Preserve existing authority tests; migrate recovery and accounting contracts with representative success/failure cases.
- **Evidence:** [Script audit and priorities](../script-audit.md). Private session
  traces remain outside this public log.


## 2026-10-01 — source-linked whole-video descriptions and search

- **Observation:** One-frame Library labels could appear as video descriptions, while
  import search flattened evidence into a 20,000-character prefix. Generic context
  could also make unrelated media match the same subject.
- **Decision:** Enforce a whole-span sampled frame-description sequence and a separate
  summary pass consuming every observation. Publish immutable descriptions in shared
  source context. Search original filenames, summaries, specific tags and all timed
  descriptions; expose matching source moments and cross-project scope in Library.
  The read-only `video_search` tool shares that projection; verified imported video
  descriptions enter project agent context without requiring detector jobs first.
- **Tool contract:** Existing ingestion, source context and catalog owners had no
  agent-facing timed video retrieval operation. `video_search` returns bounded
  keyword matches and source-second moments, with explicit project scope and
  pagination. It cannot prepare media, place footage or mutate a timeline.
- **Authority:** Import annotations and explicit legacy backfill only. Search and
  preview are read-only; timeline, human approval and export boundaries are unchanged.
- **Verification:** Synthetic tests reject poster-only coverage and missing summary
  inputs, find an ending-only subject, group identical sources, and refuse source drift
  or corrupt evidence. The import fixture verifies the two-pass worker boundary and
  saved frame/summary artifacts. This is contract verification, not a measured model
  accuracy or recall evaluation on real footage.
  A live worker inspected a synthetic two-color clip and summarized its change through
  the ending. Independent UI checks verified timed previews and project scope at
  desktop and narrow widths; a follow-up verified visible tabs and keyboard selection.
- **Limits:** One-second samples do not establish continuous events. Keyword search
  is not semantic retrieval. Real analysis requires the configured worker and local
  inspection/transcription prerequisites; legacy labels remain incomplete until backfill.
- **Owner:** [Import processing architecture](../../import-processing-harness.md).

## Agent retrieval and Library handoff

- **Requested outcome:** A creator describes footage to an agent. The agent searches
  source evidence and presents selected videos in Library; the creator need not type
  a catalog query. The retrieval contract must work for Codex and other model clients.
- **Existing owners and gap:** `video_search` owns retrieval and Library owns preview.
  There was no bounded handoff for an agent-selected set of source handles and moments.
- **Boundary:** `library_present` reveals existing Library items through a temporary
  display selection, preserving their imported handles and owning projects. It
  creates no Library entries. It stages that selection in an existing
  project. It resolves imported video handles and verified sampled moments, never
  imports, edits a timeline, approves work or starts analysis. The project shell can
  reveal the Library selection, and the creator can return to ordinary browsing.
- **Acceptance:** Present a curated set from different projects, preview a selected
  source moment, replace/dismiss results, and reject stale handles or invalid moments.
  Verify that all presentation actions preserve timeline bytes.
- **Evidence:** Store tests verify cross-project handles, sampled moments, replacement,
  stale sources and dismiss concurrency while preserving timeline bytes. A fresh MCP
  connection exercised search and display end to end. Independent desktop/narrow UI
  checks observed automatic Library navigation, a paused selected moment and persistent
  dismissal without entering a query. Existing connected clients still require a server
  reconnect and schema refresh; these tests do not establish every client/model's behavior.

## Generation preparation handoff

- Creator direction: stage all context in Generate and instruct the agent not to
  generate without explicit user approval. Keep this lightweight; no voice-confirmation
  system or approval-token machinery.
- Updated preparation description, result (`next_action: human_review`), operating
  guide and generation workflow. The preparation test verifies zero provider jobs.
- The restricted operator exposes preparation but no submit tool. This is not a
  security claim about an unrestricted external coding agent's browser or shell.

### Prepared-draft navigation

Preparation returns `review_url` ending in `#generate`. Opening that URL selects
Generate in the shared Library drawer, including after reload, without submitting
or changing the timeline. The tool instructs callers to use this link instead of
reopening the plain project URL. Planning intent remains saved with the draft;
it is not a user-facing form field. Prompt, references and output settings remain
visible. Verified the populated video draft and open drawer in the editor.

Image preparation defaults to Codex: the tool no longer requires an explicit route
and describes Codex as the image default. The existing runtime default is covered
by a staging test that confirms a null API estimate and zero jobs. Explicitly selected
image API routes remain supported; video model selection is unchanged.


Desktop runtime adaptation: the MCP server now launches its fixed allowlist of local
TypeScript helpers with the current Node/Electron executable and tsx, rather than
package-manager scripts absent from the packaged manifest. Existing tool schemas,
allowlists and human approval/workspace gates are unchanged. Selection rejects
unknown scripts; output retention is bounded during capture; timeout terminates the
helper before returning failure. Shared runner tests cover those boundaries. This
launcher change alone does not qualify every helper’s codecs, browser/model runtime
or editorial result.


2026-10-09 — Local helper descendant cleanup: the shared fixed-command runner
now owns a private POSIX process group and terminates it on timeout or helper exit,
including descendants that retain output pipes. Real nested-process fixtures cover
both paths and reject invalid/overflowed deadlines. Tool authority and result shape
are unchanged. This covers ordinary completion and timeout, not abrupt MCP/host death;
Windows retains immediate-child termination and is outside the initial desktop scope.

2026-10-09 — MCP input closure now aborts active fixed local helpers and rejects
new helper launches after closure. An AbortSignal connects transport lifetime to
the existing private-group cleanup owner; disconnected transports suppress late
responses. Tests cover a running helper with nested output-pipe descendants and
pre-aborted admission. Forced MCP termination and service-owned HTTP jobs retain
separate lifetimes and are not covered by this change.

2026-10-09 — Project identifiers now accept the store's bounded dotted folder
names in recipe compilation and video search, matching native opening and desktop
chat. Empty, dot/dot-dot, slash/encoded-slash and overlong input remain rejected.
Real MCP recipe/search tests and desktop ownership tests pass; no new tool or
approval authority. Packaged chat/session/search fixtures also pass. Native
chooser-to-chat visual acceptance remains unverified.

2026-10-09 — Fixed local MCP helpers now register their private process group
with the existing IPC-lifetime crash guard. The canonical guard/watchdog live in
`mcp/`; desktop entry points delegate to them and packaging copies those canonical
modules into the host too. Forced MCP death terminates a running helper and nested
child in real source and relocated-package fixtures. Eighty targeted tests and
tool registry checks pass. No tool authority changes. Separately detached children
and service-owned HTTP operations are not covered by helper-group ownership.

2026-10-09 — Import write-failure recovery: a failed source-manifest commit left
an unregistered media copy or external-reference link behind. Registration now
removes only this invocation's new path when readable manifest state (or its
absence) proves the asset uncommitted. If rename already committed the record or
the manifest cannot be read reliably, media is retained. Five ingestion tests
cover copies, references, pre-commit refusal, post-rename flush failure and path
retry reuse. A relocated packaged upload fixture exercises actual read-only media
and project directories, unchanged manifest/timeline/bytes, and one-asset retry.
Typecheck, production build, packaging and tool registry checks pass. This does
not establish arbitrary post-commit processing recovery or power-loss atomicity.

2026-10-09 — Preparation/import startup deduplication: repeated requests could
spawn duplicate queue processes before a child wrote its disk lock. A process-wide
reservation now covers startup and the live child, keyed by absolute queue path.
A synthetic burst of 400 requests across four project/queue combinations launches
four workers; exit/error releases permit explicit retry, and late events cannot
release a replacement. Separate workspace paths remain independent. Source and
relocated packaged startup tests, real media preparation, typecheck, build and
registry checks pass. This is not an app-wide concurrency cap or a measured UI
responsiveness result. Existing disk locks and durable job states remain owners.

2026-10-10 — `media_import` failures (audit F8): `scripts/import-media.ts` reports one
`dreamcut_script_error` JSON line (`scripts/lib/script-error.ts`) with SOURCE_NOT_FOUND,
SOURCE_NOT_A_FILE, PROJECT_NOT_FOUND, INVALID_INPUT or IMPORT_FAILED and recovery; source
paths are echoed as supplied. The MCP handler maps it through `scriptFailure` and never
forwards stack text. Probe: `/nonexistent.mp4` returns `Missing media source: /nonexistent.mp4`,
code SOURCE_NOT_FOUND, no project created. Unknown failures still surface their message
(redacted) rather than a fixed diagnostic text.

2026-10-12 — Generation is credits-only (creator decision). `asset_generation_prepare`
now returns the DreamCut Cloud price in credits and a `generation_check` (ready, sign_in,
buy_credits, model_unavailable, incomplete, price_unavailable) without uploading or charging,
records which draft and price it reported, and its staged form opens itself in an open editor.
New `asset_generation_submit` (contract version 1) generates the visible staged draft only with
the creator's verbatim chat approval, stored on the job; it refuses with typed `tool_error`
codes (approval_required, stale_draft, not_viewed, draft_changed with the current draft and
price, sign_in, buy_credits) and derives its request id from project, staging and draft, so a
repeat or a prior Generate click never charges twice. Verified by unit tests against mocked
Cloud responses and live refusal probes (signed out); no live generation was submitted.

2026-10-13 — Video/audio references and music (creator decision: all models at once,
provider safety filters only). `asset_generation_prepare` accepts tasks `recast` and `music`,
roles `source` and `audio`, several references per role where the model allows, a `window`
on each video/audio reference and `lyrics`. New credit models: H3 Max Recast, Wan 2.2 Animate
Replace, Kling O1 Video Edit, Seedance 2 and 2.5 Reference, MiniMax Music 3, Mureka Song and
ElevenLabs Music; Kling 3 Motion Control is now sold. Only each window is uploaded (trimmed
and re-encoded in job scratch); its declared length prices the request and the Cloud checks
it against the uploaded file's header before charging. Verified by unit tests (catalog parity
between `site/src/lib/catalog.ts` and the local catalog for twelve sample drafts, window
pricing, header length reading of the worker's own encodes, and a mocked-Cloud recast run
that uploads a trimmed MP4 and removes its scratch). No live generation was submitted; the
storage migration is not yet applied.

2026-10-13 — New `asset_generation_status` (contract version 1): results appear in chat
(creator request). It reads one generation job (or the project's latest), optionally waits up
to 120 s for a running one, and returns status, outputs with ids, sources and hashes, and each
output as an actual MCP image (images downscaled to 768 px; a video as three frames at 10/50/90%),
plus the Generate › Results `review_url` for the open editor. Read-only: no submit, charge,
keep or timeline change; a running job tells the agent to call again rather than resubmit.
Verified by a unit test (fixture image and running jobs) and live probes through a stdio MCP
server against existing ready image and video jobs. No new generation was submitted.

2026-10-13 — Editor presence ships with the MCP server (creator direction: a downloaded
DreamCut has no repository AGENTS.md, so the MCP must carry it). The initialize
instructions tell every connected agent to start the editor itself when it does not answer
(`pnpm dev` in the DreamCut folder through its preview/launch tool), open the project in its
built-in browser, reopen it at each returned `review_url`, and link the project in replies.
Tool results' relative `review_url` is now absolute, and EDITOR_UNAVAILABLE recovery says to
start the editor rather than ask the creator. Verified by MCP tests and an initialize probe.
