# Agent-agnostic chat history — source records

Retrieved 2026-10-09. Capture scope: attributed short excerpts and section metadata only, not full captures. Publication dates are unknown for live documentation pages; repository sources are pinned to the tag or commit shown. Findings IDs refer to the [evidence deliverable](../../2026-10-09-agent-agnostic-chat-history.md).

Retrieval: live vendor documentation was fetched as Markdown where the site offers it (`<page>.md`), otherwise as HTML with tags stripped locally; repository files were fetched from `raw.githubusercontent.com` at the pinned ref. Tag-to-commit resolution used `git ls-remote`.

## Pinned repository refs

| Repository | Ref | Commit |
| --- | --- | --- |
| openai/codex | `rust-v0.162.1` (latest release at retrieval) | 7a078f6bb4ce0dc2a81408b334ce52979d92c603 |
| ollama/ollama | `v0.40.2` | b061384d90ff455462bc32745dd0de479de717a3 |
| ggml-org/llama.cpp | `v0.6.0` (release published 2026-10-05) | tag object 69ecae922d2b60c1fa8c590279f4e2099af75111 → d81235049384534c167caea52b85a694f6103d14 |
| modelcontextprotocol/modelcontextprotocol | `main` at retrieval, spec folder `2026-07-28` | c518f7a927cff918bce35d3522fcdb046d264d7c |
| open-telemetry/semantic-conventions-genai | `main` at retrieval (no release tag published) | 6fd0d763a092db245a54104fc1124031eb3c51d2 |
| zed-industries/zed | `v1.23.2` | c0199504b9cce79bc27524950022ed701bc3ebd5 |
| continuedev/continue | `v2.1.0-vscode` | b238c1f11f26805f4387e10bab878b009f98e7a4 |
| open-webui/open-webui | `v0.11.4` | 8bd8b4fac5e059578ac0c74b3c18d11139f88b7d |
| danny-avila/LibreChat | `v0.8.8` | e8f3be08623663d4ad7f7241e693c94469b63bb0 |
| Aider-AI/aider | `v0.86.0` | a4be6ccd87ebaa59b361f3f028d116ce1761b626 |

## Records

| ID | Publisher / title / URL | Examined section; supported findings | Brief verbatim excerpt |
| --- | --- | --- | --- |
| A01 | Anthropic, [Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions) (Agent SDK) | Choose an approach; Continue, resume, and fork; Resume across hosts; F01–F04 | “The SDK writes it to disk automatically so you can return to it later.” |
| A02 | Anthropic, [TypeScript Agent SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript) | `listSessions()`, `getSessionMessages()`, Options table (`persistSession`, `resumeSessionAt`); F02, F05 | “Reads user and assistant messages from a past session transcript.” |
| A03 | Anthropic, [Persist sessions to external storage](https://code.claude.com/docs/en/agent-sdk/session-storage) | `SessionStore` interface; Behavior notes (dual write, resume from store, best-effort mirror, post-compaction chain, fork, retention); F06–F08 | “the store is a mirror of the local transcript rather than a replacement for it” |
| A04 | Anthropic, [Claude Code sessions](https://code.claude.com/docs/en/sessions) | What a resumed session restores; Where transcripts are stored; F03, F09 | “The entry format is internal to Claude Code and changes between versions” |
| A05 | Anthropic, [Claude directory](https://code.claude.com/docs/en/claude-directory) | Cleaned up automatically; F10 | “The default is 30 days and the minimum is 1” |
| A06 | Anthropic, [Data usage](https://code.claude.com/docs/en/data-usage) | Data retention, local caching; F10 | “store session transcripts locally in plaintext under `~/.claude/projects/` for 30 days by default” |
| A07 | Anthropic, [Environment variables](https://code.claude.com/docs/en/env-vars) | `CLAUDE_CODE_SKIP_PROMPT_HISTORY`; F10 | “skip writing prompt history and session transcripts to disk” |
| B01 | OpenAI, [Codex App Server](https://developers.openai.com/codex/app-server) | API overview (thread methods); Start/resume/fork/read/archive/inject sections; F11–F15 | “reopen an existing thread by id so later `turn/start` calls append to it” |
| B02 | OpenAI, [Codex advanced configuration](https://developers.openai.com/codex/config-advanced) | Config and state locations; History persistence; F16 | “Codex stores its local state under `CODEX_HOME` (defaults to `~/.codex`).” |
| B03 | OpenAI, [Codex configuration reference](https://developers.openai.com/codex/config-reference) | `history.persistence`, `history.max_bytes`; F16 | “Control whether Codex saves session transcripts to history.jsonl.” |
| B04 | openai/codex `rust-v0.162.1`, [codex-rs/rollout/src/lib.rs](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/rollout/src/lib.rs) | Constants, lines 86–87; F17 | `pub const SESSIONS_SUBDIR: &str = "sessions";` |
| B05 | openai/codex `rust-v0.162.1`, [codex-rs/rollout/src/recorder.rs](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/rollout/src/recorder.rs) | Module doc (line 1); `precompute_new_rollout_path` (lines 1740–1760); F17 | “Persist Codex session rollouts (.jsonl) so sessions can be replayed or inspected later.” |
| C01 | Ollama `v0.40.2`, [docs/api.md](https://github.com/ollama/ollama/blob/v0.40.2/docs/api.md) | Generate (`context`, deprecated); Generate a chat completion parameters; Chat request (With History); F18 | “the messages of the chat, this can be used to keep a chat memory” |
| C02 | Ollama `v0.40.2`, [docs/api/openai-compatibility.mdx](https://github.com/ollama/ollama/blob/v0.40.2/docs/api/openai-compatibility.mdx) | `/v1/responses` supported features and request fields; F19 | “Only the non-stateful flavor is supported” |
| C03 | ggml-org llama.cpp `v0.6.0`, [tools/server/README.md](https://github.com/ggml-org/llama.cpp/blob/v0.6.0/tools/server/README.md) | Server options (`--cache-prompt`, `--slot-save-path`); `/completion` `cache_prompt`; `/slots` save/restore; `/v1/chat/completions`; `/v1/responses`; F20–F21 | “Re-use KV cache from a previous request if possible.”; “Given a ChatML-formatted json description in `messages`” |
| C04 | LM Studio, [Stateful chats](https://lmstudio.ai/docs/developer/rest/stateful-chats) | How it works; Disable stateful storage; F22 | “The /api/v1/chat endpoint is stateful by default.” |
| C05 | LM Studio, [Chat (REST)](https://lmstudio.ai/docs/developer/rest/chat) | Request body `store`, `previous_response_id`; F22 | “Whether to store the chat.” |
| C06 | LM Studio, [OpenAI-compatible Responses](https://lmstudio.ai/docs/developer/openai-compat/responses) | Stateful follow-up; F22 | “Use the id from a previous response as previous_response_id” |
| C07 | OpenAI, [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state) | Manually manage conversation state; Conversations API; `previous_response_id`; Data retention for model responses; F23–F26 | “each text generation request is independent and stateless” |
| C08 | OpenAI, [Create chat completion](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) (API reference) | `messages` param; assistant and tool message params; `store` param; F27 | “A list of messages comprising the conversation so far.” |
| D01 | Agent Client Protocol, [Session setup](https://agentclientprotocol.com/protocol/session-setup) (latest schema tag at retrieval: `schema-v1.25.0`) | Loading sessions; Resuming sessions; F28–F29 | “The Agent MUST replay the entire conversation to the Client” (bold formatting omitted) |
| D02 | Agent Client Protocol, [Session list](https://agentclientprotocol.com/protocol/session-list) | Checking support; discovery-only note; F30 | “discovery mechanism only” |
| D03 | Model Context Protocol, [Architecture](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/c518f7a927cff918bce35d3522fcdb046d264d7c/docs/specification/2026-07-28/architecture/index.mdx), spec version 2026-07-28 | Design principles, item 3; F31 | “Full conversation history stays with the host” |
| D04 | Model Context Protocol, [Base protocol overview](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/c518f7a927cff918bce35d3522fcdb046d264d7c/docs/specification/2026-07-28/basic/index.mdx), spec version 2026-07-28 | Statelessness; F32 | “an open connection, such as a STDIO process, is not a conversation or session” |
| D05 | OpenTelemetry, [GenAI spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/6fd0d763a092db245a54104fc1124031eb3c51d2/docs/gen-ai/gen-ai-spans.md) | Status; `gen_ai.conversation.id`; Capturing instructions, inputs, and outputs; F33–F34 | “OpenTelemetry instrumentations SHOULD NOT capture them by default” |
| D06 | OpenTelemetry, [gen-ai-input-messages.json](https://github.com/open-telemetry/semantic-conventions-genai/blob/6fd0d763a092db245a54104fc1124031eb3c51d2/model/gen-ai/gen-ai-input-messages.json) | Schema description; `$defs` names; `Role` enum; F35 | “Represents the list of input messages sent to the model.” |
| D07 | OpenTelemetry, [GenAI migration notice](https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/gen-ai/gen-ai-spans.md) (semantic-conventions `v1.44.0`) | Notice; F33 | “This page has moved and is no longer maintained in this repository.” |
| E01 | Zed `v1.23.2`, [docs/src/ai/agent-panel.md](https://github.com/zed-industries/zed/blob/v1.23.2/docs/src/ai/agent-panel.md) | External-agent note; Managing Multiple Threads; F36 | “Restoring threads from history … depend on the agent integration.” (ellipsis marks omitted words) |
| E02 | Zed `v1.23.2`, [docs/src/ai/external-agents.md](https://github.com/zed-industries/zed/blob/v1.23.2/docs/src/ai/external-agents.md) | Introduction; capability table; F36 | “Zed hosts the thread in the Agent Panel” (link markup omitted) |
| E03 | Zed `v1.23.2`, [crates/agent/src/db.rs](https://github.com/zed-industries/zed/blob/v1.23.2/crates/agent/src/db.rs) | `DbThread` struct (line 54); zstd encode (line 178); database path and `threads` table (lines 444–457); F37 | `let sqlite_path = threads_dir.join("threads.db");` |
| E04 | Continue `v2.1.0-vscode`, [core/util/paths.ts](https://github.com/continuedev/continue/blob/v2.1.0-vscode/core/util/paths.ts) | `CONTINUE_GLOBAL_DIR`, `getSessionsFolderPath`, `getSessionFilePath`, `getSessionsListPath` (lines 27–107); F38 | “This is ~/.continue on mac/linux” |
| E05 | Continue `v2.1.0-vscode`, [core/util/history.ts](https://github.com/continuedev/continue/blob/v2.1.0-vscode/core/util/history.ts) and [core/index.d.ts](https://github.com/continuedev/continue/blob/v2.1.0-vscode/core/index.d.ts) | `HistoryManager.save`/`load`; `Session` and `ChatHistoryItem` interfaces; F38 | `history: ChatHistoryItem[];` |
| E06 | Continue `v2.1.0-vscode`, [gui/src/redux/util/constructMessages.ts](https://github.com/continuedev/continue/blob/v2.1.0-vscode/gui/src/redux/util/constructMessages.ts) | `constructMessages(history, …)` signature and loop (lines 37–103); F39 | `messages: ChatMessage[];` (return type field) |
| E07 | Open WebUI `v0.11.4`, [backend/open_webui/models/chats.py](https://github.com/open-webui/open-webui/blob/v0.11.4/backend/open_webui/models/chats.py) | `class Chat(Base)` (lines 129–151); history/currentId handling (lines 403–531); F40 | `chat = Column(JSON)` |
| E08 | Open WebUI `v0.11.4`, [backend/open_webui/env.py](https://github.com/open-webui/open-webui/blob/v0.11.4/backend/open_webui/env.py) | `DATABASE_URL` default (line 271); F40 | `DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{DATA_DIR}/webui.db')` |
| E09 | LibreChat `v0.8.8`, [packages/data-schemas/src/schema/message.ts](https://github.com/danny-avila/LibreChat/blob/v0.8.8/packages/data-schemas/src/schema/message.ts) and [convo.ts](https://github.com/danny-avila/LibreChat/blob/v0.8.8/packages/data-schemas/src/schema/convo.ts) | Mongoose schema fields `messageId`, `conversationId`, `parentMessageId`, `endpoint`, `model`; convo `messages` refs; F41 | `messages: [{ type: Schema.Types.ObjectId, ref: 'Message' }],` |
| E10 | LibreChat `v0.8.8`, [api/app/clients/BaseClient.js](https://github.com/danny-avila/LibreChat/blob/v0.8.8/api/app/clients/BaseClient.js) | `loadHistory` (lines 1256–1310); `getMessagesForConversation` doc comment (lines 1425–1438); F41 | “The 'parentMessageId' is the ID of the message that the current message is a reply to.” |
| E11 | Aider `v0.86.0`, [aider/website/docs/config/options.md](https://github.com/Aider-AI/aider/blob/v0.86.0/aider/website/docs/config/options.md) | History files section; F42 | “Restore the previous chat history messages (default: False)” |
| E12 | Aider `v0.86.0`, [aider/coders/base_coder.py](https://github.com/Aider-AI/aider/blob/v0.86.0/aider/coders/base_coder.py) and [aider/utils.py](https://github.com/Aider-AI/aider/blob/v0.86.0/aider/utils.py) | Restore block (lines 519–523); `format_chat_chunks` (line 1279); `split_chat_history_markdown` (line 145); F43 | `self.done_messages = utils.split_chat_history_markdown(history_md)` |

## Retrieval notes

- The openai/codex repository README for `codex-rs/app-server` at `rust-v0.162.1` was retrieved but contains release notes rather than the method catalog; the method catalog was taken from the official developer page (B01), which is unpinned live documentation.
- The OpenTelemetry GenAI conventions moved out of `open-telemetry/semantic-conventions` (D07); the owning repository had no published release at retrieval, so a `main` commit is pinned.
- The first ACP retrieval attempt against a guessed repository path returned a 404 stub; the official site's Markdown pages (D01, D02) were then retrieved in full. The live site is not pinned to a schema tag.
- LM Studio pages were retrieved as HTML and stripped locally; no Markdown variant was used.
- Open WebUI and LibreChat documentation sites were not examined; findings rest on source at the pinned tag.
- No source was classified as inaccessible.
