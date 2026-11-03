# Configurable visual analysis

`visual_analyze` is one project-scoped MCP tool in the `visual-evidence` capability.
It delegates visual interpretation to a configured local model, so a text-only editing
operator can request observations without receiving or interpreting pixels itself.
The analyst has no tools. The editing operator retains responsibility for planning,
proposal creation and human review.

## Workflow routing

[Media intake](../../.agents/skills/media-intake/SKILL.md) owns the starting decision;
its [analysis routing reference](../../.agents/skills/media-intake/references/analysis-routing.md)
chooses evidence according to the question. Media annotation owns descriptions and
catalog judgments; editor media preprocessing owns technical readiness. A workflow
can call the same analysis tool after preprocessing. Transcoding alone does not
implicitly request semantic analysis.

Talking-head orientation can start with sparse samples and separate speech evidence.
An effect investigation uses an overview followed by denser samples around relevant
changes. Mask and caption review use appropriate source or composed timeline evidence.
Sampling density is a decision, not a universal per-second requirement. Local inference
still consumes time, memory, power and context even without API charges.

## Host configuration and authority

Set `DREAMCUT_VISION_BACKENDS` in the environment of the MCP server/harness:

```json
{"default":{"endpoint":"http://127.0.0.1:18341","model":"local-vision-model","revision":"weights-and-projector-v1"}}
```

The server must already be running a vision-capable llama.cpp model with that alias.
Only loopback HTTP origins are accepted. Tool callers choose a configured backend name;
they cannot supply endpoints, download models or upload media to a remote service.
The operator harness defaults to its active local model when no backend map is supplied;
`DREAMCUT_VISION_REVISION` supplies that default's optional revision. Reusing the loaded
model avoids loading a second large model. A separately configured analyst is also possible.

Revision is host-declared, not independently verified against model weight files. Change
it when weights/projector change. Without a revision, completed observations are never
reused; queued/running work is still deduplicated. Model alias, vision support, server
build, context and chat-template fingerprint are checked against the running service.

## Tool contract

```json
{
  "project_id": "example",
  "action": "prepare",
  "evidence": {"kind":"source","source_relative_path":"clip.mp4","times_seconds":[0,1.2]},
  "preset": "effect-breakdown",
  "question": "Describe the visible layers and what changes between these samples.",
  "backend": "default",
  "max_output_tokens": 1024
}
```

Poll with `project_id`, `action: "status"` and returned `job_id`, respecting the
five-second polling hint. Presets are `source-description`, `effect-breakdown`,
`mask-review` and `caption-review`. Questions are bounded to 1,000 characters;
output budgets are 256–2,048 tokens. The model receives constrained JSON output
instructions and schema, and the owner validates exactly one observation per cell.

Evidence choices:

- `source`: 1–12 explicit source seek times, using the existing source-evidence owner.
  These are requested seek times, **not frame-exact PTS** or proof of continuous motion.
- `image`: one project static PNG/JPEG/WebP, display-oriented and fitted within 1024px,
  converted to JPEG. Fine edges, transparency and exact pixel geometry need other evidence.
- `timeline`: a completed verified frame-state report relative to project instruments,
  plus zero-based `page`; up to six composed frames per page with their frame/time identity.

Unimported catalog collections retain their existing inspection workflow. Do not create
projects merely to use this tool. No source, timeline, approval, preference or Library
annotation is changed. Saved model observations are not human-verified metadata.

## Persistence, recovery and accounting

The owner is `src/lib/agent/visual-analysis.ts`; a fixed CLI worker runs admitted jobs,
and `mcp/visual-analysis-bridge.mjs` connects MCP to that owner. Jobs live under project
`instruments/visual-analysis/<id>/`, with restrictive file permissions. Receipts include
input hashes, runtime/prompt identity, sample provenance, per-cell observations and
uncertainties. Raw model events and evidence pixels remain private project artifacts.

Cache identity includes the request, source/report dependency hash, backend/runtime and
implementation hashes. Completed reads verify saved artifacts and current dependencies.
Changed inputs invalidate reuse; old receipts remain. Failed attempts require explicit
`retry: true`; retries create new jobs. Queued work older than 30 seconds without a worker,
dead workers and expired deadlines report failure. Inference is bounded to 180 seconds,
with a five-minute overall deadline. There is no cancellation API or automatic retry.
The MCP bridge has a 25-second admission/status bound; large source hashing can exceed
it. An interrupted admission may have created a job: inspect existing jobs before retrying.

Each model response uses the existing local usage exporter and collector, correlated by
job ID, including model, tokens and latency. MCP dispatch counts remain separate from
model calls; status polls are tool calls, cache hits do not imply new inference. Export
failures leave local receipts/coverage gaps; they do not retry inference. No new collector
is required. Native Codex/Claude visual reasoning outside this tool remains outside this
particular instrumentation boundary.

## Verification and limits

Unit tests cover pixel delivery, provenance, unchanged timelines, cache reuse, stale or
corrupt evidence, explicit retry, runtime changes, endpoint boundaries and output coverage.
A real Qwen run through the MCP SDK and detached worker correctly described a synthetic
red/blue image and two separately sampled red/blue video frames; repeated requests reused
both jobs. The first unconstrained prompt merged both video cells into one observation
and was rejected; prompt version 2's constrained output passed. This validates plumbing
and simple visual discrimination, not effect/mask/caption judgment quality or all models.

Routing walkthroughs distinguish import-only readiness, sparse talking-head orientation,
dense effect windows, unimported catalog inspection and unavailable-model recovery. These
are workflow checks, not measured quality improvements on a production edit. Additional
model and editorial evaluations remain separate from this implementation smoke test.
