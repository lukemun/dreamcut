# Editing records, evaluation and post-training — source records

Retrieved 2026-10-23. Scope: short attributed excerpts and section metadata, **not full captures**.
Sources were opened through web search/browser extraction. No customer projects, footage or cloud
records were examined. Search results not opened are excluded from the verified inventory.

| ID | Primary source / date | Examined scope | Short verbatim excerpt | Supported topic |
| --- | --- | --- | --- | --- |
| S1 | [Hugging Face TRL: Dataset formats and types](https://huggingface.co/docs/trl/main/en/dataset_formats); live `main` documentation, publication date unspecified | Prompt-completion, preference, unpaired preference and trainer mapping | “We recommend using explicit prompts whenever possible.” | Prompt/completion vs same-prompt chosen/rejected datasets; unary preference is a separate format |
| S2 | [Hugging Face TRL: SFT Trainer](https://huggingface.co/docs/trl/main/en/sft_trainer); live `main`, publication date unspecified | Tool Calling with SFT; Training Vision Language Models | “The list of available tools in the `tools` column, typically provided as JSON schemas” | Tool-call training inputs and image-conditioned examples |
| S3 | [Rafailov et al., Direct Preference Optimization](https://arxiv.org/html/2305.18290v3); first submitted 2023-05-29, examined v3 | Abstract; preference formulation; experimental datasets and evaluation | “eliminating the need for sampling from the LM during fine-tuning” | Preference-pair optimization; reported experiments are not editing experiments |
| S4 | [OpenAI: Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices); live documentation, publication date unspecified | Evals tips; anti-patterns; design process | “Use human feedback to calibrate automated scoring.” | Task-specific evaluation, production logs, human calibration |
| S5 | [OpenAI: Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning); live documentation, publication date unspecified | Overview; Build your dataset; availability notice | “We recommend starting with 50 well-crafted demonstrations and evaluating the results” | Inputs and desired outputs; eval-first; task-dependent example counts |
| S6 | [OpenAI: Fine-tuning best practices](https://developers.openai.com/api/docs/guides/fine-tuning-best-practices); live documentation, publication date unspecified | Adjust your dataset: training/test, prompts, multi-turn chat | “The training set is for fine-tuning jobs, and the test set is for evals.” | Separate evaluation data; retain instructions and conversational context |
| S7 | [Gebru et al., Datasheets for Datasets](https://arxiv.org/html/1803.09010v8); v8 2021-12-01 | Sections 3.2–3.7: composition, collection, preprocessing, use, distribution, maintenance | “Was the “raw” data saved in addition to the preprocessed/cleaned/labeled data” | Document transformations, notice/consent, revocation and future uses |
| S8 | [Gupta, Arora and Tankala, Timeline-Bench](https://arxiv.org/html/2609.35143v1); 2026-09-28, preprint under review | Abstract; sections 2–3; limitations | “Every task provides a brief, source assets, a container and a set of tests.” | Video-editing evaluation with inputs, delivery checks and human-calibrated quality |
| S9 | [Argaw et al., The Anatomy of Video Editing](https://arxiv.org/abs/2207.09812); v2 2022-07-21 | Abstract only | “automatic footage organization and assisted video assembling” | Editing research includes organization/assembly and cinematographic shot annotations |

## Retrieval method and limits

Queries included `video editing agent benchmark timeline editing dataset instruction`,
`Direct Preference Optimization 2305.18290`, `Datasheets for Datasets 1803.09010`, and official
fine-tuning documentation. Opened the original paper pages/HTML and official documentation;
searched within the pages for preference formats, tool calling, human calibration, and dataset
collection/preprocessing. No source in this inventory required a failed-fetch exception.

These are selected primary sources, not an exhaustive systematic review. TRL `main` and provider
documentation can change; record the retrieval date when using their formats. S9 supports only
abstract-level claims. S8 is a preprint, and its published results were not independently rerun.
No minimum dataset size or predicted training improvement for DreamCut was measured.
