# Agent surface parity

DreamCut has two kinds of agents. Coding agents (Claude Code, Codex) run beside the
repository with a shell and run the editor as a website. The in-editor agent runs inside the
desktop app with MCP tools only. Both must be able to do the same editing work, so a feature
built for one is not silently missing from the other.

## The contract

1. **One editing surface.** Every agent-facing editing operation is an MCP tool on the one
   DreamCut server. Coding agents connect to the same server. CLIs and API routes are the
   implementation behind a tool, not a second interface. Follow the
   [tool-authoring standard](tool-authoring.md) to add one.
2. **The registry decides editor access.** Every capability in
   [registry.json](../tools/registry.json) has an `editor_agent` field:
   - `{"access": "enabled"}`: the in-editor agent gets all of its tools;
   - `{"access": "enabled", "excluded_tools": {"<tool>": "<reason>"}}`: all but the named tools;
   - `{"access": "excluded", "reason": "..."}`: not for the in-editor agent, for example direct
     workspace writes, which are limited to agent workspaces before handoff;
   - `{"access": "host", "reason": "..."}`: supplied by the desktop host rather than MCP.
3. **Runtime lists are derived, never hand-kept.** The desktop session's families
   (`editorAgentFamilies()`), the harness operator allowlist (`editorAgentTools()`) and the
   feature eval's offered tools all come from those fields in
   [capability-catalog.mjs](../../mcp/capability-catalog.mjs).
4. **Editing skills work for both agents.** When a skill used for editing tells an agent to
   run a shell command or read a repository file, the same line names the MCP tool that does
   it in the editor, or the difference is recorded in
   [agent-surface-exemptions.json](../tools/agent-surface-exemptions.json): either the whole
   skill is for coding agents (repository development), or the line is a known gap with the
   missing tool named.

## Enforcement

`pnpm check:agent-parity` (also part of `pnpm check:tools`) fails when:

- a capability has no valid `editor_agent` field, or an excluded or host entry has no reason;
- the desktop session or harness keeps its own tool or family list;
- an editing skill gives a shell or file instruction with no MCP tool on that line and no
  recorded gap;
- an exemption no longer matches anything, so closed gaps leave the list.

Every run prints the recorded gaps. A gap is a backlog item, not a permanent exception:
close it by adding the tool, naming it in the skill, and deleting the exemption.

## History

Recorded 2026-10-11. Before this contract, three lists disagreed: four tools were offered to
the in-editor agent but refused by the allowlist, seven were allowlisted but never loaded, and
the feature eval offered tools the live session did not. The creator then enabled those tools
for the in-editor agent; the registry records that decision.
