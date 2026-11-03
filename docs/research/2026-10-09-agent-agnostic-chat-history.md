# Agent-agnostic chat history and session resume — sourced findings

What vendor agent runtimes, local model servers, open protocols and agent-hosting clients document about where conversation transcripts live and how a session is resumed. Interpretation and any DreamCut proposal live in the separate [application note](../architecture/agent-chat-history.md).

| | |
|---|---|
| **Method** | One researcher; official vendor documentation (Markdown variants where offered) and source files at pinned release tags, fetched directly; short excerpts recorded in the [source records](raw/agent-chat-history/sources.md) |
| **Date** | 2026-10-09 |
| **Sourcing standard** | [research-deliverable skill](../../.agents/skills/research-deliverable/SKILL.md) — every claim cited; nothing unsourced |

## How to read this

Every factual claim links to its source. Nothing here is our own interpretation; cross-source observations and recommendations live in the application note. Record IDs in brackets (for example [A01]) refer to rows in the source records. Live documentation pages are unpinned and may change after the retrieval date.

## Claude Agent SDK and Claude Code

**F01.** The Agent SDK defines a session as the accumulated conversation history — prompt, tool calls, tool results and responses — and writes it to disk automatically. Sessions persist the conversation, not the filesystem. [A01, Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions).

**F02.** `continue: true` (TypeScript) resumes the most recent session in the directory without an ID; `resume` takes a specific session ID; `forkSession: true` with `resume` creates a new session that starts with a copy of the original's history, leaving the original unchanged. The session ID is read from `session_id` on the result message and, in TypeScript, earlier on the init system message. `persistSession: false` (TypeScript only) keeps the session in memory only. [A01](https://code.claude.com/docs/en/agent-sdk/sessions). The TypeScript options also include `resumeSessionAt`, which resumes at a specific message UUID. [A02, TypeScript reference, Options](https://code.claude.com/docs/en/agent-sdk/typescript).

**F03.** Transcripts are stored as JSONL at `~/.claude/projects/<project>/<session-id>.jsonl`, where `<project>` is the working directory with non-alphanumeric characters replaced by `-` (truncated with a hash beyond 200 characters); `CLAUDE_CONFIG_DIR` relocates the root. [A01](https://code.claude.com/docs/en/agent-sdk/sessions), [A04, Where transcripts are stored](https://code.claude.com/docs/en/sessions). Each line is a message, tool-use or metadata entry; Anthropic states the entry format “is internal to Claude Code and changes between versions” and directs scripts to `/export` or the script interfaces instead. [A04](https://code.claude.com/docs/en/sessions).

**F04.** For resuming on a different host, the documentation lists three options: a session store adapter, moving the session file into `~/.claude/projects/` on the new host, or not relying on resume and instead capturing needed results as application state passed into a fresh session's prompt, which it calls “often more robust than shipping transcript files around.” [A01, Resume across hosts](https://code.claude.com/docs/en/agent-sdk/sessions).

**F05.** `listSessions()` returns session metadata (`sessionId`, `summary`, `lastModified`, `customTitle`, `firstPrompt`, `cwd`, `createdAt` and others), filterable by directory. `getSessionMessages(sessionId, { dir, limit, offset })` returns `SessionMessage` objects with `type` (`"user" | "assistant"`), `uuid`, `session_id`, a raw `message` payload, and `parent_tool_use_id` for subagent messages. [A02, `listSessions()` and `getSessionMessages()`](https://code.claude.com/docs/en/agent-sdk/typescript).

**F06.** A `SessionStore` adapter has required `append(key, entries)` and `load(key)` methods plus optional `listSessions`, `listSessionSummaries`, `delete` and `listSubkeys`. Entries are opaque JSON-safe objects that must be returned in append order. [A03, The SessionStore interface; Write your own adapter](https://code.claude.com/docs/en/agent-sdk/session-storage).

**F07.** The store is a mirror: the subprocess writes each batch to local disk first and the SDK forwards it to `append()`. When resuming from the store, the SDK writes the transcript into a temporary config directory and deletes it at run end, leaving the store as the only durable copy. Mirror writes are best-effort: after up to three attempts a failed batch is dropped and a `mirror_error` system message is emitted; adapters should deduplicate by `entry.uuid`. `persistSession: false` conflicts with a store. [A03, Behavior notes](https://code.claude.com/docs/en/agent-sdk/session-storage).

**F08.** `getSessionMessages` returns the post-compaction chain the agent would see on resume; after auto-compaction earlier turns are replaced by a summary, and the full raw history is available only via `store.load(key)`. `forkSession` rewrites session IDs and remaps message UUIDs rather than byte-copying. [A03](https://code.claude.com/docs/en/agent-sdk/session-storage).

**F09.** A resumed session restores the full conversation history including tool calls and results; a tool that was still running when the previous process ended does not finish or rerun, and Claude is told to check whether it took effect. Flags such as `--mcp-config`, `--settings`, `--plugin-dir` and `--add-dir` are not restored and must be passed again. [A04, What a resumed session restores](https://code.claude.com/docs/en/sessions).

**F10.** Local transcripts are kept in plaintext under `~/.claude/projects/` for 30 days by default to enable resumption, adjustable with `cleanupPeriodDays`. [A06, Data usage](https://code.claude.com/docs/en/data-usage). Files older than `cleanupPeriodDays` are deleted automatically; the minimum is 1 and `0` is a validation error. Transcripts started or last continued in Claude Desktop or Cowork are exempt by default (configurable with `desktopSessionCleanupPeriodDays`). [A05, Cleaned up automatically](https://code.claude.com/docs/en/claude-directory). The SDK never deletes from a custom store; retention there is the adapter's responsibility. [A03, Retention](https://code.claude.com/docs/en/agent-sdk/session-storage). `CLAUDE_CODE_SKIP_PROMPT_HISTORY=1` skips writing transcripts. [A07](https://code.claude.com/docs/en/env-vars).

## OpenAI Codex app-server

**F11.** App-server exposes `thread/start` (new conversation), `thread/resume` (“reopen an existing thread by id so later `turn/start` calls append to it”), `thread/fork` (copy stored history into a new thread id, optionally through `lastTurnId`, or `ephemeral: true` for an in-memory fork), `thread/read` (read a stored thread without resuming; `includeTurns` returns turn history), `thread/list` (cursor-paginated stored thread logs with filters including `cwd`, `archived` and `searchTerm`), and experimental `thread/turns/list` and `thread/items/list`. [B01, API overview](https://developers.openai.com/codex/app-server).

**F12.** `thread/start` responses carry `thread.id`, `thread.sessionId` and an `ephemeral` flag. `thread/resume` takes the recorded `thread.id` and accepts the same configuration overrides as `thread/start`. Resuming with a different model than the one recorded in the rollout emits a warning and applies a one-time model-switch instruction. Experimental `dynamicTools` are persisted in rollout metadata and restored on resume when new ones are not supplied. [B01, Start/Resume sections](https://developers.openai.com/codex/app-server).

**F13.** `thread/archive` moves the thread's persisted JSONL log into an archived directory; `thread/unarchive` restores it into the active sessions directory; `thread/delete` permanently deletes a persisted thread and spawned descendants. [B01](https://developers.openai.com/codex/app-server).

**F14.** `thread/inject_items` appends prebuilt Responses API items to a loaded thread's model-visible history without starting a user turn; the items are persisted to the rollout and included in subsequent model requests. [B01, Inject items into a thread](https://developers.openai.com/codex/app-server).

**F15.** Experimental `historyMode: "paginated"` thread creation is not yet supported; for existing paginated records, full-history reads, turn pagination and resume “fail closed.” [B01](https://developers.openai.com/codex/app-server).

**F16.** Codex stores local state under `CODEX_HOME` (default `~/.codex`), including `history.jsonl` when history persistence is enabled. `history.persistence = "none"` disables it; `history.max_bytes` caps the file, dropping oldest entries. [B02, Config and state locations; History persistence](https://developers.openai.com/codex/config-advanced), [B03, configuration reference](https://developers.openai.com/codex/config-reference). The configuration reference examined lists no age-based retention key for session rollouts (absence within that page only). [B03](https://developers.openai.com/codex/config-reference).

**F17.** In source, rollouts are written as JSONL “so sessions can be replayed or inspected later,” under `CODEX_HOME/sessions/YYYY/MM/DD/` with file names `rollout-<timestamp>-<conversation_id>.jsonl`; archived rollouts use `archived_sessions`. [B05, recorder.rs](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/rollout/src/recorder.rs), [B04, lib.rs](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/rollout/src/lib.rs).

## Local model servers and OpenAI APIs

**F18.** Ollama's `/api/chat` takes `messages`, described as “the messages of the chat, this can be used to keep a chat memory”; the documented “Chat request (With History)” example sends prior turns in the request. `/api/generate`'s `context` parameter, which could keep “a short conversational memory,” is marked deprecated. [C01, docs/api.md](https://github.com/ollama/ollama/blob/v0.40.2/docs/api.md).

**F19.** Ollama's local `/v1/responses` supports “only the non-stateful flavor”: `previous_response_id` and `conversation` are listed as unsupported. Its cloud API also does not support stateful Responses. [C02, OpenAI compatibility](https://github.com/ollama/ollama/blob/v0.40.2/docs/api/openai-compatibility.mdx).

**F20.** llama.cpp server's `/v1/chat/completions` takes “a ChatML-formatted json description in `messages`” and returns the predicted completion; the README makes “no strong claims of compatibility with OpenAI API spec.” `cache_prompt` (default `true`) reuses KV cache from a previous request so only the differing suffix is processed, with a note that results may be nondeterministic. [C03, tools/server/README.md](https://github.com/ggml-org/llama.cpp/blob/v0.6.0/tools/server/README.md).

**F21.** llama.cpp server can save, restore and erase a slot's prompt cache to a file in the directory given by `--slot-save-path` via `POST /slots/{id}?action=save|restore|erase`. It also exposes `/v1/responses`; the README section for that endpoint does not document `previous_response_id` (absence within that section only). [C03](https://github.com/ggml-org/llama.cpp/blob/v0.6.0/tools/server/README.md).

**F22.** LM Studio's `/api/v1/chat` is “stateful by default”: LM Studio stores the conversation in a chat thread and returns a `response_id`; passing it as `previous_response_id` continues the conversation; `store: false` disables storage and omits the ID. [C04, Stateful chats](https://lmstudio.ai/docs/developer/rest/stateful-chats), [C05, Chat request body](https://lmstudio.ai/docs/developer/rest/chat). Its OpenAI-compatible `/v1/responses` documents a stateful follow-up using `previous_response_id`. [C06](https://lmstudio.ai/docs/developer/openai-compat/responses). The pages examined do not state whether stored chats survive an LM Studio restart.

**F23.** OpenAI states that each text generation request is “independent and stateless,” and multi-turn conversation can be implemented by supplying prior messages; for stateless reasoning-model requests, every item in the response `output` array should be preserved and replayed. [C07, Manually manage conversation state](https://developers.openai.com/api/docs/guides/conversation-state).

**F24.** The Conversations API persists conversation state as a long-running object with a durable identifier, storing messages, tool calls and tool outputs, usable across sessions, devices or jobs. [C07, Using the Conversations API](https://developers.openai.com/api/docs/guides/conversation-state).

**F25.** `previous_response_id` chains responses into a threaded conversation; all previous input tokens in the chain are still billed as input tokens. [C07](https://developers.openai.com/api/docs/guides/conversation-state).

**F26.** Response objects are saved for 30 days by default and `store: false` disables this; conversation objects and their items are not subject to the 30-day TTL. [C07, Data retention for model responses](https://developers.openai.com/api/docs/guides/conversation-state).

**F27.** Chat Completions `messages` is “a list of messages comprising the conversation so far,” with developer, system, user, assistant and tool message types; a tool message carries `tool_call_id`, the tool call it responds to. Chat Completions `store` stores output for distillation or evals products. [C08, Create chat completion](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

## Vendor-neutral protocols and formats

**F28.** Agent Client Protocol: agents advertising the `loadSession` capability let clients resume previous conversations, enabling “persistence across restarts.” `session/load` takes `sessionId`, `cwd` and `mcpServers`; the agent MUST replay the entire conversation as `session/update` notifications before responding; compactions replay with live semantics; live-only notices SHOULD NOT be replayed. Clients MUST NOT call `session/load` unless the capability is advertised. [D01, Loading Sessions](https://agentclientprotocol.com/protocol/session-setup).

**F29.** ACP `session/resume`, gated on `sessionCapabilities.resume`, reconnects to an existing session and the agent MUST NOT replay history before responding. [D01, Resuming Sessions](https://agentclientprotocol.com/protocol/session-setup).

**F30.** ACP `session/list`, gated on `sessionCapabilities.list`, is “a discovery mechanism only” and does not restore sessions; cursors are opaque and must not be persisted. [D02, Session list](https://agentclientprotocol.com/protocol/session-list).

**F31.** MCP's architecture principles state that servers should not be able to read the whole conversation and that “full conversation history stays with the host.” [D03, MCP architecture 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/c518f7a927cff918bce35d3522fcdb046d264d7c/docs/specification/2026-07-28/architecture/index.mdx). A text search of all 31 Markdown/MDX files in the 2026-07-28 specification folder found no other use of “conversation history,” “chat history” or “transcript” (absence within that folder only).

**F32.** MCP 2026-07-28 describes itself as a stateless protocol; an open connection is not a conversation or session, and state spanning requests must be referenced by an explicit identifier passed on each request. [D04, Statelessness](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/c518f7a927cff918bce35d3522fcdb046d264d7c/docs/specification/2026-07-28/basic/index.mdx).

**F33.** OpenTelemetry GenAI conventions moved to a separate repository [D07](https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/gen-ai/gen-ai-spans.md); the spans document has status Development. `gen_ai.conversation.id` identifies a conversation (session, thread) “used to store and correlate messages.” [D05, GenAI spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/6fd0d763a092db245a54104fc1124031eb3c51d2/docs/gen-ai/gen-ai-spans.md).

**F34.** Instructions, inputs and outputs are considered sensitive and often large; instrumentations SHOULD NOT capture them by default, and the default usage pattern is not to record them. [D05, Capturing instructions, inputs, and outputs](https://github.com/open-telemetry/semantic-conventions-genai/blob/6fd0d763a092db245a54104fc1124031eb3c51d2/docs/gen-ai/gen-ai-spans.md).

**F35.** The `gen_ai.input.messages` JSON schema defines roles `system`, `user`, `assistant`, `tool` and part types including text, tool-call request, tool-call response, reasoning, compaction, blob, file and URI parts. [D06, gen-ai-input-messages.json](https://github.com/open-telemetry/semantic-conventions-genai/blob/6fd0d763a092db245a54104fc1124031eb3c51d2/model/gen-ai/gen-ai-input-messages.json).

## Client-owned history in agent-hosting tools

**F36.** Zed hosts External Agent threads in its Agent Panel over ACP while the agent usually owns its runtime, auth and model selection. [E02, External Agents](https://github.com/zed-industries/zed/blob/v1.23.2/docs/src/ai/external-agents.md). Restoring threads from history for External Agents depends on the agent integration; Zed's Thread History holds threads across projects and can restore them. [E01, Agent Panel](https://github.com/zed-industries/zed/blob/v1.23.2/docs/src/ai/agent-panel.md).

**F37.** Zed's native agent stores threads in SQLite at `<data_dir>/threads/threads.db` in a `threads` table (`id`, `summary`, `updated_at`, `data_type`, `data`), with a serialized `DbThread` (title, messages, model, token usage and more) optionally zstd-compressed. [E03, crates/agent/src/db.rs](https://github.com/zed-industries/zed/blob/v1.23.2/crates/agent/src/db.rs).

**F38.** Continue writes each session to `~/.continue/sessions/<sessionId>.json` (overridable by `CONTINUE_GLOBAL_DIR`) plus a `sessions.json` index; a `Session` holds `sessionId`, `title`, `workspaceDirectory`, `history: ChatHistoryItem[]`, and optional mode, chat model title and usage. [E04, paths.ts](https://github.com/continuedev/continue/blob/v2.1.0-vscode/core/util/paths.ts), [E05, history.ts and index.d.ts](https://github.com/continuedev/continue/blob/v2.1.0-vscode/core/util/history.ts).

**F39.** Continue's GUI builds the `ChatMessage[]` sent to a model from the stored `ChatHistoryItem[]` in `constructMessages`. [E06, constructMessages.ts](https://github.com/continuedev/continue/blob/v2.1.0-vscode/gui/src/redux/util/constructMessages.ts).

**F40.** Open WebUI stores chats in a `chat` database table with a JSON `chat` column (holding a `history` object with `currentId`), plus `title`, timestamps, `archived`, `pinned`, `folder_id` and `current_message_id`. [E07, models/chats.py](https://github.com/open-webui/open-webui/blob/v0.11.4/backend/open_webui/models/chats.py). The default database is SQLite at `DATA_DIR/webui.db`, overridable with `DATABASE_URL`. [E08, env.py](https://github.com/open-webui/open-webui/blob/v0.11.4/backend/open_webui/env.py).

**F41.** LibreChat stores messages as Mongoose documents with `messageId`, `conversationId`, `parentMessageId`, `endpoint` and `model`, and conversations reference their messages. [E09, schemas](https://github.com/danny-avila/LibreChat/blob/v0.8.8/packages/data-schemas/src/schema/message.ts). Before a request, `loadHistory` reads the conversation's messages from the database and orders them by walking `parentMessageId` links. [E10, BaseClient.js](https://github.com/danny-avila/LibreChat/blob/v0.8.8/api/app/clients/BaseClient.js).

**F42.** Aider writes the chat to `.aider.chat.history.md` by default (`--chat-history-file`), input history to `.aider.input.history`, and optionally the raw LLM conversation to `--llm-history-file`; `--restore-chat-history` defaults to False. [E11, options](https://github.com/Aider-AI/aider/blob/v0.86.0/aider/website/docs/config/options.md).

**F43.** When restore is enabled, Aider parses the Markdown history file into role/content messages (`split_chat_history_markdown`), assigns them to `done_messages`, starts summarization, and later includes `done_messages` in the chunks it formats for the model. [E12, base_coder.py and utils.py](https://github.com/Aider-AI/aider/blob/v0.86.0/aider/coders/base_coder.py).

## Method, caveats and sources

- **Method.** Sources were chosen per the five topic areas in the request: vendor runtime docs (Anthropic, OpenAI Codex), local server docs (Ollama, llama.cpp, LM Studio), OpenAI API docs, protocol specifications (ACP, MCP, OpenTelemetry GenAI), and source at release tags for client tools (Zed, Continue, Open WebUI, LibreChat, Aider). Pages were fetched with `curl`; Markdown variants were used where the publisher offers them; HTML pages were tag-stripped locally. Repository tags were resolved to commits with `git ls-remote`. Exact refs and excerpts are in the [source records](raw/agent-chat-history/sources.md).
- **Caveats.** Vendor documentation pages (Anthropic, OpenAI, LM Studio, ACP site) are live and unpinned. The Codex method catalog comes from the developer page, not the pinned repository. Several findings rest on source code reading, not on running the software; no resume, retention or replay behavior was reproduced. Absence statements (F16, F21, F22, F31) apply only to the pages or folders named. No claim is made about how often vendor transcript formats change beyond Anthropic's own statement in F03.
- **Gaps.** LM Studio's on-disk storage and restart durability for stateful chats, llama.cpp `/v1/responses` statefulness beyond the README, and Codex rollout retention beyond configuration documentation were not established. Gemini CLI, OpenCode and other ACP agents were not examined.
- **Related prior findings.** [Editing harness foundations](2026-09-30-editing-harness-foundations.md) covers checkpointing, compaction and MCP transport resumability.
