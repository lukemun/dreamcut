# Agent, skill, and workflow design — research findings (sourced)

This document records current primary-source guidance on structuring agentic work, reusable skills, orchestration, tools, context, oversight, and evaluation.

| | |
| --- | --- |
| **Method** | Examined ten primary sources from OpenAI, Anthropic, and the Agent Skills specification site; recorded source metadata and scope in the [source inventory](raw/agent-skill-workflows/README.md). |
| **Date** | 2026-09-16 |
| **Sourcing standard** | Every external factual claim is linked inline; DreamCut recommendations are excluded. |

## How to read this

Every factual claim links to its source. This document reports what the sources state; the DreamCut interpretation lives in a separate application document.

## Agents and workflows

OpenAI describes an agent as a system that uses an LLM to manage workflow execution and select tools within guardrails; its three foundational components are a model, tools, and instructions. A workflow is the sequence of steps used to reach the goal. [OpenAI, “A practical guide to building agents”](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)

Anthropic distinguishes workflows, where models and tools follow predefined code paths, from agents, where the model dynamically directs its process and tool use. It recommends beginning with the simplest suitable design and using workflows when predictability fits a well-defined task. [Anthropic, “Building effective agents”](https://www.anthropic.com/engineering/building-effective-agents)

Anthropic identifies prompt chaining for cleanly decomposable sequential work, routing for distinct task categories, parallelization for independent subtasks or multiple perspectives, orchestrator-workers for subtasks that cannot be predicted in advance, and evaluator-optimizer loops when criteria are clear and iterative refinement has measurable value. [Anthropic, “Building effective agents”](https://www.anthropic.com/engineering/building-effective-agents)

OpenAI's Agents SDK documentation describes two multi-agent patterns: a manager can retain control of the user-facing conversation while invoking specialists as tools, or a handoff can transfer control to a specialist. The documentation also permits mixing model-directed and code-directed orchestration. [OpenAI Agents SDK, “Agent orchestration”](https://openai.github.io/openai-agents-js/guides/multi-agent/)

## Skills and progressive disclosure

Anthropic describes an Agent Skill as a directory containing a `SKILL.md` file and optional instructions, scripts, and resources. Skill metadata is available for discovery, the full `SKILL.md` loads when relevant, and linked resources load only when needed. [Anthropic, “Equipping agents for the real world with Agent Skills”](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

The Agent Skills specification site describes discovery, activation, and execution as three separate loading stages and states that the format packages procedural knowledge into portable, version-controlled folders. [Agent Skills overview](https://agentskills.io/home)

Anthropic states that deterministic scripts bundled with skills are appropriate where code is more reliable or efficient than token-by-token generation, and recommends moving conditional or specialized material out of an unwieldy main instruction file. [Anthropic, “Equipping agents for the real world with Agent Skills”](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

## Context and tools

Anthropic describes context engineering as selecting and maintaining the information available to an agent over multiple turns. It recommends high-signal context, direct instructions at an appropriate level of abstraction, and just-in-time retrieval through lightweight references such as paths or links. [Anthropic, “Effective context engineering for AI agents”](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

Anthropic recommends a small set of distinct, high-impact tools shaped around agent workflows, with unambiguous names, schemas, and focused responses. It also recommends testing tools with task-level evaluations and verifiable outcomes rather than assuming conventional API ergonomics transfer directly to agents. [Anthropic, “Writing effective tools for AI agents”](https://www.anthropic.com/engineering/writing-tools-for-agents)

OpenAI states that its current Agents API provides managed long-session context compaction, on-demand tool-definition loading, programmatic tool calling, and parallel subagent support in isolated contexts. [OpenAI, “Introducing the Agents API”](https://openai.com/index/introducing-the-agents-api/)

## Oversight and evaluation

OpenAI recommends layered guardrails and human intervention for high-risk actions or when failure thresholds are exceeded. Its guide distinguishes tool safeguards, rules-based protections, output validation, authentication, authorization, and access controls. [OpenAI, “A practical guide to building agents”](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)

Anthropic describes an agent as operating in a loop that plans, acts, observes results, and adjusts until completion or a need for human input. It identifies tool permissions and approval requirements as mechanisms for preserving human control. [Anthropic, “Trustworthy agents in practice”](https://www.anthropic.com/research/trustworthy-agents)

Anthropic defines an agent-evaluation task, trial, grader, trace, outcome, harness, and suite separately. It recommends multiple trials because outputs vary and distinguishes what an agent says from the environment state it actually produces. [Anthropic, “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

Anthropic reports that agent evaluations commonly combine code-based, model-based, and human graders, and states that production monitoring and periodic human review complement pre-launch automated evaluation. [Anthropic, “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## Method, caveats, and sources

- Search targeted official OpenAI, Anthropic, and Agent Skills pages. The [source inventory](raw/agent-skill-workflows/README.md) records publication dates, retrieval date, examined scope, and supported claims.
- These sources describe product guidance and engineering practice; they do not constitute a controlled comparison proving one architecture is universally superior.
- Living documentation can change after the retrieval date. The dated findings preserve what was examined on 2026-09-16.
- No claim is made here about DreamCut's current implementation or which pattern it should adopt.
