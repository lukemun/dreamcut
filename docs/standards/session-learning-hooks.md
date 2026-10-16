# Session learning closeout

Optional repository-local pilot; installation and trust must be checked in each checkout. Unit tests are not proof of runtime activation. This adapter never renders, starts retrospectives, approves proposals or changes preferences/skills.

## Automatic flow

SessionStart reminds the agent to read applicable style. PreToolUse/PostToolUse retain quiet local metadata receipts. UserPromptSubmit and Stop are no longer registered: finishing an ordinary reply does not request a closeout or trigger a repair turn. Older trusted registrations are also quiet if they still invoke those callbacks. Configuration changes may require the user to refresh/review hook registration; file edits alone do not prove runtime activation.

Closeout happens only when the user explicitly finishes the session. Read the current session's `state.json` to find its cycle, write `<cycle>.closeout.json` beside it using existing evidence or `no_learning`, then invoke `hook.py` with JSON on stdin containing the current `cwd`, `session_id`, `hook_event_name: "Stop"`, and `explicit_closeout: true`. This explicit validation returns status or an error and never requests an automatic continuation. Do not infer session completion from a normal pause or completed reply. No-learning and unresolved are valid outcomes.

## Agent closeout

Use the active session cycle path at explicit closeout. Honor any already-injected path for a turn that began before this configuration change. Do not create a competing record. For coding/admin/read-only tasks, or editing with no new lesson:

```json
{"disposition":"no_learning","summary":"Explain why there was no new editorial feedback to capture."}
```

For material feedback already recorded in the project, link the existing memory event, history snapshot or proposal. No need to copy the entire conversation:

```json
{
  "disposition":"evidence_linked",
  "summary":"Explain which feedback and resulting edit the existing records capture.",
  "evidence":[{"project_id":"actual-project-id","path":"projects/actual-project-id/memory/events/actual-file.json","sha256":"actual SHA-256 of the file bytes"}]
}
```

Use actual files and hashes. The hook verifies destination containment, JSON readability, file existence and byte hash. Every observed project must be represented for evidence_linked. It does **not** prove that a linked event captures the user correctly. The agent must read the evidence; never label an agent proposal summary as literal human speech merely because its approval event has actor=human.

For structured direction, reasons, response links and a read-only closeout check, use the MCP feedback tools in [editorial feedback](editorial-feedback.md). These supplement the hook; they do not establish runtime trust or exhaustive conversation coverage.

If the reason was never saved and the MCP tool is unavailable, use the legacy narrow capture bridge from the repository root:

`node --import tsx scripts/record-editing-feedback.ts`

Supply one JSON object on stdin: project_id, session_id, turn_id, summary, optional ordinal (default 0) and supersedes_event_id. Capture only the relevant correction, not source transcripts, private paths, credentials or the whole chat. The bridge writes an `editorial.feedback` event through the existing memory writer and returns the path/hash for closeout. It labels this **agent-recorded interpretation**, not a verified human quote. Replays return the same event; conflicting content requires a new ordinal and supersedes reference. A leftover `.capture-lock` is an explicit failed/interrupted capture: inspect the event and confirm no capture process is running before removing that exact lock. Do not delete evidence to retry.

If project identity or the original reason is missing, record the actual limitation:

```json
{"disposition":"unresolved","summary":"Explain the missing evidence or destination; no lesson was inferred."}
```

Never invoke an export, retrospective, preference promotion, or skill update merely to satisfy Stop. Follow existing authorizations and adoption policy. Hooks don't extend them.

## Desktop app chat

The in-app chat (Claude or Codex) runs with no hooks, no settings and no shell. Its only
tools are DreamCut's editing tools, and its instructions require `editing_feedback_record`,
linked proposals and a closing `editing_feedback_check`. So canonical feedback, proposals
and history are written to the project exactly as for coding agents. It produces no
closeout receipts and cannot run `hook.py`. To finish a desktop learning session, run the
closeout and reviews from a coding agent in this repository. Use
`pnpm learning:evidence <project-id>` to find the conversations, journals and transcripts.
Link the project's feedback events as `evidence_linked`, or record `unresolved` when a
conversation never recorded its direction.

## Local storage and limits

Private receipts live at `~/.codex/dreamcut-audit/<checkout-hash>/<session-hash>/`; an existing `~/.codex/openedit-audit/` folder keeps being used until a `dreamcut-audit` folder exists. Each callback persists its event, cycle, turn/tool IDs and tool name. Prompts, transcript files, tool arguments and results are not retained. Files use private permissions; one session lock serializes callbacks. Canonical feedback remains in `projects/<id>/memory/events/`. No cloud service, daemon, telemetry dependency or automatic deletion is added.

Only this checkout's sessions are covered. The existing retrospective worker's isolated configuration is unchanged. External TIMELINE_PROJECTS_DIR roots are not handled by this pilot's hook validator; record unresolved instead of inventing a local destination. Shell/browser/manual edits cannot be reliably bound automatically; the agent must declare their project evidence. Hosted/specialized tools may bypass callbacks. no_learning is a justified agent classification, not a semantic judgment made by the hook. This is a closeout guardrail, not exhaustive or tamper-proof enforcement.

## Activate and verify

The hooks are opt-in. Copy `scripts/session-learning/codex-hooks.example.json` to `.codex/hooks.json` (local and untracked), open Codex in this repository, run `/hooks`, review the three definitions and trust them. Do not fabricate trust hashes or use a bypass flag. Restart/reopen the task afterward. Changes to the script require review even if the registered command has not changed. No universal user-level hooks are installed.

Verify quiet receipts for SessionStart, PreToolUse and PostToolUse during a harmless diagnostic. Ordinary UserPromptSubmit/Stop callbacks must return no closeout guidance or repair request even under an older registration. Only an explicit closeout validation should set closed=true. Separately verify desktop/nested tool coverage before claiming it works. Do not run a real export as a hook smoke test.

Tests:

```sh
python3 -m unittest discover -s scripts/session-learning -p 'test_*.py' -v
node --import tsx --test src/lib/local-store/editing-feedback.test.ts src/lib/local-store/editing-retro.test.ts src/lib/local-store/editing-memory.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Runtime contract: [official Codex hooks](https://learn.chatgpt.com/docs/hooks). Design context and remaining proposals: [session learning architecture](../wiki/session-learning-hooks.md).
