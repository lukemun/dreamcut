# Editing evaluation contract

See the [eval registry](../evals/README.md) for case purposes, readiness and parked candidates.

Status: maintained benchmark design and manual curation contract. Automatic candidate
extraction, case promotion UI, general replay and run/outcome joins are not yet
implemented. A [bounded linked-spacing pilot](../architecture/citadella-eval-pilot.md)
can run an isolated Codex tool trial; visual/audio acceptance remains separate. Existing telemetry is described in [observability](../observability.md).
A [five-case proposal-component starter](../architecture/editing-eval-starter.md)
is implemented; its offline grading checks do not execute a model or full tool loop.

## Scope and authority

Evaluate an editing operator using existing DreamCut tools, effects and source footage.
The coding agent continues developing those capabilities separately. A model under test
may select tools, parameters and review controls; it may not write implementation code,
install dependencies or modify its own tool contracts to pass a case. Record missing
capabilities separately from tool selection, instruction, context and model failures.

Selection and preparation use the DreamCut team's curation skill, kept outside this
repository. Existing proposal, assembly, source preservation and human approval
contracts still apply. Case capture never authorizes inference, export, publication,
working-timeline writes or model downloads. Respect learning/automatic-worker opt-outs.

## Candidate evidence

Choose a bounded editorial decision rather than making every full video a case. A useful
candidate tests a supported capability, recurring correction, consequential constraint,
ambiguous request, failed attempt, or interaction between effects. Include straightforward
successes and rejected attempts to avoid a set containing only difficult or successful work.

Every candidate records:

| Field | Evidence required |
| --- | --- |
| Identity | Candidate ID/revision, project, export checkpoint and retro IDs when available; deduplication key from checkpoint, request and target beat |
| Intent | Original user wording and evidence IDs; paraphrase, inferred intent and unknowns labeled separately |
| Starting state | Pre-request timeline/metadata revision and required footage/analysis references; missing starting state blocks replay, not candidate capture |
| Capability | Tools, effect/recipe identifiers, controls and readiness required; observed gaps and why this case is useful |
| Constraints | Locked timing, speech/source bounds, preserved choices, target beat and requested scope |
| Outcome | Proposal/revision/feedback IDs, human decision, final overrides, corrections; distinguish completed export from human acceptance |
| Acceptance | Observable invariants plus subjective rubric and allowed alternatives; final cut is one accepted reference, not the only valid output |
| Limits | Missing tuning history, uncertain attribution, media readiness, rights/sharing status and unresolved evidence |

Private candidates may be manually stored under the owning project's
`memory/eval-candidates/<candidate-id>.json`. This is a document convention, not an
existing Memory API, indexed UI or validated runtime schema. Use an immutable file per
revision; link superseded records. Do not add unknown fields to existing retro schemas.
When replay input is unavailable, mark the candidate `needs-evidence`; never reconstruct
an alleged original request or starting timeline from the accepted result.

## Promotion and comparison

Candidate capture is separate from selecting a runnable case. A maintainer selects the
case and verifies its evidence; selection does not approve an edit. Freeze input media
hashes, source windows, timeline/metadata, analysis readiness, relevant preference snapshot,
request, permitted tools/schema, skill/recipe versions, grader/rubric and suite revision.
Keep reference answers, final overrides and post-request corrections out of model inputs.
If refinement is the task, disclose the correction at its defined interaction step only.

Each attempt uses an isolated project/profile with the same starting state and authorized
tool boundary. Until an isolated runner enforces this, case execution remains pending.
Stop at a reviewable proposal; never self-approve. Check schema/constraint correctness
separately from editorial usefulness, control coverage, visual/motion/audio evidence and
human correction effort. An automated judge is advisory and must not stand in for human
approval. Unknown/unreviewed quality is not a pass. Include failed and timed-out attempts
in denominators; record repeats and sampling settings rather than cherry-picking runs.

Maintain a small frozen regression set and a growing candidate pool. Keep a held-out set
when tuning instructions or choosing models; split related cuts/source sessions together
to reduce leakage. Label creator-specific results as such, not universal editing ability.
Use cleared synthetic/redistributable fixtures for public benchmark releases. Production
media clearance is not permission to publish footage, transcripts or personal preferences.

## Refresh policy

| Trigger | Refresh | Preserve |
| --- | --- | --- |
| Enabled export retro | At most three distinct candidates from existing evidence, or none/insufficient evidence | No mandatory model trial or extra export; no new delivery blocker |
| New tool/effect or changed schema, controls, proxy/renderer behavior | Capability inventory; impacted case compatibility and checks | Old case/run versions; mark stale before comparing |
| New correction or changed personal preference | Relevant rubric or a new scoped case revision after review | Original preference snapshot and acceptance evidence |
| Next planned trial, or monthly if actively experimenting | Candidate balance, duplicates, missing evidence, hold-outs, retirements and media availability | Frozen regression set; never silently rewrite expected outcomes |
| Every comparison batch | Model/quantization hash, runtime/adapter, prompt/tools/skills, context budget, sampling, hardware and app revision | Exact run configuration and failure records |
| Every API cost comparison | Provider/model pricing source, effective date, currency, cache/reasoning billing rules | Raw usage and old estimates; recompute with a labeled price version |

These are maintenance triggers, not an installed scheduler. Changes invalidate affected
comparisons, not the entire suite by default. Show coverage by capability and evidence
quality; one aggregate score must not hide unsupported tasks or regressions.

## Metrics outside the retro

Run telemetry owns observed tokens (including subset semantics), elapsed time, retries,
tool failures, timeouts, peak memory and local performance alongside editor playback.
Task-to-proposal and outcome joins, hardware sampling and pricing remain implementation
work. Report unobserved data as unknown; do not assign usage by guesswork. Separate model
latency from tool/preprocessing time and creator wait. Cache is part of input usage, not
an extra total. Local inference has no API token charge, but compute/memory still matter.
The retro cites a run ID when available rather than duplicating token or pricing tables.
