# Editing records for evaluation and post-training — sourced findings

Evidence on training-example structure, editing evaluation and dataset documentation.

| | |
| --- | --- |
| Date | 2026-10-23 |
| Method | Primary-source documentation and paper review; examined sections and short excerpts in the [source record](raw/editing-data-learning/sources.md) |
| Scope | Supervised learning, preference learning, tool use, video-editing evaluation and dataset lifecycle |
| Sourcing | Factual claims inline-linked; product recommendations and internal audits are separate |

## Training example structure

**Supervised examples.** TRL supports prompt-completion datasets with separate input and completion,
and conversational datasets. OpenAI describes supervised fine-tuning using example inputs and
known-good outputs and recommends establishing evaluations before investing in training.
[TRL formats](https://huggingface.co/docs/trl/main/en/dataset_formats),
[OpenAI SFT](https://developers.openai.com/api/docs/guides/supervised-fine-tuning).

**Tool use.** TRL's tool-calling SFT guidance calls for conversation messages containing tool calls
and tool responses, plus the available tool schemas. Its vision-language training guidance specifies
image inputs in addition to text. [TRL SFT, Tool Calling and Vision Language Models](https://huggingface.co/docs/trl/main/en/sft_trainer).

**Preference learning.** TRL distinguishes paired preferences—prompt, chosen completion and rejected
completion—from unpaired preferences—prompt, one completion and a preference label. DPO's paper
formulates optimization using preferred and dispreferred outputs for an input; its experiments cover
sentiment, summarization and dialogue. [TRL formats](https://huggingface.co/docs/trl/main/en/dataset_formats),
[DPO v3](https://arxiv.org/html/2305.18290v3).

**Context and evaluation separation.** OpenAI's best-practices guide recommends separating training
and test examples, retaining effective instructions in training examples, and representing multi-turn
conversations with their user and assistant messages. [Fine-tuning best practices](https://developers.openai.com/api/docs/guides/fine-tuning-best-practices).

**Example counts.** OpenAI recommends beginning with 50 well-crafted demonstrations and evaluating,
while explicitly saying the useful number depends on the use case. This is provider guidance, not a
published video-editing sample-complexity result. [SFT dataset guidance](https://developers.openai.com/api/docs/guides/supervised-fine-tuning).

The same live SFT page states that OpenAI's fine-tuning platform is winding down and is no longer
accessible to new users. Its guidance is evidence about dataset preparation, not a commitment to an
available deployment route. [Availability notice, retrieved 2026-10-23](https://developers.openai.com/api/docs/guides/supervised-fine-tuning).

## Product and video-editing evaluation

OpenAI recommends task-specific evaluations reflecting real-world distributions, mining development
logs for cases, continuously expanding evaluation coverage, and calibrating automated scoring against
human feedback. It warns against generic metrics and unmeasured impressions of quality.
[Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

Timeline-Bench supplies editing tasks with briefs, source assets, execution environments and tests.
The tests cover delivery format, content, explicit requirements and a quality component calibrated
using blind judgments from video editors. Its tasks include dialogue selection, interview story
construction and commercial editing. The paper is labeled a preprint under review.
[Timeline-Bench abstract and sections 2–3](https://arxiv.org/html/2609.35143v1).

The Anatomy of Video Editing introduces footage organization and assisted assembly tasks with
cinematographic annotations on movie shots. Its abstract reports more than 1.5 million tags over
196,176 shots. [AVE abstract](https://arxiv.org/abs/2207.09812).

## Dataset documentation and transformation

Datasheets for Datasets proposes documenting motivation, composition, collection, preprocessing,
uses, distribution and maintenance. Its collection questions ask about notice, consent and revocation;
its preprocessing questions ask what transformations were applied and whether raw data was retained
for other uses. These are a proposed documentation framework, not a legal determination.
[Datasheets, sections 3.1–3.7](https://arxiv.org/html/1803.09010v8).

## Method and limits

The [source record](raw/editing-data-learning/sources.md) preserves URLs, versions/dates where known,
examined sections, short excerpts and search method. Findings above report what those sources state;
they do not establish that any particular product's data is sufficient to improve a model.
No training run, production corpus analysis or replication of a paper's results was performed.
