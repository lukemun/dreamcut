# Local harness qualification v1

Purpose: establish that an exact local model/runtime can use progressive MCP discovery
and actual visual tool results through our bounded runner. This is a synthetic development
suite, not an editorial benchmark or a model ranking.

Runner: [qualify-local-model.mjs](../../mcp/qualify-local-model.mjs).
Launcher: [local-model-suite.mjs](../../mcp/local-model-suite.mjs).
Commands and operational boundaries: [operator runbook](../architecture/editing-operator-runbook.md).

## Cases and acceptance

| Subcase | Inputs and allowed actions | Deterministic pass | Does not prove |
| --- | --- | --- | --- |
| `discovery` | Synthetic MCP backend; exact project/job IDs; catalog search/load and read-only status | Ordered refresh grader passes; final answer contains the nonce actually returned by the hidden status tool | Native Codex refresh, real segmentation, editing quality |
| `vision` | Random two-color PNG returned as MCP image content; neutral filename; no color in tool text | Model calls evidence tool and names the left color; execution completes | Mask boundaries, video continuity, complex vision |
| `vision_omitted` | Same question; evidence tool explicitly returns no image | Model calls evidence tool and answers UNKNOWN | General hallucination resistance |

The model cannot reach the grader or expected answer through these fixture tools. Each
case starts with fresh conversation/checkpoint and has eight model calls, eight tool calls
and a ten-minute deadline. The service uses 16384 context tokens, temperature zero, 512
output tokens and one slot. The llama.cpp generation schema caps long strings at 256
characters; the original tool schemas still validate dispatch. Prompts and runner have
separate version fields. Keep earlier failed runs when a prompt or adapter changes.

Private records include runtime/template properties, source hashes, settings, raw request
payloads, reported usage, actual image bytes, ordered tool records and results. The launcher
records measured model/projector SHA-256 identities before inference. Earlier exploratory
launch records contained expected download digests and size checks only; they are not
retrospectively promoted to measured launch identities.

## Infrastructure regressions

`pnpm agent:check` covers image validation and unsupported modalities; original-schema and
project enforcement; progressive registration; saved-session leases and SIGKILL recovery;
unknown side-effect blocking; complete exchange reconstruction; bounded typed recovery;
stale-state refresh; compaction source retention; token/image estimation; metadata-only
usage export and deduplication. `pnpm agent:check:langgraph` adds SQLite close/reopen,
interrupt continuation and recovery of acknowledged results under Node 24.

These deterministic tests establish code behavior. They do not mean every model has passed
a model-driven recovery or compaction case. Real-owner reconciliation, repeated compaction,
human correction during a resumed edit and integrated proposal quality remain separate
acceptance targets in the [design](../architecture/editing-operator-harness.md).

## Measured qualification — 2026-10-01

All three downloaded models passed all three probes in the final verified run, using
llama.cpp 0.4.0 / build 10809 (`5266f24da`), runner v3 and prompt v2. Actual weights and
projectors matched their download SHA-256 records. Executed source snapshots were retained
privately and verified against every trial manifest.

| Model | Discovery | Actual image | Image omitted | Reported input / output tokens, total for three cases |
| --- | --- | --- | --- | --- |
| Muse Glimmer 30B Q4_K_M | Pass, 155.8 s | Pass, 29.5 s | Pass, 26.3 s | 24,208 / 998 |
| Qwen3.6 35B A3B Q4_K_M | Pass, 18.8 s | Pass, 1.9 s | Pass, 1.3 s | 21,880 / 190 |
| Ministral 3 14B Q4_K_M | Pass, 38.6 s | Pass, 2.3 s | Pass, 1.5 s | 20,841 / 126 |

Each model made five tool calls across the three cases (three discovery, one image,
one omitted-image control). The reported token sums include repeated context and may
include cached input; tokenizers differ. No usage field was missing in this run. These
are local inference counts, not API charges. Per-case times exclude model loading and
weight verification. Load times were approximately 2–3 seconds with this machine's cache
state; they are not cold-start guarantees.

This is **one final trial per case/model**, with different randomized color pairs.
Use Qwen as the next pilot candidate based on this limited result, not as an established
quality winner. Repeat matched fixtures and test actual proposals before any broad switch.
The older Ollama Qwen 27B is a different model and is not included here.

Earlier exploratory trials remain in private records, including schema/template failures,
incorrect IDs, startup failures and timeouts. Some timeout intervals coincided with host
sleep/wake events. They were not discarded, converted to passes or pooled into the table.
Passing the final probes does not erase those earlier reliability observations.

No trial here approves or exports an editor project. Model-driven long-edit compaction,
owner reconciliation after an actual side effect, resumed human corrections and creative
quality remain unqualified.

## Real-project integration smoke

A separate Qwen read-only smoke used the existing isolated project, the proposal skill,
a host ceiling exposing only `timeline_get`, the real MCP backend, and the optional
LangGraph coordinator. With an explicit 32768-token context, it made one acknowledged
tool call and returned the correct element count. The timeline hash was unchanged.
SQLite retained the completed operation and three graph checkpoints. Both model response
IDs appeared exactly once in the local collector, matching 24,681 reported input and 37
output tokens in the session evidence. This validates that narrow integration, not proposal
authoring or unrestricted tool selection.

Earlier smoke attempts are retained: a 16K overflow, an unsupported claim of a tool call
with zero model operations, and a stricter 16K run that called the tool but could not fit
the result. The successful grade checks the journal and known answer, not the model's
claim of completion. Full-timeline reading before a proposal is currently instructed; it
is not yet a separate host-enforced gate.

Validation for this implementation: 48 base harness tests and four Node 24 LangGraph tests
passed, along with typechecking and the tool-registry check. No human visual/editing-quality
review is implied by these checks.
