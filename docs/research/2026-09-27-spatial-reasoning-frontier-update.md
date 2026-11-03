# Multimodal spatial reasoning — primary-paper update

This is a bounded update to the [2026-09-12 findings](2026-09-12-spatial-reasoning-and-agent-design.md). It records what selected primary papers report. DreamCut's interpretation is in the [architecture reference](../wiki/spatial-reasoning-architecture-reference.md).

| Field | Value |
| --- | --- |
| Date checked | 2026-09-27 |
| Method | Targeted searches for visual, multi-image, video, visualization, and interactive spatial reasoning; direct reading of linked author abstracts or conference proceedings abstracts. [Source record](raw/spatial-evidence/2026-09-27-paper-update.md). |
| Scope | Selected papers with direct relevance to agent perception, spatial placement, or verification; neither a systematic review nor an independent replication. |

## Measured limitations

**F01 — Video and spatial memory.** The [VSI-Bench authors](https://arxiv.org/abs/2412.14171) report more than 5,000 video question-answer pairs. Their abstract identifies spatial reasoning as the principal performance bottleneck for the evaluated multimodal models. It says chain-of-thought, self-consistency, and tree-of-thoughts did not improve performance in their study, while explicit cognitive-map generation improved spatial-distance ability. The abstract also reports emerging local world models and spatial awareness; it does not say the models have no spatial capability.

**F02 — Visual reasoning traces.** The published [ACL 2026 paper by Kancheti and colleagues](https://aclanthology.org/2026.acl-short.71/) reports sixteen models across thirteen spatial benchmarks. Its abstract says chain-of-thought prompting degraded visual spatial reasoning in its evaluation, and its No-Image++ test found models generating visual details from textual priors without the image. The prepublication [arXiv abstract](https://arxiv.org/abs/2604.16060) reports seventeen models; this record uses the published count.

**F03 — Multiple views.** The [ICLR 2026 MMSI-Bench authors](https://proceedings.iclr.cc/paper_files/paper/2026/hash/fe5d4bd3e2af823701b5d8f70a3c7602-Abstract-Conference.html) report 1,000 multi-image questions and an evaluation of 37 models. Their abstract gives about 40% accuracy for GPT-5 reasoning and 97% for humans on that benchmark, and identifies grounding, overlap matching/scene reconstruction, situation transformation, and spatial logic as error categories. Those figures are benchmark-specific.

**F04 — Inferring unseen spatial relations.** The [ICLR 2026 SpatialViz-Bench authors](https://proceedings.iclr.cc/paper_files/paper/2026/hash/4e889e581d4a6f2be932c6f65e7792a8-Abstract-Conference.html) report 1,180 generated questions across twelve tasks and four sub-abilities, evaluated with 27 multimodal models. Their abstract says chain-of-thought prompting decreased accuracy for open-source models on this benchmark. It does not make that claim for every model family.

**F05 — Interaction and final state.** The [SpatialWorld authors' June 2026 preprint](https://arxiv.org/abs/2606.09669) reports 760 human-annotated tasks across eight simulation backends, with vision-only partial observability and a terminal-state verifier. Its abstract reports a 17.4% mean task-success rate for its strongest evaluated agent, GPT-5, and describes difficulty with active exploration and long-horizon planning. This is an interactive benchmark result, not a video-editor performance estimate.

## System-design experiments

**F06 — Relations plus a solver.** The [Holodeck authors](https://arxiv.org/abs/2312.09067) describe using GPT-4 to propose relations between objects and optimizing the layout to satisfy them. This is a 3D environment-generation method, not a direct test of DreamCut caption or actor placement.

**F07 — Spatial tools.** The [SpaceTools authors' CVPR 2026 project page](https://spacetools.github.io/) describes a tool-augmented spatial-reasoning model trained with demonstrations and interactive reinforcement learning. It reports spatial-benchmark and robot-manipulation evaluations. This finding describes a model-training approach; it does not establish that adding any tool to an untrained editing agent produces the same result.

## Method and limits

The [source record](raw/spatial-evidence/2026-09-27-paper-update.md) identifies the exact source, version or venue, examined scope, and short excerpts. Findings above are author-reported results from abstracts and a project page. Full paper methods, statistical uncertainty, benchmark contamination, and model-version equivalence were not audited or reproduced. Scores from different tasks cannot be compared as one common spatial-ability scale. Paper selection is purposeful, so “frontier” here means recent and directly relevant work checked by this date, not a claim that every frontier paper has been captured.
