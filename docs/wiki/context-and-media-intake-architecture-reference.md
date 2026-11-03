# Context limits, media intake, and DreamCut architecture

Status: research-to-architecture reference, reviewed 2026-09-27. External findings are in [Long context and video evidence](../research/2026-09-27-context-and-media-evidence.md); local behavior below is linked to code, contracts, and workflow records. This page is an interpretation, not proof that the product's editing outcomes have improved.

Local status was checked by reading the linked files in the working tree based on commit `02e3059`; the checkout also had unrelated uncommitted changes. No media import, agent-retrieval trial, playback probe, or end-to-end editing evaluation was run for this reference.

## The design problem

A large context window can hold many tokens, yet the cited studies show that retrieving and combining the right facts can remain sensitive to position, distractors, reasoning depth, and video-frame selection ([C01–C03, C05–C06](../research/2026-09-27-context-and-media-evidence.md)). For an editor, putting every frame, transcript, waveform, asset description, and past decision into one prompt would also erase the distinction between source evidence, an approximate summary, and a current timeline state. Our design choice is to keep media and evidence in durable, addressable stores and load the relevant slice for each decision. This is an engineering inference, not a measured DreamCut comparison with a giant prompt.

```text
supplied files
  → inventory + verified unchanged sources
  → independently tracked preview preparation and analysis
  → source-linked annotations, timing, coverage, and uncertainty
  → relevant context selected for the current editorial question
  → source-bounded proposal + playback / instruments
  → human review
```

## Why each layer exists

| Failure or system need | DreamCut response | Current enforcement and limit |
| --- | --- | --- |
| Relevant facts may be hard to use in a long, noisy prompt ([C01–C04](../research/2026-09-27-context-and-media-evidence.md#text-context-and-retrieval)). | Give assets stable IDs, paths, and hashes; retain a compact source-context summary and retrieve detail as needed. Load specialist skills only for applicable media roles. | [Media intake](../../.agents/skills/media-intake/SKILL.md) is the routing procedure. A [source-context index](../../src/lib/local-store/media-context.ts) and [project context pack](../../src/lib/media-analysis/project-context.ts) exist; the [HTTP context route](../../src/app/api/projects/[projectId]/analysis/context/route.ts) exposes it. A dedicated, narrowly scoped context lookup in the Timeline MCP and measured agent-retrieval evaluation are still gaps. |
| A file path may disappear or bytes may change after analysis. | Import unchanged bytes by default, verify SHA-256, retain original path as provenance, and derive fresh work from the preserved source. | [Media ingestion](../../src/lib/local-store/media-ingest.ts) enforces managed-copy hashing and records `source-manifest.json`. External references require the user's explicit choice under [AGENTS.md](../../AGENTS.md#media-ingestion). This is source integrity, independent of context-window size. |
| A source may be imported but not usable for smooth, accurate review. | Build separate preview picture/audio and full-quality render authorities, with a readiness receipt. Keep the original source and source-window trims editable. | [Media preparation](../../src/lib/local-store/media-preparation.ts) and the [preview-proxy contract](../standards/preview-proxy-contract.md) gate video placement/playback and validate proxies. This is a decoder and timing requirement, not language-model compression. |
| A sampled or compressed video representation may miss a decisive few-frame event ([C05–C06](../research/2026-09-27-context-and-media-evidence.md#video-evidence-and-sampling)). | Store actual sample times and gaps. Let the editorial question trigger closer inspection of the relevant source interval; preserve unknowns where coverage is insufficient. Do not convert sparse stills into claims about continuous action or exact cuts. | The [media-annotation procedure](../../.agents/skills/media-annotation/SKILL.md) states these limits, and [source-context validation](../../src/lib/local-store/media-context.ts) rejects discrete frames claiming continuous coverage. Automatic query-aware resampling and a measured short-event recall gate are not established. |
| An analysis result can be mistaken for source truth or reused after source changes. | Keep observations and deterministic derivations distinct; record producer, recipe, checksum, source-time coverage, and active revision. Bind timeline clips back to source intervals. | [Source-context validation](../../src/lib/local-store/media-context.ts) checks evidence levels and revision history; the [project context pack](../../src/lib/media-analysis/project-context.ts) projects timeline windows to source time. Completeness and model accuracy still require their own evaluation. |
| Import, preview readiness, description, transcription, and editing have different authority. | Track them as separate states. Use intake and processing to prepare evidence; make editorial placement a reviewable action. | [Media intake](../../.agents/skills/media-intake/SKILL.md) separates per-file readiness. The [import-processing harness](../import-processing-harness.md) records annotation jobs separately from preview preparation. The [proposal gate](../../AGENTS.md#proposing-an-edit-instead-of-making-one) governs existing timelines. Import does not authorize assembly or export. |

## What preprocessing means here

“Preprocessing” covers several different products of a source. A **preview proxy** changes the playback representation to meet editor performance and timing contracts while preserving a full-quality render authority. A **waveform** helps navigate audio. A **transcript or alignment** indexes speech and can support source-bound cuts or captions after the required review gates. **Visual annotations and sampled observations** make portions of media searchable and inspectable, with explicit coverage. **Optional transforms** such as cutouts or stabilization create separate derivatives with recipes and source-clock mappings. None is a replacement for the original media, and none by itself proves an edit is correct. See [media preparation](../../.agents/skills/editor-media-preprocessing/SKILL.md) and [import processing](../import-processing-harness.md).

The context benefit is selective access: an agent can start from a brief, source ID, and bounded summary, then inspect the exact interval, transcript, frame, or receipt needed for a decision. The source-preservation, playback, and approval benefits stand on their own even if a future model could read an entire video reliably.

## Evaluation and open architecture work

The next useful comparison is a frozen set of real editing questions: global content discovery, a short visual event, exact spoken boundary, and a long project with distracting assets. Compare bulk-context, current summary-first, and summary-plus-targeted-inspection routes on correct source/interval selection, missed events, unsupported certainty, token/latency cost, and final reviewed edit quality. Use source-grounded annotations and human review for the answer key. The external benchmarks motivate the test design but do not predict its result.

The [agent/skill/workflow findings](../research/2026-09-16-agent-skill-workflow-design.md) and [editorial assembly harness](editorial-assembly-harness.md) cover how context is supplied across a longer edit. The [spatial reference](../architecture/spatial-engine.md) covers one specific downstream use of source evidence. The [failure-mode map](agent-failure-mode-reference-map.md) identifies the next topics that deserve this same research-to-contract treatment.
