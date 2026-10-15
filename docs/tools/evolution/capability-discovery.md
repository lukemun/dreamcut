# Capability discovery

## 2026-09-30 — catalog discovery and selective exposure, v1

Need: growing preparation tools should not become a separate tool for every visual
look or force every agent to consume every schema. Existing owners are the capability
registry, effect catalog and prepared-reveal compiler. Reuse those owners.

Implemented `capability_catalog` search/get with pagination and family loading. The
`editing` profile starts with core proposal/context tools; `full` retains compatibility.
`DREAMCUT_TOOL_FAMILIES` fixes the maximum allowed families before session startup.
Loading changes schema exposure, not write authority. Hidden calls fail; MCP advertises
list changes. Clients must refresh/register schemas; static runners select before launch.

`recipe_compile` accepts an exact recipe/version and delegates prepared reveals to the
existing validated compiler. No generic code execution, source preparation, persistence,
approval or export is added. Executable recipe descriptors live separately from visual
reference entries, linked by stable IDs when an actual association exists.

Acceptance: MCP transport tests cover load notifications, blocked families/hidden calls,
version/input rejection and both shared/independent gap outputs through behavioral
grading. `eval:reveals compare-catalogs` emits matched profile packets and schema byte
counts. This is comparison infrastructure, not measured model improvement. Native client
refresh and real-footage usefulness still need an actual editing trial.

## 2026-09-30 — everyday-language search aliases

User feedback: people use different words for the same editing capability. Added
registry-owned aliases for all 14 families, including masking/background removal,
subtitles, scratch pad, proxies and cutter. Search normalizes case/punctuation and
common conversational filler, ranks exact vocabulary matches first and retains stable
pagination. No new tools, model calls or loading/authority changes.

Tests cover 21 phrasing examples, unknown and filler-only queries, pagination and
discovery of a family that remains blocked by the harness. Registry validation now
requires valid aliases. These examples establish vocabulary coverage, not general
natural-language understanding or mid-session client refresh support.

## 2026-09-30 — client refresh qualification case

Added `client-tool-refresh-v1`: an isolated proxy around the production MCP server with
a fake job-status backend, bounded calls, private receipts and an ordered-event grader.
Scripted-client tests cover the happy path, missing/reordered refresh evidence and denied
mutations. Actual client qualification remains pending. Restored the repository MCP
configuration to full exposure until native refresh is verified; the editing profile
remains available explicitly. No real-project or segmentation work is performed.

Native trial follow-up: the CLI Sol request was provider-rejected; parallel desktop
subagents found no attached DreamCut tools. Added a machine-local Codex MCP registration
and verified CLI config discovery. Full exposure remains the baseline pending desktop
reconnect and a genuine invocation. These are infrastructure blockers, not model-quality
results. The probe now offers full/editing baselines with version-2 grading.


## 2026-09-30 — owned progressive client qualified

Added a persistent bounded MCP eval client that registers initial schemas, refreshes
and registers updated tools after family loading, and rejects unregistered/out-of-scope
calls. Independent Sol and inherited/default Codex subagent trials passed: each used
three calls (search, load, status), registered 11 then 14 tools and reported the fresh
synthetic marker. Private dual receipts and code fingerprints retained. No model token
measurement or native notification-driven-refresh claim. Native Codex stays full-profile.

Independent review identified mixed-run receipt grading and late-notification handling
as gaps. Adapter/grader v2 binds run IDs and handles dirty state before subsequent
requests. Fresh repeat trials passed (Sol: 4 calls including repeated load; default:
3 calls). Schemas reach these models as CLI JSON; this does not establish dynamic native
function registration in a provider API. Native Codex configuration remains full-profile.

## 2026-09-30 — local Qwen native tool calls

Added Ollama runner using actual function definitions refreshed each model turn, bounded
by the existing probe and grader. Installed Qwen 3.6 27B Q4_K_M passed search/load/status
in 3 calls / 4 inference responses, with provider counters retained (19,160 input, 292
output tokens). 103.7 s after 27.5 s warmup; no cross-provider speed comparison claimed.
Tests cover refreshing supplied tool definitions, no model fallback and rejection of
unsupplied calls. Compaction, durable agent resume, recovery loops and VLM payloads are
explicit production-harness gaps; this synthetic text task does not require them.

## 2026-10-01 — local editing operator harness spike

Added a production-SDK MCP client with fixed family/project authority, original-schema
validation and refreshed tools after catalog loads. Added a bounded model loop, local
llama.cpp adapter, actual MCP-image delivery, session journal/lease, compaction and typed
recovery. Optional LangGraph/SQLite interrupts preserve acknowledged results; unknown
external outcomes still block. No new published tool or approval authority was added.

Observed runtime lessons: long schema string limits exceeded llama.cpp grammar expansion;
the generation projection now caps these at 256 while original dispatch validation remains.
Ministral's template rejected a generic extra image-user turn; native multimodal tool
content preserves its role sequence. These are explicit adapter choices, not model-neutral
protocol assumptions. Source hashes, measured weight identities and fresh-session checks
make later trials reviewable. Rich records remain private; operator usage metadata reuses
the local collector. See the [runbook](../../architecture/editing-operator-runbook.md) and
[qualification contract](../../evals/local-harness-qualification.md) for tested scope and
remaining acceptance work. Component tests and synthetic model passes do not establish
editorial quality or a speed improvement.

Real-project integration follow-up: the full timeline response included UI waveform
`_peaks` arrays and pretty-printed JSON, overflowing a 16K model context before inference.
The operator now archives the exact result, removes only those UI sample arrays with
explicit omission metadata, minifies the remaining JSON, and avoids duplicating the full
timeline in initial context. Preferences remain available before planning; timeline, marks
and feedback remain available through the tool. A later read-only smoke also exposed an
unsupported model claim of a tool call: completion text is not evidence, so the follow-up
grade requires the actual operation receipt and an answer only available from its result.

## 2026-10-03 — isolated editing eval setup

The local operator now accepts and pins a loopback editor origin for disposable
project instances; resume rejects a changed origin. Its fixed allowlist includes
surface-track preparation/status through normal progressive discovery, preserving
the proposal-only timeline boundary. Internal fixture setup copies only hash-verified
input files into a fresh private attempt and excludes evaluator answers. Focused
lifecycle, discovery and fixture-integrity tests cover this boundary; no model-quality
result or visual acceptance is inferred from setup checks.

## 2026-10-08 — saved effect recipes share Library discovery

Removed the separate User presets surface. Existing private parameter bundles
appear as user-only Library recipes with their immutable ID/revision preserved.
The existing personal_style_get/proposal pin remains a compatibility contract;
no extra tool or application authority is introduced. Saved settings do not claim
verified recreation evidence. Request construction includes the exact lookup and
revision rather than an unresolvable catalog alias. Tests cover identity, source
privacy, truthful status and proposal-only handoff. Storage remains private.

### 2026-10-09 — desktop service authentication for the existing operator client

The desktop loopback service requires a per-window service credential, but the
existing editing MCP client had no host-controlled way to supply it. The client
now accepts a host-selected service token and projects directory. The MCP HTTP
owner validates local HTTP scope, sends the credential only as a cookie, and
rejects redirects. No tool schema, allowlist or approval authority changed; the
credential must never be passed to the Codex model process. Electron-hosted MCP
children receive Node execution mode explicitly.

Validation: six affected tests passed, including a real SDK MCP subprocess reading
authenticated synthetic timeline/context responses, rejecting another project and
retaining the absence of approval/direct timeline mutation tools. The tool registry
check passed. This establishes the authenticated MCP transport path; connecting
Codex dynamic tool calls, journaling outcomes and packaged-process qualification
remain outstanding. No user project or provider job was modified by this test.

### 2026-10-09 — internal Codex dynamic-tool bridge

Added an unconnected bridge for Codex app-server dynamic tool requests. It projects
schemas from the existing editing MCP client, verifies current thread/turn/project
scope, and uses the existing harness journal's begin/finish boundary around MCP
calls. Unknown outcomes remain pending; duplicate IDs cannot replay dispatch.
The transport enables only an explicitly installed dynamic-tool handler and still
rejects approval/credential host requests. Image blocks map to provider image
content, but real image delivery/interpretation has not yet been qualified.

Forty-three desktop tests pass, including scope rejection before dispatch,
before/after journal order, duplicate rejection, unknown-outcome preservation and
host approval rejection alongside an enabled dynamic handler. The bridge is not
yet attached to a live editing session. Actual model tool calls, durable-journal
restart cases, proposal outcomes and missing/stale/correction cases remain gates.

The bridge is now attached to the host session adapter, with frozen tool-schema
fingerprints checked on resume and unresolved journal outcomes blocking reconnect.
A real installed-Codex qualification registered only timeline_get against an
authenticated synthetic MCP endpoint. Two calls across close/reopen/resume completed
in the journal, and the model returned a random value supplied only in each tool
result. Forty-four desktop tests and check:tools pass, including cancellation
between intent persistence and dispatch. Production app wiring, real proposal
creation/correction, stale state and crash reconciliation remain unverified.

The desktop proposal bridge also passed a deterministic compiled-Electron-service
qualification: pending proposal, missing-target failure, stale flag and linked
correction, with four journaled calls. An approval attempt was rejected before
dispatch and the synthetic timeline remained byte-identical. Stale creation follows
the existing contract (persist and flag); it is not falsely reported as rejection.
No self-approval or real-project mutation was performed. Model-generated proposal
quality and visual review remain separate acceptance work.

The desktop editing-session owner now loads the existing fixed family ceiling and
connects MCP, the durable journal and the Codex adapter. It verifies timeline/context
availability before inference and supplies editing instructions version 1. Component
checks cover host project scope, credential separation, dependency teardown and
partial-start failure; forty-six desktop tests and check:tools pass. No comparative
model editing evaluation has been run for these instructions, and no quality or
speed improvement is claimed. The combined owner is not yet connected to app IPC.

Desktop visual tool delivery now uses the shared harness adapter rather than
constructing image URLs from unchecked tool strings. The Codex adapter preserves
block order, validates canonical base64, declared MIME, decoded pixels, image count,
byte and pixel bounds, and rejects animation/unsupported modalities. Delivery
receipts record hashes, dimensions and encoded status; encoded is not a claim of
model interpretation. Existing tool authority is unchanged.

If an acknowledged tool result cannot be adapted, its journal entry stays completed
with delivery unavailable. The model receives an evidence-unavailable result stating
that the tool ran and mutations must not be repeated. It never receives the false
claim state_changed=false for an already executed call. Regression coverage includes
spoofed MIME, corrupt bytes, limit failures, original image ordering, and this
execution-versus-delivery distinction. The packaged trace now includes the shared
adapter and its decoding dependency explicitly.

The visual failure was narrowed to result exposure: Codex 0.162.0's dynamic-tool
code-mode projection yields a string of text/image URLs, whereas MCP results have
a content object. The [versioned output implementation](https://github.com/openai/codex/blob/rust-v0.162.0/codex-rs/tools/src/tool_output.rs)
supports that distinction. Disabling code-mode feature flags in an isolated probe
did not resolve it and was not adopted. Explicit instructions to emit returned
text and display image data URLs passed the randomized stripe test in an initial
and resumed session, one call per turn (two total). The integration now shares
that tested instruction constant with its verifier; editing instruction version
is 2. This verifies a bounded synthetic visual task, not general editorial judgment.
Existing version-1 journals still require explicit migration/recovery; this change
does not silently relabel their pinned instruction version.

Desktop New conversation is now an explicit host action that archives completed
journal/ownership bytes under app userData, without changing project files, pending
proposals or the prior Codex conversation. The shared project lease now covers the
editing owner's journal/MCP startup and teardown as well as its Codex child. Reset
cannot race a live owner. Pending/unknown or unfamiliar operation states block reset;
a new conversation cannot bypass unresolved mutation reconciliation. A durable reset
marker blocks normal reconnection until an interrupted pair of archive moves finishes.
Tests cover exact-byte preservation, active ownership, live journal writers, uncertain
outcomes, partial archive recovery and host-resolved IPC paths. This is in-process
single-app ownership, not coordination with independent external writers.

Codex transport process groups now register with the independent private-IPC crash
cleanup owner. A stopped protocol fixture initially survived forced Electron-host
termination; after integration its group exits. The fixture never uses an installed
account or runs inference. All 67 desktop tests pass, and the installed CLI readiness
probe still initializes and lists models without a model turn. This changes process
lifetime only: tool allowlists, proposal approval and unknown-outcome handling remain
owned by their existing contracts. The crash test does not prove live provider-side
cancellation or journal reconciliation after a mutation.

2026-10-09 — Fixed local MCP helpers now register their private process group
with the existing IPC-lifetime crash guard. The canonical guard/watchdog live in
`mcp/`; desktop entry points delegate to them and packaging copies those canonical
modules into the host too. Forced MCP death terminates a running helper and nested
child in real source and relocated-package fixtures. Eighty targeted tests and
tool registry checks pass. No tool authority changes. Separately detached children
and service-owned HTTP operations are not covered by helper-group ownership.

## 2026-10-10 — proposal features in search and smaller `get` (audit F1, F4, F5)

Need: the 2026-10-10 agent tool usability audit found creator features inside
`proposal_create` unfindable (F1). It also found audio and working-timeline requests
routed to segmentation or workspace-only tools (F5), and `get proposal-authoring`
carrying the proposal schema twice (F4).

Search now includes derived `kind: "feature"` entries (`mcp/feature-index.mjs`). There is
one per proposal operation kind, `patch` field and top-level `props` field, plus
`timing_controls`; 196 entries at this change. Each names `capability`, `tool` and the
exact `field_path`. Labels come from `EFFECT_CONTROLS`/`PROPOSAL_TUNABLE_FIELDS` through a
snapshot test (`mcp/feature-labels.json`), and schema descriptions are searchable.
`FEATURE_VOCABULARY` adds creator wording to existing features only. Alias phrases now
compare content words and prefer longer phrases, so "trim the clip" reaches the
`patch.trim_*` features ahead of `workspace-editing`. Feature cases accept a feature entry
as reaching its owning capability.

Of the audit's 41 missed requests, 38 now reach their route in the top 3. All 37 that name
a field also put that field in the top 3. Before this change the working tree reached 13
(after concurrent registry aliases; the audit measured 0). Remaining gaps, kept as `todo`
tests: "find clips of a dog" and "pick the best take" need registry aliases, and "blur the
background" has no single control. "split the clip" still ranks `workspace-editing` first,
because the proposal contract has no split operation.

`get` names tools the session already registered (`registered: true`) instead of
repeating their schemas. A repeated large property schema is returned once and referenced
with `same_schema_as`, and `get` on a feature returns that field's schema. With the current
94 KB proposal schema, `get proposal-authoring` drops from 191 KB to 1.8 KB in a full
session, to 4.6 KB in an editing session and to 103 KB when no tool is registered. `load`
still returns full schemas. Search ranking is still vocabulary matching. No model eval
was run for this change, so usefulness to a model remains unmeasured.

### 2026-10-10: refusals stopped ending desktop conversations

A creator's Codex conversation became permanently unusable after the agent asked
`run_instrument` for `frame-state --at 0.7,2.3,4.3`. The tool advertised `--at`, but an
older blanket ban in `mcp/harness-mcp.mjs` refused every flag by throwing. The bridge reads a
throw as an unknown outcome, so the session disconnected and refused to reopen. Every
pre-dispatch refusal in the harness client now returns a `state_changed: false` tool error,
and the blanket ban is gone (the server's flag allowlist owns that limit). Reopening a
conversation settles a genuinely interrupted call as `unconfirmed`, and the next message tells
the agent to check state before repeating it. `pnpm agent:health` (no model) checks these
invariants and fails with the old code. `pnpm agent:smoke` runs the signed-in Claude Code and
Codex sessions, including a dropped connection followed by another message. Both are local
only.

### 2026-10-10: availability with reasons before a direct write

Before this change, an agent found out that a workspace-only tool was refused only by calling it. The
refusal came back as generic `TOOL_FAILED` with `state_changed: "unknown"`, even though nothing was
written, and did not say why direct editing was closed. The fix reports each tool's enabled state
and reason before the call.

`capability_catalog` `action: "availability"` takes a `project_id` and an optional `tools` list. It
reports `enabled`, a `reason_code`, a sentence and `use_instead` for each tool. The reason codes are:

- `WORKSPACE_HANDED_OFF`
- `WORKSPACE_HUMAN_EDITED`
- `NOT_AGENT_WORKSPACE`
- `PROJECT_UNREADABLE`
- `PROJECT_REQUIRED`
- `HUMAN_ONLY`

The report and the gate use one reader, `agentWorkspaceState` in `mcp/proposal-gate.mjs`, so they
cannot disagree. The store now writes `.agent-workspace-revoked.json` when a human edit clears the
grant. That receipt only explains a revocation; it never restores one.

Gate refusals are now typed:

- `PROPOSAL_GATED`, with `state_changed: false` and recovery `use_proposal` → `proposal_create`.
- `NOT_AUTHORIZED` / `HUMAN_ONLY` for approve, reject and history restore.

`mcp/tool-availability.test.mjs` covers every workspace state and checks that the report and
enforcement agree for every gated tool. It also exercises the served catalog and a served refusal. No
model eval was run, so whether agents now check before writing is unmeasured.

## 2026-10-11 — registry-derived editor surface

- **Observation:** The desktop session's family list, the harness operator allowlist and the
  feature eval each kept their own tool list, and they disagreed: `media_import`,
  `video_search`, `library_present` and `personal_style_save` were offered but refused;
  cutout, cutout treatment, surface tracking and compound tools were allowlisted but never
  loaded; the eval offered tools the live session did not.
- **Change:** Every capability now declares `editor_agent` access in the registry.
  `editorAgentFamilies()` and `editorAgentTools()` in `mcp/capability-catalog.mjs` derive
  the session families, the operator allowlist and the eval's offered tools. The creator
  enabled all eleven previously inconsistent tools for the in-editor agent (2026-10-11).
  `pnpm check:agent-parity` enforces the contract and reports skill gaps; see
  [agent surface parity](../../standards/agent-surface-parity.md).
- **Verification:** Parity, harness, catalog, eval and session tests pass; the live
  repository reports 45 editor-agent tools, 0 violations and 9 recorded skill gaps.

## 2026-10-14 — Templates gallery templates resolve by title

- **Observation:** The Templates gallery copies a one-line request ("Use the Word Search Trace
  template with my footage.", "Use my \"Speed Entrance & Exit\" template with my footage."), and
  media-intake told agents to resolve it with `capability_catalog` or `personal_style_list`. The
  catalog indexed only `docs/effects/catalog.json` and executable recipes, so the promoted cards
  (`FX-SPEED-ENTRANCE-EXIT`, `FX-MASK-GLITCH-GLOW`, `FX-MOVING-GRID-MATTE`,
  `FX-WORD-SEARCH-TRACE`), the gallery examples without an id and the creator's private
  recipes in `<profileDir()>/effect-recipes/catalog.json` were found by no MCP tool;
  `personal_style_list` lists only saved personal styles.
- **Change:** The gallery list moved from `/api/guide/effects` into `galleryTemplates()` in
  `src/lib/effects/gallery.ts`, which the gallery route and a new read-only
  `/api/agent/templates` route share. The agent route returns every card with
  `templateBrief()` (the `effectRecipeRequest` brief, naming catalog lookups rather than
  repository files, or the community brief). `capability_catalog` reads it per call (5 s cache,
  5 s timeout; skipped for `load`) and indexes each card as a `template` entry, id
  `template:<recipe id or title slug>`, aliased by its displayed title. Search returns the compact
  card with `owner` (`shared`, `mine`, `saved`, `community`); `get` adds the brief and the copied
  gallery request. Private recipes are read from the profile on each call and never written to
  tracked files or the server. Without an editor the static catalog still answers, with
  `templates_warning`, and `get template:…` returns retryable `TEMPLATES_UNAVAILABLE`. Catalog
  search product signals report the creator's own templates as `template:private`.
- **Verification:** `mcp/template-catalog.test.mjs` resolves every shipped gallery card plus a
  fixture private recipe and saved style by its exact copied request and by its title, checks
  served briefs carry no repository paths, signal redaction, and the served path through
  `mcp/server.mjs` against a fake editor, including the unavailable case. No model eval was run,
  so first-attempt resolution by Claude/Codex and the local model is unmeasured.
- **Limits:** A card whose title matches a catalog effect ignoring case ("White paper outline")
  ties with it; both are returned. Under `DREAMCUT_EDITOR_AUTOSTART`, a first catalog search may
  start the editor and report templates unavailable until it answers.
