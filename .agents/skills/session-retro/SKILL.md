---
name: session-retro
description: Run a retro on a coding-agent session (Claude Code or Codex) in this repository, from its transcript, when asked to "retro this", "retro that session", "why did that take so long" or "what went wrong". Covers the skills followed, MCP tools and refusals, editor bugs the creator hit, missing dials, performance and agent overhead, then makes the ranked fixes the checkout's working agreements allow and records the rest as later work. Not for reviewing a diff (code-review), measuring a slow editor path (performance-review), or learning the creator's taste (My Style is never changed by a retro).
---

# Session retro

Turn one agent session into evidence, a ranked list of fixes, and those fixes made. A retro
fixes what it finds: bugs, docs, skills, tool descriptions and messages, and routing, each with
a test or check, left uncommitted. It never changes My Style or the session's project (its
timeline, proposals, feedback or history), and never approves, rejects or re-runs the session's
edits. A new capability the checkout's working agreements (`AGENTS.local.md`, when present) do
not allow is recorded as later work in the [project status](../../../docs/project-status.md), not
built. The person can still say "report only"; then stop after the report.

"Retro this" is enough to start. AGENTS.md's ban on starting a retrospective is about My
Style learning from edits, not about reviewing how a session went.

## Inputs

| Input | Default when not given |
| --- | --- |
| Session | The session the request refers to. When it is "this" session, use your own session id. When unclear, run `pnpm session-timeline` to list this checkout's recent sessions and ask which one. |
| Stretch | The whole session. Use `--from "<words from the person's message>"` when the request names a starting point. |
| Questions | The lenses below. Questions the person names come first in the report. |
| Earlier retros | Look in `docs/audits/` for a retro of the same session. Extend it from where it stopped and link it, rather than redoing its tables. |

A session that is still running is reviewed up to the time you extract it. Say that cutoff at
the top of the report.

## 1. Extract the timeline

```bash
pnpm session-timeline <session-id> --from "<start words>" --out <scratchpad>/timeline.txt
```

[session-timeline.ts](../../../scripts/session-timeline.ts) prints a tally per tool first:
calls, failures, characters sent and seconds spent composing calls. After that it lists every
message, call and result, each with its transcript line number. Messages sent while the agent
was working show as `QUEUED`, and context compactions as `COMPACTION`. Thinking and
credentials are left out. Compose seconds include the agent's thinking before a call, so
treat them as time spent on that call, not typing speed. Read the whole timeline. For details it truncates, such as a
refusal's full text or a payload, read the raw transcript at that line number. The path is in
the script's error and listing output: `~/.claude/projects/<checkout>/` or `~/.codex/sessions/`.

## 2. Lay out what was asked and what came back

Make one row per request from the person:

- when it was asked, and when a reviewable result (a card, a fix) came back;
- the attempts that took;
- what the person said next (accepted, corrected, called it wrong).

Note the idle gaps where the person was away, so agent time and waiting time stay separate.

## 3. Read through each lens

Cite every finding by time or line number. Keep what was observed, what you infer and what
the person said apart.

| Lens | Ask | Owner to read first |
| --- | --- | --- |
| **Skills** | Which skill should have applied, was it read and followed, and was it right? Judge the skill against its Purpose, not its wording. | The skill's `evolution.md` and the [skill evolution standard](../../../docs/standards/skill-evolution.md) |
| **Mistakes** | For each wrong result, what was the root cause, and which procedure, check or skill should have caught it? | The skill, AGENTS.md, [dreamcut-proposals](../dreamcut-proposals/SKILL.md) |
| **Tools and MCP** | Group refusals by cause. Was each message enough to fix the call without reading source code? Look for hand-built or pasted payloads (large input chars, high compose seconds), script workarounds and polling the agent did by hand. When the agent scripted something, search `capability_catalog` and `mcp/server.mjs` for a tool that already does it: a tool that exists but was not found is a description or routing fix, not a missing tool. | [Tool authoring](../../../docs/standards/tool-authoring.md), `docs/tools/evolution/` |
| **Editor** | Which bugs or confusing behaviour did the creator hit? | [code-review](../code-review/SKILL.md), [editor-ui-design](../editor-ui-design/SKILL.md) |
| **Dials** | Which controls did the creator ask for or fail to find? Propose the smallest general control that would cover them. | [Editable parameter contract](../../../docs/standards/editable-parameter-contract.md) |
| **Performance** | Where did the agent or creator wait: preparation, rebuilds, preview loading, seeks? Transcript times show the agent's waits; the creator's own re-renders in the editor are not in the transcript, so read them (read only) from the project's `audit/motion` (`render` events carry `elapsed_ms`). Say where to measure it. | [performance-review](../performance-review/SKILL.md) for anything that needs measuring |
| **Overhead** | Where did the agent lose its own time: compose time, re-reading big outputs, retries without a change, compactions, repeated discovery? | The [knowledge architecture](../../../docs/agent-knowledge-architecture.md) on execution findings |

## 4. Rank the fixes

One table. For each fix give:

- its type: **bug**, **tool**, **dial**, **skill** or **perf**;
- effort (S, M or L);
- the time it would have saved in this session.

Rank by saved time and creator impact. Respect the checkout's working agreements (`AGENTS.local.md`,
when present): a capability they hold back is listed as a proposal, not as planned work.

## 5. Make the fixes

Work down the ranked table. For each fix the working agreements allow (a bug, a doc or skill, a tool
description or message, routing):

- Read the owning skill or standard first, as AGENTS.md routes it (editor UI, tools, effects,
  shared instructions all have their own).
- Make the change and add a test for each bug. Prove it: the test fails without the change
  where that is cheap to check.
- Record a skill or tool change in its `evolution.md`, citing the report.
- Leave the session's own in-flight changes as they are. Don't touch files another session
  is editing; if a fix needs them, list it as blocked.

Write new capabilities (a new dial, tool input or stored data) to project status, dated, with
the retro as evidence. Then run the checks AGENTS.md requires for what changed (`pnpm typecheck`,
the affected tests, and `check:tools`, `check:agent-parity`, `check:parameter-contract`,
`check:editor-ui` where they apply). Don't commit unless asked.

## 6. Write the report

Save it as `docs/audits/<YYYY-MM-DD>-<topic>-retro.md`. That folder is git-ignored and holds
internal audits. The report usually names private footage, projects and references, so it
stays there unless the owner asks for a public version. Sections:

- summary;
- timeline;
- one section per lens the session touched;
- ranked fixes;
- fixes made;
- deferred;
- limits.

Under **Fixes made**, list each change with its file, test and check result. Under **Deferred**,
list each later-work item and where you recorded it, and each fix left undone with the reason.
Never propose My Style changes.

Report back with the report's path, what you fixed, which checks passed, and what you deferred
and why. If the retro covered only part of a session that is still running, say where it
stopped.
