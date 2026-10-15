# Editing harness foundations — sourced findings

Evidence on context management, persistent execution, tool recovery and multimodal delivery. Recommendations are separate in the [DreamCut application](../architecture/editing-operator-harness.md).

| Field | Value |
| --- | --- |
| Research date | 2026-09-30, America/New_York |
| Method | Targeted web searches followed by direct reading of official specifications, maintainer documentation and repositories; selected sections recorded in the [source inventory](raw/editing-harness-foundations/sources.md). |
| Scope | Engineering mechanisms and documented interfaces; not a systematic literature review, framework benchmark or model qualification. |

## Context management

**H01.** Anthropic describes compaction as summarizing a conversation and continuing in a new context window. It warns that aggressive compression can lose details needed later, recommends tuning for recall before precision, and describes tool-result clearing and persistent notes as complementary techniques. These are provider engineering recommendations, not measured guarantees for other models. [Anthropic, “Context engineering for long-horizon tasks”](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

## Persistence and recovery

**H02.** LangGraph distinguishes thread-scoped checkpoints from cross-thread stores. Its documentation explicitly says in-memory checkpointers lose state on process restart and identifies persistent SQLite and PostgreSQL implementations. [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence).

**H03.** LangGraph interrupts require a checkpointer and thread ID. On resume, execution restarts at the beginning of the interrupted node; code preceding the interrupt runs again. [LangGraph interrupts, “Resuming interrupts”](https://docs.langchain.com/oss/javascript/langgraph/interrupts).

**H04.** LangGraph documents opt-in retry policies with exception selection, maximum attempts, backoff and jitter. Its fault-tolerance page separates retry policies, timeouts and error handlers, and specifies version requirements for some features. [LangGraph fault tolerance](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance).

**H05.** MCP distinguishes protocol errors from tool execution errors. Tool errors use `isError: true`; clients should expose these to the model for correction. Tools can supply structured results and output schemas, and advertise changes through tool-list notifications. [MCP tools, version 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

**H06.** MCP Streamable HTTP optionally supports reconnection using SSE event IDs and `Last-Event-ID`. Its session identifier is assigned by the server during protocol initialization. These are the mechanisms specified in the transport's session and redelivery sections. [MCP transports, version 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Actual visual inputs and model interfaces

**H07.** MCP image results carry base64 image data and MIME type. Resource links are a distinct result type, with a URI the client can fetch. [MCP tool result content](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

**H08.** Ollama's REST vision interface uses an `images` array containing base64 data. Its tool-calling documentation shows an application loop that sends tool definitions, executes returned calls and adds results to subsequent messages. [Ollama vision](https://docs.ollama.com/capabilities/vision), [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling).

**H09.** llama.cpp documents multimodal serving through `llama-server` and an OpenAI-compatible chat endpoint. Local loading can specify a model GGUF and separate projector with `--mmproj`. Its function-calling documentation describes `--jinja`, template-dependent native or generic handlers, and model-dependent parallel-call support. These interface descriptions do not certify any particular downloaded model. [llama.cpp multimodal](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md), [function calling](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md).

## Reusable frameworks and observability

**H10.** LangGraph.js and Deep Agents.js are published under MIT licenses. Deep Agents documents history summarization, large-result offloading, filesystem capabilities, subagents and human intervention. [LangGraph.js repository](https://github.com/langchain-ai/langgraphjs), [Deep Agents.js repository](https://github.com/langchain-ai/deepagentsjs), [Deep Agents overview](https://docs.langchain.com/oss/javascript/deepagents/overview).

**H11.** OpenTelemetry's former GenAI documentation now points to a dedicated repository. That repository defines conventions covering GenAI clients, MCP and provider-specific spans, metrics and events. [Migration notice](https://opentelemetry.io/docs/specs/semconv/gen-ai/), [current conventions repository](https://github.com/open-telemetry/semantic-conventions-genai).

## Method and limitations

Sources were opened directly; search snippets were discovery aids only. The source inventory preserves short excerpts and examined sections rather than full copyrighted pages. Documentation pages and default-branch repository links are mutable; publication dates are unknown unless recorded. MCP findings use the explicit 2025-11-25 specification, not an assertion that it is the newest revision.

No library was installed or benchmarked for this research. No external source above establishes DreamCut compatibility, exactly-once tool execution, visual understanding, or equivalent performance across providers. Existing [long-context and media-evidence findings](2026-09-27-context-and-media-evidence.md) remain separate; their prior literature review was not rerun here. Package selection requires a version-pinned implementation spike and the application document's tests.
