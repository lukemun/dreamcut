# Agent, skill, and workflow source records

Source inventory for the dated findings in
[`2026-09-16-agent-skill-workflow-design.md`](../../2026-09-16-agent-skill-workflow-design.md).
These are attributed source records, not DreamCut recommendations.

| ID | Source | Publisher | Publication / retrieval | Examined scope | Claims supported |
| --- | --- | --- | --- | --- | --- |
| S01 | [A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) | OpenAI | Publication date not shown in examined page; retrieved 2026-09-16 | Agent definition, components, orchestration, guardrails, human intervention | Agents use a model, tools, and instructions; manager and decentralized patterns; layered guardrails and human intervention. |
| S02 | [Introducing the Agents API](https://openai.com/index/introducing-the-agents-api/) | OpenAI | 2026-09-10; retrieved 2026-09-16 | Harness, context management, tool search, programmatic tool calling, subagents | Current hosted-agent infrastructure and long-running context/tool coordination capabilities. |
| S03 | [Agent orchestration](https://openai.github.io/openai-agents-js/guides/multi-agent/) | OpenAI | Living documentation; retrieved 2026-09-16 | Manager-as-tools, handoffs, code and LLM orchestration | Manager pattern retains the user-facing conversation; handoffs transfer control; orchestration can mix model and code. |
| S04 | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Anthropic | 2024-12-19; retrieved 2026-09-16 | Workflows versus agents, prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer | Fixed workflows and dynamic agents are distinct; simple composable patterns and explicit evaluation criteria are recommended. |
| S05 | [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) | Anthropic | 2025-10-16, updated 2025-12-18; retrieved 2026-09-16 | Skill anatomy, progressive disclosure, scripts, evaluation | Skills package instructions, scripts, and resources; metadata, main instructions, and linked resources load progressively. |
| S06 | [Agent Skills overview](https://agentskills.io/home) | Agent Skills project | Living specification site; retrieved 2026-09-16 | Portable format and loading stages | Discovery, activation, and execution are separate loading stages for skills. |
| S07 | [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Anthropic | 2025-09-29; retrieved 2026-09-16 | Context selection, just-in-time retrieval, instruction altitude | Context should be high-signal and loaded as needed; instructions should avoid both brittle detail and vague abstraction. |
| S08 | [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | Anthropic | 2025-09-11; retrieved 2026-09-16 | Tool design and tool-use evaluation | Prefer distinct workflow-oriented tools, meaningful responses, clear schemas, and evaluation against verifiable outcomes. |
| S09 | [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Anthropic | 2026-01-09; retrieved 2026-09-16 | Tasks, trials, graders, traces, outcomes, mixed evaluation methods | Agent evaluation should examine outcomes and traces, use repeated trials, and combine code, model, and human graders. |
| S10 | [Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents) | Anthropic | 2026-04-09; retrieved 2026-09-16 | Agent loop and human control | Agents plan, act, observe, and adjust; permissions and oversight preserve human control. |

## Capture scope and caveats

- The records capture the sections named above, not complete copies of the sources.
- No secondary commentary, vendor comparisons, or search-result summaries are treated as evidence.
- Product documentation is time-sensitive. Recheck the living OpenAI and Agent Skills pages before relying on exact current APIs.
- The DreamCut application is intentionally absent here and lives in the separate wiki design page.
