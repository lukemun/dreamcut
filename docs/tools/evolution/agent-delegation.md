# Parallel helper agents for the in-editor agent — evolution

Capability: `agent-delegation`. Registry: [registry.json](../registry.json).

## Purpose and boundary

The desktop chat agent can split independent read-only or preparation work, such as
checking several clips, across helper agents that run at the same time, then use their
reports. Helpers cannot create proposals, record feedback, change the timeline, approve
or delegate further. Every reviewable change still comes from the main agent.

## 2026-10-10 — initial provider-neutral implementation

- **Observation:** Requests that touch several clips run their inspection one tool call at
  a time. The creator asked for helper agents to shorten that wait.
- **Decision:** One host tool, `agent_delegate`, is added through the shared editing tool
  bridge (`desktop/codex-tool-bridge.mjs` `hostTools`), so Claude and Codex receive it
  without provider-specific tool code. Each helper is a fresh session of the main agent's
  provider and model, sharing its project lease, with a fixed read/preparation allowlist
  (`HELPER_TOOLS`) and its own journal under the conversation's journal `delegates/`
  folder. Claude helpers do not persist sessions; Codex helpers use ephemeral threads with
  no saved ownership. Helper tool steps appear in the chat's activity; helper text returns
  only to the main agent, labelled as evidence rather than creator direction.
- **Limits:** Up to 4 tasks, 4 at once, 150 s deadline, inside the 5-minute main turn.
  Stopping the main response interrupts its helpers. `capability_catalog` is excluded
  because family loading would change the shared MCP connection.
- **Local models:** Not offered. The host serves one local model to one request at a
  time, so helpers would queue behind each other and add context cost without saving time.
- **Version:** Adding the tool changes the saved tool hash, so existing Claude and Codex
  conversations restart once with their history as context.
- **Verification:** Unit tests cover concurrency, ordering, invalid input, deadline,
  cancellation, per-helper failure, allowlist and the session wiring for each provider.
  `pnpm agent:smoke --case delegate` ran two real helpers each for Claude and Codex
  (Codex ephemeral threads under the restricted profile included); all completed with
  settled helper journals.
- **Observed defect:** In that smoke, two Claude helpers ran `frame-state` at once and read
  each other's report, because it writes one fixed folder per project. `run_instrument` is
  excluded from helpers until instrument output is per-run. Other `*_prepare` jobs are
  not yet verified under parallel helpers.
- **Not yet measured:** wall-time savings on a multi-clip request against the single-agent path.
- **Acceptance for next change:** Run a provider smoke with real helpers and measure
  time to a reviewable proposal against the single-agent path before widening the
  allowlist or limits.
