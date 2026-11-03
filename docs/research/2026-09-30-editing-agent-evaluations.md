# Agent evaluation methods and tool-use benchmarks

Research date: 2026-09-30. This is evidence; DreamCut decisions are in the
[application and starter suite](../architecture/editing-eval-starter.md).
[Source records](raw/editing-agent-evaluations/2026-09-30-sources.md) preserve the
examined sections, attribution, retrieval date and limited excerpts.

## Evaluation design

Anthropic recommends starting with existing manual checks, writing clear tasks
with known passing solutions, isolating trials, inspecting transcripts, and using
deterministic graders where possible. It distinguishes successful outcomes from
particular action sequences and recommends calibrating model graders against
human experts. Its reliability discussion distinguishes success at least once in
multiple attempts from success on every attempt.
[Source: Anthropic, roadmap and non-determinism](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

## Frameworks

Inspect documents built-in and custom agents, an Agent Bridge for external agent
frameworks, human baselines, checkpointing and token/message/time limits.
[Source: Inspect, Using Agents](https://inspect.aisi.org.uk/agents.html).

Promptfoo documents deterministic assertions, model-graded assertions, external
JavaScript/Python grading functions and evaluation of saved model outputs.
[Source: Promptfoo, Assertions and Metrics](https://www.promptfoo.dev/docs/configuration/expected-outputs/).

## Published tool-use benchmarks

The BFCL dataset documentation describes multi-step and multi-turn calls,
missing parameters, missing functions and long context. V4 adds web-search and
memory scenarios. Its format-sensitivity category varies return format, function
documentation format and prompt styles.
[Source: BFCL dataset README](https://raw.githubusercontent.com/ShishirPatil/gorilla/main/berkeley-function-call-leaderboard/bfcl_eval/data/README.md).

Sierra's repository named `tau2-bench` now documents τ³-bench, customer-service
simulation with policies, tools and tasks, and text and voice modes. Its July 2026
v1.0.1 note says banking_knowledge scores before and after that grading update are
not comparable; other domains are unaffected.
[Source: Sierra README, What's New and Overview](https://raw.githubusercontent.com/sierra-research/tau2-bench/main/README.md).

## Method and limits

Searched official documentation and publisher repositories for agent evaluations,
frameworks and tool-use benchmarks, then opened the cited documents and inspected
the relevant sections. Findings report what those sources document as retrieved,
not independently reproduced performance. Live docs and main branches can change;
this is a dated research snapshot, not a claim of exhaustive coverage or a model
ranking. No third-party benchmark or package was run. No source here establishes
video-editing quality for a particular model, quantization or DreamCut configuration.
