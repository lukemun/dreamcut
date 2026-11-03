# Harness foundations — source records

Retrieved 2026-09-30 (America/New_York). Capture scope: attributed short excerpts and section metadata only, not full captures. Publication dates unknown except S01. Official live documentation/default branches were examined through the web reader. Findings IDs refer to the [evidence deliverable](../../2026-09-30-editing-harness-foundations.md).

| ID | Publisher / title / URL | Examined section; supported findings | Brief verbatim excerpt |
| --- | --- | --- | --- |
| S01 | Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), published 2025-09-29 | Long-horizon tasks / compaction / notes; H01 | “Start by maximizing recall” |
| S02 | LangChain, [Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) | Checkpointer versus store; restart troubleshooting; H02 | “MemorySaver and InMemorySaver store checkpoints in RAM.” |
| S03 | LangChain, [Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts) | Pause and resume; H03 | “The node restarts from the beginning” |
| S04 | LangChain, [Fault tolerance](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance) | Retry defaults, parameters, timeouts; H04 | “Retries are opt-in.” |
| S05 | Model Context Protocol, [Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), specification version 2025-11-25 | Notifications, image/resource/structured content, error handling; H05, H07 | “Clients SHOULD provide tool execution errors to language models to enable self-correction.” |
| S06 | Model Context Protocol, [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), specification version 2025-11-25 | Resumability/redelivery; session management; H06 | “Servers MAY attach an id field to their SSE events” (inline code formatting omitted) |
| S07 | Ollama, [Vision](https://docs.ollama.com/capabilities/vision) | REST API inputs; H08 | “the REST API expects base64-encoded image data.” |
| S08 | Ollama, [Tool calling](https://docs.ollama.com/capabilities/tool-calling) | Tool definitions and multi-turn loop; H08 | Metadata/section record; no excerpt retained. |
| S09 | ggml-org, [Multimodal](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md) | Local model/projector loading, server interface; H09 | “specify text and multimodal projector respectively” |
| S10 | ggml-org, [Function Calling](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md) | Native/generic formats and templates; H09 | “Generic support may consume more tokens and be less efficient than a model's native format.” |
| S11 | LangChain, [Deep Agents overview](https://docs.langchain.com/oss/javascript/deepagents/overview) | Capabilities introduction; H10 | “Summarize history and offload large results across long runs” |
| S12 | LangChain, [LangGraph.js](https://github.com/langchain-ai/langgraphjs) and [Deep Agents.js](https://github.com/langchain-ai/deepagentsjs) | Repository license labels and README; H10 | “MIT license” (each repository) |
| S13 | OpenTelemetry, [GenAI migration notice](https://opentelemetry.io/docs/specs/semconv/gen-ai/) | Notice; H11 | “This page has moved and is no longer maintained in this repository.” |
| S14 | OpenTelemetry, [GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai) | README scope; H11 | “including spans, metrics, and events for GenAI clients” |

The old LangGraph durable-execution URL redirected to persistence; this record cites its resolved destination. GenAI documentation's migration notice was followed to the owning repository. No failed source is classified as absent. Search results for recent compaction preprints were not examined deeply and are not used as findings or adoption evidence.
