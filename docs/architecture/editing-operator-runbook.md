# Local editing operator — implementation spike

The operator uses existing DreamCut tools to prepare proposals. It cannot code an effect,
run a shell, approve a proposal, export a project, or save personal preferences. Missing
capabilities remain work for the coding agent. See the [design and remaining acceptance
work](editing-operator-harness.md) and [external research](../research/2026-09-30-editing-harness-foundations.md).

## Installed execution layers

| Layer | Owner / pinned dependency | Responsibility |
| --- | --- | --- |
| Model service | Local `llama-server`; qualification records its build | GGUF + projector inference, tools and actual image inputs |
| Provider adapter | `mcp/harness-llama.mjs` | Request identity, native images, schema projection, tokenizer, output/time limits |
| Tool boundary | `mcp/harness-mcp.mjs`; MCP SDK 1.31.0 | Stdio MCP lifecycle, progressive schema refresh, validation, tool/project restrictions |
| Agent loop | `mcp/editing-harness.mjs` | Budgeted turns, typed recovery, context management, dispatch ordering |
| Session authority | `mcp/harness-session.mjs` | Single writer lease, atomic file checkpoints, conversation and operation journal |
| Optional graph | LangGraph 1.4.18, core 1.2.14, SQLite checkpointer 1.0.4 | Durable interrupts and independently recoverable acknowledged results |
| Observability | `mcp/harness-observability.mjs` | Metadata-only usage logs to the existing collector, local coverage gaps |

The optional graph is an experiment alongside the file journal. It does not replace
project history or make external effects exactly once. No hosted LangSmith service is
required by these code paths. There is no paid API adapter in the runnable operator yet;
OpenAI/Ollama result-shape adapters have component tests only.

## Run qualification

From the repository, with dependencies and `llama-server` installed:

```bash
pnpm agent:check
pnpm agent:qualify all
# Or: pnpm agent:qualify qwen
# Model selectors: glimmer, qwen, ministral
```

The suite verifies installed model/projector hashes, serves one model at a time, runs
synthetic discovery and image probes, and stops its own model server. It does not download
models, start the editor, modify projects or approve proposals. It writes private launch,
request, usage, checkpoint and result records under `private/harness-models/`.
Keep the computer awake and avoid competing inference loads; retain interrupted trials
rather than including their wall time in speed comparisons. The suite has readiness and
request deadlines. A failed run is a result, not permission to increase every budget.

The optional graph tests require **Node 24** and a matching native SQLite build:

```bash
pnpm rebuild better-sqlite3
pnpm agent:check:langgraph
```

Run those commands with Node 24 on PATH. Other Node versions explicitly skip the graph
tests; a skip is not a pass. The base operator and qualification do not require SQLite.

## Run a bounded project task

Start the editor with `pnpm dev` (which also starts the configured local collector).
Start one qualified `llama-server` on a loopback IP with the selected model/projector,
`--jinja`, a 32768-token context for the real-project pilot, one slot, and an explicit model alias. Keep the alias
identical to `--model` below. The model endpoint must be a loopback HTTP origin, for
example `http://127.0.0.1:18341`; paths, credentials and redirects are rejected.

Put the requested task in an ignored private text file, then run:

```bash
pnpm agent:run --project <isolated-project-id> --model <exact-server-alias> \
  --endpoint http://127.0.0.1:18341 --context 32768 --session private/agent-runs/<new-session> \
  --task-file private/task.txt
```

`--context` accepts 16384 (default) or 32768 and must fit the server context. The
synthetic model suite remains fixed at 16384. The actual isolated project read required
18,523 tokens after context preparation, so its pilot uses an explicit 32768-token
configuration; the smaller run correctly blocked.

Optional: `--skills open-edit-proposals,mask-glitch` loads those specific installed skill
files and pins their hashes. `--langgraph` enables the SQLite coordinator under Node 24.
The host first reads current state and supplies applicable preferences in the initial packet.
The operator reads the full timeline, marks and feedback through `timeline_get` before
preparing edits. Timeline JSON is minified and UI-only `_peaks` arrays are omitted with an
explicit receipt; the exact original result is archived by hash. All semantic clip props,
source clocks and preferences are preserved. Waveform judgments still need evidence from
the appropriate tools. The host
fixes the allowed families and excludes direct timeline writes, imports, generation,
assembly, export and profile mutation. The result remains subject to human review. Runner `completed` means the model returned
a final response; it is not a task-success grade. Verify claimed actions against operation
receipts and evaluate the result independently.

Use `--resume` with the same project, model, context limit, skills, session directory and coordinator
mode to resume. Do not reuse a completed session for a different request. The stored
budgets and absolute deadline remain in force; resume does not replenish them. A changed
task or expired budget requires a new session with fresh state. The CLI is not yet an
interactive multi-turn chat or automatic model-server supervisor.

## Local agent in the DreamCut chat

The chat's agent picker lists **Local** when a `llama-server` binary is installed and at
least one qualified model is fully downloaded (`desktop/local-discovery.mjs`). It offers
only those installed models; choosing one starts nothing until the first message.
`desktop/local-session.mjs` then serves that model on a free loopback port with a
65536-token context and one slot. One model is loaded for the whole app at a time, shared
by every window, and stopped after 15 idle minutes or when DreamCut quits. Interactive
starts check file sizes; qualification and evals hash the weights.

The local agent follows the same contract as Codex and Claude: the same editing
instructions, project lease, journaled editing tool bridge and project-scoped tools. It
has no shell, file or approval route. Replies, tool activity and Stop stream to the chat;
Stop aborts the model request, and an already dispatched tool finishes and is journaled.
Each message is bounded to 30 model calls, 40 tool calls, 4096 output tokens per call and
ten minutes. The conversation lives for the session; a new session receives DreamCut's
saved transcript as quoted context. Thinking is off, matching the measured bake-off.
`DREAMCUT_LOCAL_DEFAULT_MODEL` overrides the default model; `DREAMCUT_LLAMA_SERVER` and
`DREAMCUT_LOCAL_MODEL_ROOT` override the binary and model folder.

## Compare local models

```bash
pnpm eval:local-models                       # every installed model
pnpm eval:local-models --models qwen,ministral --trials 3
```

The bake-off serves each installed model in turn with identical settings (32768
context, one slot, thinking off) and runs:

- `audio-proposals-v1`: the five synthetic proposal cases, each repeated (default three
  trials at temperature 0.6) and graded offline. A trial passes only when the production
  proposal validator and the grader both pass.
- `citadella-linked-spacing-v1`: one tool-loop trial at temperature 0 through the same
  five scoped tools and ten-minute limit as the Codex pilot, graded structurally.

Records, including per-trial checks, latency and reported tokens, are written under
`private/local-model-evals/`. Model load time is excluded from latency; malformed,
failed and timed-out trials stay in the denominator. This compares models within one
harness; it is not a human quality review or a comparison with native Codex/Claude
sessions. `EVAL_RUNTIME=local` with `EVAL_MODEL` and `EVAL_MODEL_ENDPOINT` runs the
Citadella case alone against an already running local server.

### Measured bake-off — 2026-10-10

llama.cpp 0.4.0 (build 10809), runner v1, prompt v1, Apple M5 Pro with 48 GB, weights
hash-verified before each run. One run per configuration; failed trials are counted.

| Model | Audio pass rate (15 trials) | Cases always passing | Median per case | Output tokens | Citadella |
| --- | --- | --- | --- | --- | --- |
| Ministral 3 14B Q4_K_M | 93% | 4/5 | 16 s | 5,991 | Fail: schema repairs, then time limit |
| Muse Glimmer 30B Q4_K_M | 100% | 5/5 | 106 s | 23,653 | Fail: too slow to reach a proposal in 10 min |
| Qwen3.6 35B A3B Q4_K_M | 53% | 2/5 | 6.5 s | 7,365 | Fail: repeated one rejected proposal seven times |

Qwen consistently split two field changes on one clip into duplicate operations, which
production validation rejects. With thinking on and an 8192-token budget it passed 40%
(2048 tokens: 7%, mostly budget exhaustion), so thinking stays off. The Citadella column is
the 16384-output, 65536-context rerun; the first run's 4096-token output cap stopped Qwen
and Glimmer mid-proposal and Ministral timed out. The native Codex pilot also failed this
case's structural grade. **Ministral is the chat default**: reliable at interactive speed
and the smallest model. Glimmer is as accurate but too slow for chat; Qwen remains
selectable. These are development cases, not held-out evidence of editing quality.

The chat projects tool schemas for generation (`toProviderTools` with a 1000-character
string cap, depth 5 and no regex/format constraints): full schemas measured ~60K prompt
tokens, and the original 4096-character cap made llama.cpp's grammar parser reject four
tools; the projection is ~11K tokens and every tool parses. Every call is still validated
against the full schema. A read-only end-to-end check on a test project (real MCP tools,
journal and Ministral) listed all seven clips and four lanes correctly, made one journaled
`timeline_get` call and left the timeline unchanged; the first message took about 200 s
including the cold model load.

## Recovery and compaction limits

Intent is saved before dispatch; results are saved before another model request. A
transport exception leaves the operation unknown and blocks further dispatch. A verified
recorded SQLite result can reconcile a file-journal gap. Otherwise an operator must query
the actual job/proposal owner and supply evidence before reconciling. There is no blind
mutation retry and no automatic cross-owner lookup yet.

An abandoned `session.lease` requires verifying that its writer is dead before removal;
there is no timed lease takeover. Conversation originals remain archived when compaction
replaces their prompt projection. Pinned authority/task/skill facts are separate from the
fallible summary, and tool-call/result pairs remain complete. Text tokens use the runtime
tokenizer; images reserve 4096 tokens each, explicitly an estimate. Oversized summary
input blocks; chunked summarization and general media offloading are not implemented. The narrow
`_peaks` projection above is deterministic context preparation, not generated compaction.
No model has yet passed a repeated, long-edit compaction benchmark.

## Evidence and observability

Operator CLI model requests/responses and tool events stay in its private session folder.
The existing collector receives sanitized model usage metadata, with local deduplication
claims and explicit coverage gaps. Missing token counts remain unknown. Delivery is best
effort, at most one export attempt per terminal response; it is not durable exactly-once
telemetry. Qualification retains model usage locally and does not currently export it to
the collector. Local inference is not assigned a fabricated API dollar cost.

The checkpoint is the execution authority; DreamCut owns timeline/proposal/history state;
the collector is diagnostic. Native Codex/Claude internals remain outside this harness's
coverage. Actual image transport and a synthetic color answer do not establish video,
audio, mask quality, creative judgment or useful dials. Run the isolated linked-spacing
editing case and human review before considering a model for routine editor operation.

For isolated eval instances, pass `--editor-url http://127.0.0.1:<port>`; the default
remains port 3123. The origin is pinned for resume. Start that editor with separate
`TIMELINE_PROJECTS_DIR` and `DREAMCUT_PROFILE_DIR` roots and pass the same project root
to the operator. Surface tracking can be discovered through the fixed allowed family;
it does not grant direct timeline writes or approval. Private frozen input packages
can be copied with `node scripts/prepare-editing-fixture.mjs <package> <fresh-private-attempt>`.
That internal setup verifies input hashes, excludes evaluator files, and makes no model call.
