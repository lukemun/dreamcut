# Visual and spatiotemporal failure modes in AI-assisted editing — research findings

This record reports primary-source findings about locating visual targets, understanding events in footage, editing from compressed descriptions, and composing generated imagery. DreamCut interpretation is in the [reference map](../wiki/agent-failure-mode-reference-map.md).

| | |
| --- | --- |
| **Method** | Rechecked the original paper or publisher pages linked below on 2026-09-27. |
| **Scope** | Visual and temporal editing tasks. No general agent tool-use or instruction-following taxonomy. |
| **Source record** | [Authors, publication venues, dates, URLs, and examined sections](raw/editing-visual-failure-modes/sources.md). |

The eight sources come from different author groups: six appear in conference proceedings ([CVPR 2026](https://openaccess.thecvf.com/content/CVPR2026/html/Li_GroundingME_Exposing_the_Visual_Grounding_Gap_in_MLLMs_through_Multi-Dimensional_CVPR_2026_paper.html), [ACL 2026](https://aclanthology.org/2026.acl-short.71/), [CVPR Findings 2026](https://openaccess.thecvf.com/content/CVPR2026F/html/Cheng_V-STaR_Benchmarking_Video-LLMs_on_Video_Spatio-Temporal_Reasoning_CVPRF_2026_paper.html), [EMNLP 2025](https://aclanthology.org/2025.emnlp-main.984/), [IUI 2024](https://iui.acm.org/2024/accepted_papers.html), and [NeurIPS 2023](https://proceedings.neurips.cc/paper_files/paper/2023/hash/a3bf71c7c63f0c3bcb7ff67c67b1e7b1-Abstract-Datasets_and_Benchmarks.html)); [Moment-Video](https://arxiv.org/abs/2606.02522) and [GenScale](https://arxiv.org/abs/2609.00525) are preprints in this record. The [source record](raw/editing-visual-failure-modes/sources.md) lists every author.

## Grounding a visual target and its position

- [GroundingME](https://arxiv.org/abs/2512.17495) tests language-based localization across similar objects, complex spatial descriptions, tiny or occluded objects, and queries for objects that are absent. Its authors report 1,005 human-verified examples and an evaluation of 25 multimodal models; the top score reported in the paper abstract is 45.1%, and most evaluated models scored 0% on rejection cases. These are benchmark results, not a DreamCut error rate.
- In an evaluation of 16 models on 13 spatial benchmarks, [Kancheti et al. (ACL 2026)](https://aclanthology.org/2026.acl-short.71/) report that chain-of-thought prompting degraded visual-spatial performance in their evaluated setting. Their no-image ablation also found models supplied visual details from textual priors when the image was absent.

## Finding when and where something happens

- [V-STaR (CVPR Findings 2026)](https://openaccess.thecvf.com/content/CVPR2026F/html/Cheng_V-STaR_Benchmarking_Video-LLMs_on_Video_Spatio-Temporal_Reasoning_CVPRF_2026_paper.html) evaluated 16 video language models. The authors report a gap between answering *what* occurs and grounding *when* and *where* it occurs; their analysis found reliance on static representations and semantic biases.
- [Moment-Video (June 2026 preprint)](https://arxiv.org/abs/2606.02522) contains 1,000 human-verified questions about brief visual events. Across 33 evaluated models, the best reported overall accuracy was 39.6%. The authors report that sparse sampling, compression, and coarse aggregation can omit short answer-critical evidence; denser sampling improved some models without removing the problem.
- [InfiniBench (EMNLP 2025)](https://aclanthology.org/2025.emnlp-main.984/) evaluates grounding in long videos. Its authors report that even the strongest evaluated model reached 47.1% on their grounding-based skills, despite higher performance on some other task types. This is a benchmark-specific result, not a universal threshold for edit timing.

## Editing from incomplete footage descriptions

- [LAVE (IUI 2024)](https://arxiv.org/html/2402.10294v1) generated language descriptions of footage as input to an editing agent. In its user study, the authors observed inaccurate trims when an instruction depended on properties absent from the generated descriptions, including brightness or motion (section 6.3.3). The study involved eight participants, as reported in its [abstract](https://arxiv.org/abs/2402.10294).

## Generated visual composition

- [GenScale (September 2026 preprint)](https://arxiv.org/abs/2609.00525) benchmarks relative object size in image generation and editing using 900 image-level entries and 1,643 pairwise relations. Its authors report that evaluated image generators and editors did not reliably preserve plausible relative scale.
- [GenEval (NeurIPS 2023 Datasets and Benchmarks)](https://proceedings.neurips.cc/paper_files/paper/2023/hash/a3bf71c7c63f0c3bcb7ff67c67b1e7b1-Abstract-Datasets_and_Benchmarks.html) evaluates text-to-image generation on object co-occurrence, position, count, color, and attribute binding. Its authors report persistent difficulty with spatial relations and attribute binding among evaluated models.

## Method and limits

The claims above were checked against primary paper landing pages, publisher abstracts, and the full-text section of LAVE noted above. The [source record](raw/editing-visual-failure-modes/sources.md) lists the examined surface for each item. This is a focused selection, not a systematic review or a benchmark run in DreamCut. Papers use different tasks, models, prompts, dates, and metrics; their percentages are not directly comparable. Preprints are labeled as such. Architecture implications are recorded separately in the [reference map](../wiki/agent-failure-mode-reference-map.md).
