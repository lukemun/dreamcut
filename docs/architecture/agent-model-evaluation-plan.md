# Agent model evaluation and usage accounting — proposed design

Date: 2026-09-30
Status: proposed implementation and experiment design, not implemented or benchmarked.
Scope: the current DreamCut application. Product branding is DreamCut; compatibility identifiers retain their existing names. This document proposes capabilities and does not change runtime authority.

## Operating direction: a benchmark grown from real edits

The benchmark evaluates models operating existing effects and tools, not coding new
features. The coding agent continues product development. Grow candidates alongside real
video work, then compare selected cases periodically; there is no migration deadline or
requirement to run a benchmark at every export.

[Editing evaluation](../standards/editing-evaluation.md) owns case evidence, isolation,
versioning, acceptance and refresh policy. [Editing eval curation](../../.agents/skills/editing-eval-curation/SKILL.md)
owns capture and preparation. Platform delivery now invokes that skill during enabled
retrospectives; this is a manual instruction hook, not automatic extraction.

Implementation backlog, in order:

1. Add a validated optional candidate result to retro batch/synthesis contracts; retain
   checkpoint/request/beat identity and persist idempotently beside existing retro output.
   Reuse existing retry/opt-out lifecycle; candidate failures must not invalidate delivery.
2. Expose evidence review and selection in Memory; distinguish candidate capture, case
   promotion and human approval of an edit. Freeze pre-request evidence or flag it missing.
3. Implement isolated tool-only replay with input/answer separation and a small frozen
   regression suite; connect one local model through that same tool boundary.
4. Join run IDs to proposals/outcomes and complete latency, memory, retry and price-versioned
   cost reporting. Current OTel logs alone are not complete task or API billing evidence.
5. Add event-driven compatibility checks and a periodic curation review when requested.
   Refresh cadence is documented; no scheduled background job is installed by these docs.

Start with one enabled delivery retro and a manual candidate receipt, then five selected
cases. Include ordinary successes and corrections. Do not backfill invented pre-edit state
or count missing editor capabilities as demonstrated model failures.

## Implementation update: native OpenTelemetry first

The first slice now uses native Codex OTLP log export into the standard OpenTelemetry
Collector Contrib, with local file storage and a read-only token report. This replaces
the initial custom worker-ledger/console-parser approach for Codex. See
[local Codex monitoring](../observability.md#local-codex-model-monitoring) for commands,
coverage, privacy filtering and verification.

Implemented: loopback-only collector configuration, metadata allowlisting, file rotation,
opt-in Codex worker overrides, a Codex launch wrapper and token/tool summaries by day,
provider, runtime, conversation and model. Standard GenAI inference log events share the
report through a provider-independent reader; native Codex fields have a boundary adapter. Native export was verified against a synthetic local model endpoint;
this is integration evidence, not a model-quality benchmark or production usage measurement.

Remaining: provider adapters beyond Codex, explicit run/project/proposal joins, durable
outcome events, cost estimates, model runner/evaluation cases and UI. OTel delivery and
retained files are not a complete billing ledger. The stronger accounting guarantees below
remain proposed requirements, not claims about the current local report. Extend standard
OTel collection before building any separate storage layer; keep app-specific joins and
outcome validation in DreamCut. Branding is independent of this evaluation work.

## 1. Outcome and recommendation

Build enough instrumentation to compare local and API editing agents fairly, expose token consumption, and choose a feasible standalone consumer experience. Evaluate three independent questions:

1. Can the agent produce acceptable edits through DreamCut's supported tools and human review flow?
2. What time, memory, tokens, correction effort and monetary cost does each acceptable edit require?
3. Can the winning workflow run inside a packaged application without relying on an external coding-agent installation?

Recommended sequence: establish accounting and run identity; prove one complete local/API agent loop; freeze the evaluation fixtures; run a small smoke set; expand to the 15-case suite; then make deployment and packaging decisions. Do not wait for a polished dashboard or desktop installer before collecting the first valid evidence.

Local-only, direct API using the user's credentials, and a hybrid are all candidates. A developer-operated inference service is a separate business choice, not a prerequisite for API access. Keep cloud fallback explicit and opt-in because it changes where project context goes and who pays.

## 2. Adaptation of the external proposals

External planning briefs supplied a local-model experiment, 15 evaluation cases and a standalone-consumer objective. They were written without inspecting the current application. Their useful experimental ideas are retained below; installation commands, product economics, licensing assertions and packaging estimates are not implementation facts. Private source briefs and personal usage logs are not repository dependencies.

| External proposal | Adaptation to the current app |
| --- | --- |
| Swap the model behind an MCP bridge | DreamCut supplies a stdio MCP tool server, not a complete model-agnostic conversation runner. Build or integrate the missing loop and capture model usage at that boundary |
| Use the worker adapter for all AI | The adapter covers application-owned background work. It does not capture the external editing agent; both boundaries need instrumentation |
| Measure completed edits and renders | Measure valid reviewable proposals first; separately record human review and application. Use fixture preview evidence, not automatic project exports |
| Test velocity and catalog effects | Resolve real supported operations, source handles and controls against the current catalog/schema; do not assume a named velocity skill exists |
| Treat a local-model pass as consumer readiness | Add target-device, recovery, context and standalone-runner gates; packaging remains a later workstream |
| Local inference only; no cost model | Compare local, API and explicit fallback policies. Token visibility and estimated API costs are first-class requirements |
| Rename/package/license the app during this work | Keep branding, packaging and distribution decisions separate from measurement implementation |

### Material corrections to the supplied evaluation design

- **Context is per invocation.** Total input tokens accumulated over a task can be much larger than the model's context window. Record the maximum input for each task, then the distribution of those maxima; add measured output/tool-result reserves. With only a small suite, report maxima and sample size alongside P95. A task totaling 60K input tokens does not by itself rule out a 32K context window. Tokenizers differ across models.
- **Latency has several components.** Separate model load, input processing, first-token delay, output generation, tool execution and review waiting. Dividing total input-plus-output tokens by a time target does not yield the required output tokens/second. Cache reuse and image encoding matter.
- **Failures cost money and time.** Report successful-run token efficiency, but calculate cost per acceptable edit using all attempts in the measured cohort, including failed retries and permitted fallbacks. If nothing succeeds, report no successful denominator.
- **Vision accounting has limits.** Frame count and resolution are useful workload measures, not a substitute for measured vision tokens. Preserve unreported vision usage as unknown. One success without vision does not establish that vision is unnecessary across the product.
- **Approval remains human.** Existing-cut cases produce proposals. The evaluation agent may not approve, reject, restore history or directly rewrite a working timeline. Reviewable candidate playback is the default endpoint, not a user-project export.
- **Revisions remain auditable.** E13 changes an existing treatment semantically, but can create a superseding proposal record. It must not overwrite the audit record or stack a duplicate effect.
- **Small samples support pilots.** Two E05 runs are a smoke test, not a stability guarantee. Use repeated runs and held-out media before a product claim.
- **Runtime assumptions must be verified.** Validate current model availability, license/artifact, tool parser, multimodal route, context limit and reasoning settings against the installed integration and official documentation. Do not blanket-disable thinking or copy an unverified model tag. Pin the working versions.
- **Hold the right variables fixed.** A different agent application changes more than the model. Use a common runner for model-isolated local/API comparisons, and label Codex/Claude comparisons as whole-system baselines.

## 3. Current implementation and integration map

Inspected against the working tree on 2026-09-30, including uncommitted changes. This is a code-level design assessment, not a release certification. Revalidate the touched interfaces before implementation because this tree is active.

| Existing owner | What it actually provides | Planned extension |
| --- | --- | --- |
| [Task metrics](../../src/lib/local-store/task-metrics.ts) and [CLI](../../scripts/task-metrics.ts) | Explicit start/action/phase/finish records, durations, corrections, optional engine/model identity; summary groups by task/effect and includes only completed runs | Stable model-attempt accounting and summaries that retain failures and distinguish configurations |
| [Worker runner](../../src/lib/agent/worker-runner.ts) | Structured task-result validation, process timeout/cancellation, Codex and restricted Claude adapters, configured external executable | Capture execution/usage metadata beside the result without breaking existing result schemas; enforce access in the adapter, not merely by claiming it |
| [Media import workflow](../../src/lib/agent/media-import-workflow.ts) | Isolated source copy, verified inspection/transcript output, explicit no-upload rule | Measure preprocessing workers separately; do not route private import media to an API merely because a new provider is configured |
| [Retrospective coordinator](../../src/lib/local-store/retro-coordinator.ts) and [skill maintenance](../../src/lib/local-store/skill-maintenance.ts) | Background worker consumers | Account for their usage without triggering a retro or maintenance pass for evaluation |
| [MCP server](../../mcp/server.mjs) and [proposal gate](../../mcp/proposal-gate.mjs) | Newline-delimited JSON-RPC over stdio, tools wrapping local HTTP, human-only review actions and bounded new-project grants | Correlated tool receipts, including validation failures; MCP alone cannot observe model tokens |
| [Proposals](../../src/lib/local-store/proposals.ts), [edit attribution](../../src/lib/local-store/edit-attribution.ts), [feedback coverage](../../src/lib/timeline/editing-feedback.ts) | Candidate persistence, review outcomes/final overrides, causal feedback links, human/agent/system provenance | Join model runs to candidates and outcomes without using attribution as authorization |
| [Diagnostics](../observability.md) | Opt-in Sentry/OpenTelemetry for app operations; external agent applications are explicitly outside scope | Keep diagnostics for operations; durable local accounting must not rely on sampling or remote receipt |
| [Inspector contract](../standards/inspector-information-architecture.md#audit-tuning-and-improve-selection) | Final numeric overrides; intermediate adjustments/reset/abandonment are documented gaps | Add committed interaction events only when needed to measure correction effort |
| [Agent efficiency](agent-efficiency.md) | Scoped deterministic processing and evidence-reuse benchmarks | Reuse fixtures/identity principles without claiming these benchmarks measure model quality |

The initial focused task-metrics, worker and privacy tests passed (nine tests). No model comparisons or end-to-end usage reconciliation have run. A common API/local editing-agent loop and a usage dashboard are proposed work, not shipped features.

Historical agent-log import is optional backfill, not the accounting authority for new runs. It needs explicit coverage, session/fork deduplication and coding-versus-editing classification; do not ship private historical receipts or machine-specific statistics in the repository.

### Actual editorial loop to preserve

1. Read the current revision and applicable preferences through `timeline_get` / `editing_memory_get`; record direction through the supported feedback tools.
2. Retrieve applicable skills and compose supported operations. Use the current implementation contracts and semantic spatial tools where appropriate.
3. Run `proposal_spatial_preflight` for the exact candidate, inspect its evidence and supported control inventory, and select meaningful review controls.
4. Persist with `proposal_create`, linking feedback. Validate the saved reviewable candidate with the owned preview/runtime evidence.
5. The human reviews, tunes and decides in the editor. The evaluation records that event; it never substitutes an agent approval call.

Net-new assembly uses `assembly_create`; source comparisons use `audition_create`. Their bounded workspace grant ends at the first layout handoff or human edit. Treat their task lifecycle separately from existing-cut proposals. Fixture setup must use a controlled isolated environment and supported preparation paths, not production timeline mutation scripts.

## 4. Architecture and accounting contract

### Run identity

Extend existing metrics rather than creating a disconnected analytics system. Assign a durable `run_id` to one requested task; record parent/fallback runs and an `attempt_id` for each retry. Join model calls, tool calls, feedback, project revision, proposal/option and human resolution through explicit IDs. JSON-RPC call IDs alone are not globally unique.

Record the case/suite version, source and initial-timeline hashes, repository revision plus working-diff identity, skill/tool-schema versions, prompt-template identity, context policy, runner/provider/model/version, quantization, runtime and reasoning settings, hardware, concurrency, seed when supported, and deployment/billing mode. Keep private snapshots and receipts outside public Git content.

### Model-call receipt

Persist call start and terminal state: completed, failed, cancelled, timed out or unknown/interrupted. Include duration, first-token delay when observable, input/output usage and provider-supported cache/reasoning/image categories. Preserve raw usage fields alongside documented normalized fields. Never add subsets such as cached input or reasoning output to totals that already include them.

Record provider request/response IDs where available, usage source, completeness and whether values are reported or estimated. Use explicit unknowns rather than zeros. Accept late usage updates idempotently; distinguish request retries from duplicate ingestion. A interrupted stream may still have incurred provider charges.

Track prompt composition by stable categories: system/policy, skill material, user request, history, tool results and image workload. Component token counts require the actual tokenizer or an explicitly marked estimate; provider usage is the accounting authority when available. Do not claim an exact split when serialization or image tokenization prevents it.

### Tool and outcome receipts

Capture tool name/schema version, duration, success/error category, validation failure, recovery action, retry parent and termination reason. Record attempts blocked before execution as well as successful calls. Distinguish unknown tools, malformed arguments, permission refusal, stale revisions and provider/runtime failures.

Capture request-to-first-tool, request-to-valid-reviewable-proposal, active work and human waiting separately. Record the first proposal, superseding proposals, committed human adjustments, reset, rejection, approval and abandonment where observable. Missing events remain unknown. A valid proposal or accounted-for feedback is not automatically a satisfactory edit.

### Storage, privacy and cost

Use local durable accounting independent of sampled remote telemetry. Keep it functional when Sentry is disabled. Avoid remote prompt/media/transcript collection; credentials never enter usage receipts. If debugging requires local content capture, make it explicit, bounded and removable. Instrumentation failures must not grant write authority or corrupt editing state; report degraded accounting coverage.

Price API calls with a versioned rate table and documented units/categories. Separate estimated charge, reported charge and billing reconciliation. Distinguish user-paid API, app-paid API, subscription and local compute; keep image/video generation costs separate. Record local runtime/memory and any declared hardware-cost assumptions instead of presenting zero API dollars as zero total cost.

## 5. Evaluation fixture v0.3 proposal

Preserve the supplied v0.2 document. Implement these changes as a new suite version, with its own machine-readable manifest and frozen source hashes. Resolve placeholders, exact skills and supported operations before the first scored run. Agent-visible materials must not include hidden answer keys or beat timestamps used by the judge.

Prepare M1 speech, M2 beat-driven media, M3 moving B-roll, M4a/b/c assembly sources and R1/R2 reference effects. Record provenance and analysis ground truth; use cleared or synthetic fixtures for shareable results. Make an isolated fresh project/profile for every attempt and pin the same relevant preferences. Ensure proxies, transcripts, alignments and analysis inputs have the same readiness state across candidates.

| Cases | Workload | Required clarification or stronger check |
| --- | --- | --- |
| E01 | Silence removal | Define eligible silence from reviewed alignment; verify speech preservation and every changed join, not three sampled joins. Keep the 0.5-second target explicit |
| E02 | Exact 0–45-second source range | Use frame-accurate source/timeline bounds with declared endpoint convention; the old 43–47-second range is too loose for a precision test |
| E03 | Word-pop captions | Check text/alignment coverage and timing automatically where possible; inspect motion and overlap, not stills alone |
| E04 | Remove a specified sentence | Fill the real topic and reviewed word/source bounds; preserve all unrelated speech |
| E05 | Catalog velocity effect at beat drop | Resolve a real supported catalog treatment; freeze expected timing/controls and visual rubric |
| E06 | Choose one high-energy effect | Freeze the allowed catalog subset before all runs; score coherent intent separately from structural validity |
| E07–E08 | Single/composite reference recreation | Standardize reference frames or temporal evidence; use blind human motion review. Unsupported modalities are a capability gap, not a hidden frontier-model assist |
| E09 | Three-clip assembly | Use `assembly_create` and its bounded grant; assert source in-points, order, no unintended gaps/overlap |
| E10 | Portrait reframe | Sampled checks do not prove continuous framing. Inspect motion and declare coverage; use automated measurements where applicable |
| E11 | Cut at every beat | Pin a reference beat map and interval convention; retain the supplied ±0.15-second tolerance initially and report actual errors/missing/extra cuts |
| E12 | Catalog transition | Define source handles, overlap and expected duration; score preserved content and the handoff |
| E13 | Two-turn refinement | Default to revision of a pending proposal; define which speed parameter doubles and which start anchor shifts. Freeze supported ranges; add an approved-state variant later with explicit human action |
| E14 | Two effects together | Pick supported compatible effects and specify shared timing anchor; check both effects and their interaction |
| E15 | Vague direction | Preserve ≤8 calls to direction/clarification as a pilot metric. Predefine the answer to a clarification; a justified question is not failure. Score the completed coherent result after the scripted answer |

Add isolated fault probes alongside the cases: malformed tool result, stale proposal revision, temporary provider failure, cancellation, unavailable media and lost stream usage. Do not alter the scored creative cases opportunistically to help one model.

The current working tree includes [proposal speed-ramp compilation](../../src/lib/agent/proposal-speed-ramp.ts): bounded 0.5–4 endpoint rates, a complete source trim tuple, a fixed screen duration and a check for available source handles. E05/E13 should validate this actual contract before choosing fixture parameters; “twice as fast” must not silently double screen duration, exceed endpoint limits or consume nonexistent source. This code is present in the inspected working tree, not evidence of a released catalog recipe. Choose two-turn values whose requested refinement stays inside the supported range, then freeze the interpretation in the fixture.

Existing-cut cases end at reviewable proposals. Use preview evidence and fixture-only verification captures under repository contracts; project exports remain separately authorized. If a speech task involves inter-take joins, the MFA gate still applies. Before judging appearance, use frame-state evidence and report its coverage limits. Compare motion and audio with suitable playback evidence.

## 6. Candidate matrix and experiment design

Start with three systems: the actual current agent as a whole-system baseline, one API candidate through the common runner, and one local Glimmer candidate through that same runner. Add Qwen candidates at comparable and smaller sizes after integration is proven. Model names in the supplied brief are a shortlist, not verified downloadable artifacts or a claimed minimum viable size.

First run a tiny capability probe: schema-valid tool call, tool error recovery, structured result, image input if supported, cancellation and usage capture. Separate adapter failures from model failures. Use documented settings per candidate and record differences; do not force the same numeric sampling values when providers interpret them differently.

Then run E02, E05, E13 and E15 as a smoke set. Advance to all E01–E15 only after the runner and accounting work. Run at least three independent attempts per case/configuration for the initial comparison, with fresh fixtures; increase repetitions for unstable or near-threshold results. Rotate order to reduce thermal/cache bias. Measure cold and warm model loads separately.

For fair model comparison, hold tools, policy, retrieved information, fixture readiness and retry limits fixed. First test portability with unchanged task/skill wording. Any model-specific prompt repair is a separately versioned experiment. For end-to-end product comparison, allow each system's native orchestration but label that difference clearly. Add held-out media after the initial suite; keep it separate from development fixtures.

Ablate vision for reference cases only when the compared systems receive equivalent nonvisual evidence. Record whether tools perform their own perception. Smaller models must be measured on the actual target memory/device tiers; success on a 48 GB developer Mac does not establish viability on 16 GB machines.

## 7. Scoring and decision gates

Report case and tier success, human acceptability, schema/tool failure rate, termination reason, self-recovery after tool errors, retries, intervention count, tuning effort, active latency, cold start, peak memory, context maxima, total/cached/uncached tokens, and coverage gaps. Show individual results and sample sizes; small-sample percentiles are descriptive, not guarantees.

Publish both successful-run efficiency and cohort totals. Cost per acceptable edit = all measured attempt/fallback costs in the cohort divided by human-acceptable completions. Apply the same principle to token and active-time efficiency. Present separate model settings rather than aggregating them into one model score.

Provisional pilot gates, to freeze before scored runs:

- No unauthorized timeline writes, self-approval or source damage in any case. Every execution remains bounded by the application.
- No unbounded loops; distinguish a clean stop from harness cutoff and a recoverable clarification. Report cutoff failures even when the working cut remains safe.
- Retain the supplied <2% invalid-call rate and ≤2x baseline tool calls as diagnostic targets, not substitutes for quality or statistical confidence.
- A local workflow is a pilot candidate when advertised E01–E06 and E09–E13/E15 capabilities meet the agreed rubric repeatedly, including refinements and ambiguity. A smaller model passing only Tier 1 is a limited-workflow candidate, not proof of full consumer viability.
- Reference recreation is a separate gate (E07/E08/E14). Failure can justify a narrower advertised scope rather than disqualifying basic editing.
- Freeze task-specific latency, intervention, download and hardware budgets before the full experiment. The source's 60-second example and roughly 20 GB download threshold are hypotheses, not approved universal requirements.
- API-only or hybrid remains a valid outcome. A fallback is its own measured policy with incremental cost, latency and explicit data-sharing behavior.

No single-model pilot proves product-market fit, licensing readiness or support economics.

## 8. Delivery milestones and acceptance

| Milestone | Implementation owner / artifact | Exit evidence |
| --- | --- | --- |
| M0: audit and freeze scope | Source plans plus fixture/candidate manifest | Current capabilities separated from proposed work; unresolved tags, skills and hardware targets listed |
| M1: accounting foundation | Extend task metrics; local receipts; terminal/CSV/JSON usage report | Synthetic tests cover duplicate/cumulative usage, cache/reasoning subsets, missing/late data, forks, retries and cancellation; reports retain failures |
| M2: one complete agent loop | Worker adapter plus external/owned runner and MCP correlation | Local and API task each produce a valid proposal with joined model/tool receipts; approval boundaries and cancellation verified |
| M3: evaluation fixtures | v0.3 manifest, ground truth, isolated projects, reviewer rubric | No unresolved placeholders in runnable cases; hashes pinned; smoke cases reproduce |
| M4: comparative pilot | Repeated case receipts and comparison report | Quality, token/cost, latency, recovery and hardware evidence support a stated capability scope; failures included |
| M5: product usage view | Editor usage surface and tuning-event capture | Day/project/task/model filters; known/unknown and estimate/charge labels; useful drilldown; required UI checks and visual acceptance |
| M6: deployment decision | Local/API/hybrid recommendation and packaging requirements | Target-device evidence, privacy behavior, spending ownership and standalone-loop requirements explicit |

M5 can proceed after M1/M2 and need not delay M4. Full correction-effort scoring requires its tuning events; earlier pilots must use a declared manual reviewer log and disclose that limitation.

Reuse the integration owners in section 3. Extend the worker boundary compatibly: task payloads remain schema-validated separately from usage metadata, and old adapters return explicit unknown usage. Propagate run identity across MCP and local HTTP without granting extra permissions. Pin fixture storage through `TIMELINE_PROJECTS_DIR` and profile isolation through `DREAMCUT_PROFILE_DIR`, using the current resolvers.

For new local usage storage, define its resolver, migration, concurrency, crash recovery and retention policy rather than assuming the current working directory is stable in a packaged app. Keep aggregate accounting independent of content capture and credential storage. Add an app-local read API for reports; no new paid analytics service is required.

Run changed-behavior tests. Any usage UI must follow the [editor UI skill](../../.agents/skills/editor-ui-design/SKILL.md), [shared controls](../standards/editor-controls.md) and [feature integration](../standards/editor-feature-integration.md), including `pnpm check:editor-ui`, `pnpm typecheck` and actual visual/interaction acceptance. A standalone dashboard mockup is not completion.

## 9. Deferred product work

DreamCut branding is applied separately. Keep existing compatibility identifiers, paths and environment variables in this implementation; do not mix storage migration into accounting or evaluation changes.

A packaged standalone application remains a relevant future consumer of the runner. Carry forward requirements for model download/resume/integrity, memory checks, API credential handling, crash/cancel recovery, versioned tools/skills, media dependencies, path relocation and safe updates. Installed coding CLIs are optional integrations, not proof of a self-contained consumer app.

Choose a desktop shell and distribution strategy separately, using actual dependency and platform evidence. This plan does not select packaging technology, change licensing, assert ownership or prescribe product pricing. Success on a developer machine establishes neither clean-install readiness nor support economics.

## 10. Next executable scope

First implementation should deliver M1 and a minimal M2 slice: durable per-attempt usage, a readable local report, model/tool correlation, and one disposable-project task through both a local and API runner. Before downloads or scored API use, resolve current artifacts/provider, credentials, task budgets and target settings through the normal execution workflow. This document authorizes no paid calls or changes itself.

Documentation status: the external evaluation ideas have been adapted to the current application and linked to implementation owners. Model downloads, scored API calls, rename, licensing, project edits, exports and packaging are outside this documentation change.

## Starter implementation — 2026-09-30

The [starter suite](editing-eval-starter.md) now supplies five synthetic audio
proposal cases and a production-schema/derivation grader. This completes an initial
component-evaluation foundation, not the isolated replay runner in the backlog.
See the [current primary-source research](../research/2026-09-30-editing-agent-evaluations.md)
for evaluation frameworks and benchmark versioning. No model score is claimed.
