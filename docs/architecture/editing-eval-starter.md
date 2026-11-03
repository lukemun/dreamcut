# Editing evaluation: starter suite and system comparisons

See the [eval registry](../evals/README.md) for case purposes, readiness and parked candidates.

Status: five synthetic proposal-component cases and a local grader implemented.
A [bounded linked-spacing tool runner](citadella-eval-pilot.md) now supports an
isolated Codex trial. General replay, local model adapters and automatic retrospective
extraction remain next steps. This interprets the [2026-09-30 research](../research/2026-09-30-editing-agent-evaluations.md)
for the [evaluation contract](../standards/editing-evaluation.md).

## What we evaluate

The evaluated system is the model and quantization, inference runtime, prompts,
skills and context, tool descriptions and implementations, orchestration harness,
and editor version. A tool result or image supplied to the model is part of the
input. The model chooses existing operations; implementing new effects belongs to
the coding workflow.

A comparison with identical inputs, tools and harness but a different model tests
that model configuration within our system. Changing a skill or tool as well is
a whole-system comparison. Keep both useful, but label them differently. Native
Codex versus a local tool loop is initially a whole-system comparison, not evidence
of the isolated difference between the underlying models.

Proposed full flow:

```text
frozen pre-edit case → model + instructions → tool loop → reviewable proposal
                                                    ↓
                              production validation + outcome graders
                                                    ↓
                         quality, preservation, latency, usage, reliability
```

## Layers and tooling decision

1. Public BFCL and τ benchmarks: optional model shortlisting and methodology references.
   Their tasks do not certify our editing workflow. Pin their exact versions; Sierra's
   grading update is a concrete reason not to compare unnamed historical scores.
2. Proposal-component suite, implemented here: check a bounded model-produced payload
   against real DreamCut schema and derivation. State is supplied, and no tool loop runs.
3. Full DreamCut replay, proposed: frozen project/profile copies; real tool discovery,
   feedback capture, proposal preparation and recovery; no agent approval. Evaluate
   motion/audio and creative usefulness separately with calibrated human review.

Keep the domain-specific graders in TypeScript beside the contracts they exercise.
No new evaluation library is installed in this starter. Prefer evaluating Inspect's
external-agent integration when adding full replay, so we can retain our production
harness instead of replacing it with a framework's default agent. Promptfoo is an
alternative for compact prompt/provider matrices and saved-output assertions.
These are architecture recommendations, not verified integrations.

## Five starting cases

| Case | Request | What a passing result demonstrates |
| --- | --- | --- |
| mute-speech | Mute speech | Correct target and native volume envelope; music preserved |
| lower-music | Music at 0.2 linear gain | Correct level; speech and timing preserved |
| music-fades | 0.5 s in, 1 s out | Both fades; volume and other clip preserved |
| music-level-and-fades | Level and both fades together | Complete compound adjustment in one reviewable option |
| already-muted | Ensure speech is muted | No unnecessary edit when already satisfied |

All inputs are synthetic metadata. No footage, real feedback or personal preferences
are published. These are development cases, not a held-out set or representative
editorial benchmark. The current suite does not hear audio, test visuals, retrieve
state, record feedback, persist proposals, test HTTP/MCP, or execute model calls.

The grader checks real schema/mutation accounting, fixture revision, permitted
operation scope, the derived full timeline (including volume envelope), unchanged
unrelated state and exposed review dials. It ignores only derived `updated_at`
timestamps. Unsupported operations fail before derivation; only audio patches are
allowed in this initial suite. Pure derivation writes no project or profile files.
It does not prove the complete production endpoint would accept a payload.

## Run the starter

```bash
pnpm eval:editing list
pnpm --silent eval:editing packet lower-music
pnpm eval:editing grade lower-music /absolute/path/to/proposal.json
pnpm eval:editing:check
```

`packet` produces model-visible state, request and output shape. Save a model's
schema-2 proposal body as JSON and use `grade`; no transport envelope is expected.
Reference answers exist only in the grader tests and are not included in the packet.
A future runner must deny model access to grader code/tests and expected outcomes;
a model with repository access would contaminate this benchmark.

`grade` returns per-check results and exits nonzero on failure. `check` validates
known passing solutions and deliberately wrong candidates. Passing those checks
means the grader works on those examples, **not that a model passed**. There are
currently no measured model scores for these five synthetic audio cases. Do not drop malformed, timed-out or failed runs
when calculating trial success later.

## Next increments and refresh

First add an isolated production-tool runner with a baseline adapter and one local
model adapter. Record exact model ID/weights hash/quantization, runtime/settings,
hardware, assembled prompt/context/tool hashes, app revision plus dirty source
fingerprints, case/grader version and run ID. Stop at a proposal. Capture failures
and retries, then repeat the same cases with a second model under the same harness.

Add a handful of visual, temporal, ambiguity and tool-error recovery cases as those
capabilities stabilize. Promote real review candidates with frozen pre-edit
state and known human outcomes. Keep private case assets outside Git; hold out entire
source sessions to reduce leakage. Keep the five simple cases for regressions when
they saturate; they should not dominate an overall quality claim.

When reviewing uploaded export evidence, capture zero to three useful candidates. Refresh affected cases when tools, effects, renderer behavior
or preferences change. At each comparison batch, verify telemetry coverage and
refresh API prices with effective date/currency. Missing cost or token data is
unknown, not zero. OTel usage remains separate from editorial review questions;
run-to-trace linkage and complete cost accounting still need implementation.

While trials are active, review coverage and stale cases roughly monthly or before
a comparison. This is a working cadence, not an installed scheduled automation.
The [evaluation contract](../standards/editing-evaluation.md) owns the ongoing workflow;
case curation is a DreamCut team tool outside this repository.
