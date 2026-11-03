# Spatial reasoning and agent system design — sourced findings

This record describes published research and engineering guidance. DreamCut-specific interpretation is in the [wiki article](../wiki/spatial-evidence.md).

| Field | Value |
| --- | --- |
| Date | 2026-09-12 |
| Method | Targeted web searches followed by primary publication pages, official engineering articles, a standards primer, and an original interview transcript. Examined scopes are recorded in the source inventory. |
| Sourcing | [Research-deliverable skill](../../.agents/skills/research-deliverable/SKILL.md); inline primary-source citations |
| Coverage | Bounded investigation, not a systematic literature review or an independent benchmark replication |

## Visual spatial reasoning

**R01.** The published ACL version of Kancheti and colleagues' paper describes an evaluation of sixteen models across thirteen spatial benchmarks. It reports that chain-of-thought prompting degraded visual spatial reasoning and that a No-Image++ ablation exposed hallucinated visual details from textual priors. The published version is dated July 2026. [ACL Anthology publication record](https://aclanthology.org/2026.acl-short.71/)

**R02.** The SpaceTools authors describe a two-phase training process combining demonstrations with interactive reinforcement learning for multi-tool coordination. Their project page reports evaluations on spatial benchmarks and robot manipulation, and distinguishes tool-free baselines from their tool-augmented model. The page identifies the work as CVPR 2026. [SpaceTools project and results](https://spacetools.github.io/)

## Agent workflow and tool design

**R03.** Anthropic distinguishes predefined workflows from agents that direct their own tool usage. Its guidance recommends beginning with the simplest adequate solution and adding complexity when needed; it also describes the latency/cost tradeoff of agentic systems. The currently retrieved article explicitly notes that parts of its tooling discussion have changed since its December 2024 publication. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

**R04.** Anthropic recommends a small set of tools oriented around useful tasks, concise relevant tool responses, and evaluations grounded in realistic tasks. It recommends measuring tool errors, calls, runtime, and token consumption alongside task accuracy. [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)

**R05.** Anthropic's context-engineering article discusses selecting and maintaining the information available to an agent, including just-in-time retrieval and retaining references that allow relevant information to be fetched when needed. [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

## Provenance and read representations

**R06.** W3C PROV represents entities, activities, agents, derivations, revisions, and plans. Its primer illustrates tracing a revised chart to a revised input dataset and to the activity that produced it. [PROV Model Primer, sections 3.6–3.7](https://www.w3.org/TR/prov-primer/)

**R07.** Fowler describes separating models used for updates and reads, while warning that CQRS can add substantial complexity and is appropriate only in selected parts of a system. He also describes a reporting database as an alternative for demanding queries. [CQRS](https://martinfowler.com/bliki/CQRS.html)

## Evaluation and cognition

**R08.** Anthropic distinguishes the agent transcript from the actual resulting state of the environment. Its evaluation guidance describes complementary code-based, model-based, and human graders, with different strengths and limitations. [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

**R09.** In an interview published October 17, 2025, Karpathy discusses LLM cognitive deficits and compares information in the context window with working memory, contrasting it with compressed knowledge in model weights. [Original interview transcript, approximately 17:46–22:07](https://www.dwarkesh.com/p/andrej-karpathy)

## Method, caveats, and sources

The [source records](raw/spatial-evidence/sources.md) preserve titles, dates where established, section locators, short excerpts, and limits of examination.

R01 is supported by the published ACL abstract, and R02 by an author project page; neither entry represents an independent reproduction or a full methodological audit. The original 2026-09-12 R01 capture used a prepublication summary reporting seventeen models; the 2026-09-27 check found that the published ACL abstract reports sixteen. R03–R05 and R08 are provider-authored engineering guidance. R06 is a provenance specification primer. R07 is an architectural essay. R09 is an expert interview. Treat these different kinds of evidence according to their stated scope, rather than as equivalent experimental results.

For a broader paper survey and later multi-image and interactive benchmarks, see the [2026-09-27 spatial-reasoning update](2026-09-27-spatial-reasoning-frontier-update.md). An earlier Make Trailer 3D-scene survey lives in that project's `docs/research/2026-08-13-llm-3d-scene-spatial-reasoning.md`; its architecture application does not describe DreamCut's shipped behavior.

No finding here establishes a universal failure rate for every current model, demonstrates caption-placement performance, or specifies a DreamCut architecture. Those questions are addressed as proposed applications and unresolved evaluations in the [spatial implementation boundaries](../architecture/spatial-engine.md).
