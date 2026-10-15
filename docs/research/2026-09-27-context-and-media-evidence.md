# Long context and video evidence — sourced findings

This record covers limits of long-context retrieval and video sampling, plus published context-management guidance. DreamCut-specific interpretation is in the [context and media-intake architecture reference](../wiki/context-and-media-intake-architecture-reference.md).

| Field | Value |
| --- | --- |
| Date | 2026-09-27 |
| Method | Targeted searches for long-context position/retrieval, agent-generated distractors, million-token reasoning, and short events in long video. Read primary journal/conference abstracts, author preprint abstracts, and the identified provider engineering article directly. [Source record](raw/context-media/sources.md). |
| Scope | Selected sources, not a systematic literature review or an independent replication. |

## Text context and retrieval

**C01 — Position matters.** [Liu and colleagues, TACL 2024](https://aclanthology.org/2024.tacl-1.9/) evaluated multi-document question answering and key-value retrieval. Their abstract reports that performance often peaked when relevant information appeared at the beginning or end of a long input and fell when it appeared in the middle, including for models designed for long contexts. This is a finding about the evaluated tasks and models, not a fixed curve for all later models.

**C02 — Distractors and agent loops matter.** The [HaystackCraft authors' 2025 preprint](https://arxiv.org/abs/2510.07414) varies retrieval strategy, distractor composition, and ordering in multi-hop questions. Its abstract reports experiments with fifteen long-context models and says some advanced agents cascaded on self-generated distractors or failed to stop early. Its setup is a research benchmark built from Wikipedia links, not a media-editing trial.

**C03 — Capacity and usable reasoning differ.** A [2026 author preprint](https://arxiv.org/abs/2605.02173) tested five models advertised with one-million-token windows on a classical Chinese corpus. Its abstract reports perfect single-needle retrieval at one million tokens for three tested models, while three-hop reasoning displayed model-dependent degradation across 256K, 512K, and one million tokens. This source is one preprint and one domain; it supports neither universal long-context failure nor universal reliability.

**C04 — Context management guidance.** [Anthropic's engineering article](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) treats context as a finite resource and describes high-signal selection, lightweight references, just-in-time retrieval, and compaction for long-running agents. These are provider-authored design recommendations, not controlled proof of a DreamCut implementation.

## Video evidence and sampling

**C05 — Brief events can disappear.** The [Moment-Video authors' June 2026 preprint](https://arxiv.org/abs/2606.02522) introduces 1,000 human-verified video questions grounded in momentary events and evaluates 33 multimodal models. Its abstract reports 39.6% overall accuracy for the strongest tested model; denser sampling improved some models without removing the bottleneck. The paper identifies sparse sampling, token compression, and coarse temporal aggregation as possible ways to lose a few-frame event.

**C06 — Query type changes useful frame selection.** The [CVPR 2026 Divide, then Ground authors](https://openaccess.thecvf.com/content/CVPR2026/html/Li_Divide_then_Ground_Adapting_Frame_Selection_to_Query_Types_for_CVPR_2026_paper.html) report that uniform sampling was effective and efficient for global video questions in their experiments, while localized questions benefited from query-aware selection. This does not establish one best sampler for every editing question.

## Method and limits

The [source record](raw/context-media/sources.md) identifies versions, examined sections, short excerpts, and source types. The research papers above report author results from the cited abstracts; methods, uncertainty, dataset contamination, and model-specific settings were not independently audited. The Anthropic article is engineering guidance. None of these sources tests DreamCut, proves an intake pipeline improves edit quality, or says a preview proxy is a language-model context compression method. Those are product-design and system-performance questions for separate inspection and evaluation.
