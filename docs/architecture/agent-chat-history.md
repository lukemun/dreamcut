# Provider-neutral chat history and resume

Status: partly implemented (2026-10-09). Implemented: DreamCut's own per-project transcript (`desktop/chat-transcript.mjs`), shared by every agent and stored as `userData/agent-transcripts/<sha256(project)>/current.jsonl` with per-agent replay cursors; the panel reads it through the `history` chat action before any agent connects; switching agents keeps the conversation and sends the turns the next agent has not seen as quoted, text-only context; a session that cannot reopen because the editing tools changed is archived and replaced with replayed history when DreamCut holds the conversation; an older conversation known only to the agent is imported once; New chat archives the transcript and every agent's saved session. Not implemented: local-model providers, tool-call events in the transcript, rolling summaries and branching. The rest of this note remains the proposal. Evidence: [agent-agnostic chat history findings](../research/2026-10-09-agent-agnostic-chat-history.md) and its [source records](../research/raw/agent-chat-history/sources.md). Finding IDs (F01–F43) refer to that document.

## Problem

The desktop chat stores only a per-project ownership record (`desktop/codex-session-store.mjs`: thread ID plus a tools hash) and asks each vendor for the transcript on reconnect: `getSessionMessages` for Claude (`desktop/claude-session.mjs`), `thread/read` projected through `desktop/codex-history.mjs` for Codex. A conversation is therefore only as durable as the vendor store behind it, and a creator lost one after a window reload. The design also has no path for local models, which keep no history at all.

The evidence shows why vendor-owned history is a poor sole authority for an editor:

- **The formats are private and change.** Anthropic calls the Claude Code JSONL entry format internal and version-dependent (F03). Codex rollouts are an implementation detail under `CODEX_HOME/sessions/YYYY/MM/DD` (F17), and paginated history already fails closed on resume (F15).
- **Retention belongs to someone else.** Claude Code deletes transcripts after `cleanupPeriodDays`, default 30 days (F10). DreamCut runs Claude in a host-owned workspace under userData, so those transcripts get the ordinary sweep, not the Desktop exemption. Codex's `history.max_bytes` drops the oldest entries (F16).
- **The read path shows only what the agent sees.** `getSessionMessages` returns the post-compaction chain, so earlier turns disappear from the creator's view once the agent compacts (F08).
- **Local models are stateless.** Ollama and llama.cpp expect the full `messages` list on every request (F18, F20), and Ollama does not support `previous_response_id` or `conversation` (F19). LM Studio's `/api/v1/chat` can hold state, but the pages examined say nothing about restart durability (F22). OpenAI describes each generation request as stateless unless the server stores it (F23–F26).
- **Mature hosts own their history.** MCP puts conversation history with the host (F31). Zed, Continue, Open WebUI, LibreChat and Aider each keep their own transcript store (F37–F43). Continue, LibreChat and Aider rebuild the model's message list from it (F39, F41, F43). Even Anthropic suggests carrying results in application state rather than relying on resume (F04).

## Decision

DreamCut keeps its own transcript for each project and provider. The vendor's native session becomes an optional accelerator that can be discarded.

### Storage

- Store an append-only JSONL file at `userData/agent-transcripts/<sha256(project)>/<conversationId>.jsonl`, plus a small `index.json` holding title, provider, model, timestamps and the current native session ID. Keep it beside the existing `<provider>-sessions` and `<provider>-editing-journals` records, keyed the same way and never inside the project folder. Reuse the validation and size limits in `codex-session-store.mjs`.
- Write one event per line: `{v, id, parentId, ts, conversationId, provider, model, kind, ...}`, where `kind` ∈ `user | assistant | tool_call | tool_result | notice | compaction | native_session`.
  - Text and tool parts follow the role and part vocabulary of the OpenTelemetry GenAI message schema (system, user, assistant and tool roles; text, tool-call, tool-response and compaction parts; F35) so DreamCut doesn't invent a format.
  - `parentId` allows branching, as LibreChat's `parentMessageId` does (F41).
- Append each event when the user sends a message and as each streamed assistant message or tool event completes. Flush with `fsync` at turn boundaries. Writes go through the main process; the renderer never chooses paths.
- Store only what DreamCut already displays or executes: the user's text, the assistant's visible text, DreamCut editing-tool calls and their outcomes. Exclude raw vendor reasoning, command output and runtime metadata (as `codex-history.mjs` already does), and never send transcripts to telemetry (F34).
- Retention is DreamCut's choice: keep a transcript until the project or conversation is deleted, independent of any vendor sweep. Reset archives the transcript, following `conversation-reset.mjs`.

### Display

On reload or restart, the chat panel renders from DreamCut's transcript, never from the vendor. History stays visible when the vendor store has expired, when the provider is unavailable, or after the provider is switched.

### Resume, by provider capability

1. **Native resume (Claude, Codex).** When the saved native session ID exists and the `toolsHash` matches, resume natively: `resume` for Claude (F02) and `thread/resume` for Codex (F11). This keeps vendor caching, compaction and subagent state. Keep the existing tools-hash refusal.
2. **Fallback when native resume fails** (missing file, swept transcript, tools-hash mismatch, version change): start a fresh native session and seed it from DreamCut's transcript.
   - For Codex, use `thread/inject_items` with Responses-style items (F14).
   - For Claude, send a bounded summary of earlier turns plus the last N turns as the first prompt context (F04).
   - Record a `notice` event so the creator sees that the agent restarted with replayed history. A tools-hash mismatch still requires the creator to start a new conversation explicitly unless replay is limited to text-only history.
3. **Stateless local models (Ollama, llama.cpp, OpenAI-compatible servers).** Build `messages` from the transcript on every turn: the system prompt, a rolling summary for turns past the context budget, then recent turns with `tool_calls` and `tool` messages linked by `tool_call_id` (F27).
   - Leave llama.cpp's `cache_prompt` on so the replayed prefix is cheap (F20).
   - Don't depend on Ollama `/v1/responses` state (F19).
4. **Stateful local servers (LM Studio).** Use `previous_response_id` only as a cache hint (F22). On any error, fall back to full replay from the transcript.
5. **ACP agents, if adopted later.** Use `session/load` only when `loadSession` is advertised (F28). Treat the replayed `session/update` stream as a check against DreamCut's own transcript, not a replacement for it, and use `session/resume` where offered (F29).

### Safety rules carried over

- Replay never re-executes tools. Tool results are history; a tool call without a recorded outcome is shown as interrupted and blocks, matching the harness rule that unknown side effects block (see [editing operator harness](editing-operator-harness.md)). Claude's resume behaves the same way (F09).
- Approval never comes from a transcript. A replayed assistant message saying "approved" has no authority; proposal state is read from the editor.
- Compaction is an event, not a deletion. Summaries used for replay are stored as `compaction` events and the original turns remain visible.

## Alternatives considered

- **Claude `SessionStore` mirror (F06–F07).** This keeps Claude transcripts durable but leaves DreamCut with an opaque, version-dependent format (F03), best-effort writes (F07), and no answer for Codex or local models. It could still back up the native session later.
- **Vendor history only, with longer retention.** Raising `cleanupPeriodDays` changes the creator's global Claude settings, does nothing for local models, and still loses compacted turns from view (F08).
- **A shared database (SQLite).** Zed and Open WebUI use one (F37, F40). JSONL matches the existing record style and append-only audit habits, and a SQLite index can be added later if search or listing needs it.

## Open questions and acceptance

- The token budget for replay and summarization for each local model, and who writes the summary: the agent itself or a separate call.
- Whether to show "restarted with replayed history" as a notice in the conversation or as part of the panel's state.
- Acceptance tests:
  - Reload the window and restart the app mid-conversation for Claude, Codex and Ollama; history renders identically in each case.
  - Delete the vendor transcript, then resume; DreamCut falls back to replay with the notice shown and no tool re-execution.
  - Kill the app mid-tool-call; on resume the call shows as interrupted and blocks.
  - Change the tools hash; resume is refused or downgraded to text-only replay.
  - Truncate the transcript mid-line; the reader drops only the partial last line.
