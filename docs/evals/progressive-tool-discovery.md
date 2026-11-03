# Progressive tool discovery through the owned harness

Case: `progressive-tool-discovery-v1`.
Purpose: verify that a model can find an editing capability using ordinary language,
load its tools, and invoke one after the harness registers the updated schemas.
This is distinct from `client-tool-refresh-v1` native-client qualification.

## Runtime boundary

The owned eval client holds a real MCP session with the production server behind the
isolated fake-job probe. It starts with the editing profile, fetches its initial tool
list, and checks requested tool names against the registered list. After a successful
family load, the client fetches and registers tools/list before returning control to the
model. Returning schema text is not the only mechanism: the adapter actually refreshes
its dispatch allowlist. The model receives schemas as CLI JSON and invokes the bridge;
these are not newly registered native function definitions in the model API. The probe refuses real jobs and mutation calls independently.

Codex subagents drive this client using its bounded CLI bridge. This qualifies the
model + owned adapter path; it does not establish native Codex notification handling.
Subagents still have their ordinary outer capabilities, so this is a prescribed tool-only
trial, not a hard sandbox of the entire subagent. Logs and returned answers must show
that they used only the bridge for the task. No project/media operations are authorized.

## Frozen task and acceptance

Ask each model, independently, to find masking tools and check project `refresh-probe`,
job `probe-job`, then report the returned marker. Supply bridge commands and the initial
tool schemas, but not a correct family ID, expected marker or a sequence of answers.
Do not use another agent's answer as context for the second run. Use fresh sessions and
private receipts per attempt; preserve failures.

Pass requires all of:

- Initial registered tools exclude cutout_status.
- Catalog discovery identifies the cutout preparation capability.
- Family load emits a list-change notification.
- The owned client fetches the updated list and registers cutout_status.
- The model requests status through that registered tool; the fake backend returns its
  unpredictable marker and the model reports the same marker.
- No forbidden calls, timeout or runtime errors occur.

Record requested model versus inherited/default model separately; do not infer an exact
model ID from an agent name. Retain fixture/server/client hashes, prompt, call count,
elapsed time and available token usage. Token usage remains unknown when not provided
by the subagent runtime. This test uses no pixels or audio and establishes no editing
quality, masking quality, token savings or latency advantage over the full profile.

## Commands and observed results

```sh
pnpm eval:discovery start private/eval-tool-refresh/<new-run>
pnpm eval:discovery list private/eval-tool-refresh/<new-run>
pnpm eval:discovery call private/eval-tool-refresh/<new-run> <tool-name> '<json>'
pnpm eval:discovery:grade private/eval-tool-refresh/<new-run> <model-reported-marker>
pnpm eval:discovery stop private/eval-tool-refresh/<new-run>
pnpm eval:discovery:check
```

The bridge has a 120-second lifetime and 15-call budget. Its loopback connection token
is stored with restrictive permissions and removed on shutdown; receipts stay private.
Start immediately before assigning the model task. A new run requires a fresh directory.
The grader checks both production-probe transport evidence and the client registration/
dispatch trace, including an exact match to the marker reported by the model.

Two real Codex subagent trials completed on 2026-09-30:

| Model selection | Result | Actual tool calls | Registered tools | Observed elapsed |
| --- | --- | --- | --- | --- |
| GPT-6 Sol | Pass | 3 | 11 → 14 | 91.6 s |
| Inherited/default model (exact ID not exposed) | Pass | 3 | 11 → 14 | 39.6 s |

Both discovered the family through catalog search, loaded it, then called the newly
registered synthetic status tool and reported its fresh marker. No rejected calls or
runtime failures occurred. Receipts and code hashes are retained under private eval runs.
Elapsed spans initial registration to the returned status, including scheduling and
bridge overhead. These single runs are functional qualification, not a model speed
ranking or a claim of token savings; token usage was unavailable.

Operational decision: full exposure remains the native Codex default. Progressive
exposure works through this owned adapter; other production/model runners need the
same explicit refresh/registration integration before adopting the editing profile.

Adapter/grader v2 binds the client and probe receipts by run ID, rejects mixed-run
evidence, and refreshes dirty state before subsequent list/call requests. Version-1
results remain historical; repeats after this change use fresh run directories.

Version-2 repeats also passed after receipt binding and late-notification hardening:

| Model selection | Result | Actual tool calls | Observed elapsed |
| --- | --- | --- | --- |
| GPT-6 Sol | Pass | 4 | 52.9 s |
| Inherited/default | Pass | 3 | 44.9 s |

Sol loaded the same family twice; the repeated load was harmless but unnecessary and
is retained in the call count. These were repeats by the same subagents, not held-out
samples. Both returned the new run's correct marker and passed same-run receipt checks.
All four trial directories were stopped explicitly after grading.


## Local Ollama native tool runner

`pnpm eval:discovery:ollama <installed-model-tag>` uses the local Ollama chat endpoint.
It supplies the currently registered MCP schemas as actual function tools on every
inference request. After catalog loading, the next request includes the newly registered
definitions. This is provider-native tool calling through the owned adapter, unlike the
Codex subagents' CLI-JSON method. Same fixture and grader, different model interface.
No shell, filesystem or network tool is supplied to the model. It cannot download a
model or silently fall back to another tag. Model digest, settings, turn responses,
Ollama token counters and final grade are retained privately. Text-only probe: no visual
inputs or editorial quality claims. Input tokens sum per-request counts and include
repeated context; they are not unique prompt text or API billing estimates.

Current settings: temperature 0, thinking disabled, 16,384 context tokens, 512 output
tokens per response, eight model turns and 15 tool calls. Warmup precedes the bounded
probe. The runner rejects tools not supplied on that inference turn, including calls
that guess a future tool in the same batch as loading it.

## Before general editing-agent use

This small eval runner does not yet implement context compaction, context-budget
estimation, automatic durable resume, model-guided tool-error recovery, or translation
of MCP images into actual model visual inputs. Those require separate acceptance cases
that preserve current intent, locked choices, pending jobs, source/revision identity and
approval boundaries across long sessions. Existing media-job caching is not agent-session
resume. Current hard stopping limits are intentional and are not compaction.

Local result, 2026-09-30: installed `qwen3.6:27b-q4_K_M` (digest prefix
`3a40c32f1450`) passed the provider-native variant on its first recorded attempt. Three
tool calls, four model responses, 19,160 summed input tokens and 292 output tokens.
Model warmup: 27.5 s; post-warmup run including final response: 103.7 s. The transport
marker arrived after 89.4 s. No retries/rejected calls. One text-only synthetic result,
not statistical reliability or real-footage quality. The local model remained loaded
under the runner's five-minute keep-alive; no extra model was downloaded.
