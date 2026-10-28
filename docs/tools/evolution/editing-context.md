# Read editing context and manage explicit preferences — evolution

Capability: `editing-context`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Read editing context and manage explicit preferences. Reads and authorized profile/feedback writes; no timeline approval.

## 2026-10-08 — creator-selected Library media

- **Observation:** Browse image clicks placed media immediately, while Generate's
  Library picker hid shared catalog images. There was no agent-visible Browse selection.
- **Decision:** Reuse the saved workspace selection across Browse and Storyboard.
  Add `library_selection` to the existing timeline context rather than adding a tool.
  Read-only identities, labels, URLs and availability are discussion context;
  explicit reference selection preserves catalog bytes through managed ingestion.
- **Verification:** Selection tests cover concurrent toggles, durable state,
  invalid-source rejection, agent payload inclusion, hash-preserving reference
  ingestion, repeat-import reuse, and unchanged timeline/metadata. Existing
  Storyboard and generation tests retain their separate authority boundaries.
  Independent visible-UI review passed selection, reload, clearing and Start/End
  picker round trips without timeline placement or generation submission. A live
  `timeline_get` read returned the selected catalog identities with zero elements.
  UI, type and tool-registry gates passed; narrow image-card layout was inspected.
- **Limits:** Selection is neither approval nor evidence that a generated reference
  meets a creative brief. Image UI acceptance is scoped to the exercised workflows.

## 2026-09-30 — initial capability registration

- **Observation:** Repository script/catalog audit found this capability family. This
  is code/discovery evidence, not measured editing frequency or a new runtime trial.
- **Decision:** Register existing implementation; audit remaining authoring-contract gaps incrementally.
- **Version:** Initial registry record; existing tool/recipe versions are unchanged.
- **Verification:** Catalog membership and owner/evolution paths checked by `check:tools`.
  Runtime behavior was not re-certified by this inventory.
- **Acceptance for next change:** Preserve existing authority tests; migrate recovery and accounting contracts with representative success/failure cases.
- **Evidence:** [Script audit and priorities](../script-audit.md). Private session
  traces remain outside this public log.

## 2026-10-08 — one authoritative personal style document

- **Need:** Personal defaults and named presets shared a confusing surface, and editing
  the readable Markdown projection did not change runtime guidance.
- **Change:** STYLE.md owns active personal direction; existing memory/context tools
  identify its revision and derive their compatible scoped preference entries from
  its contents, without duplicating the full document in editing context.
  Presets gets a separate User tab. No new editing tool or model call is required.
- **Authority:** Explicit user-authorized migration preserves the old document,
  evidence, project exceptions and pending/retired records. UI saves are revision
  checked and app writers serialize; existing preference commands update only their
  changed blocks. Named presets remain opt-in and never alter the timeline.
- **Acceptance:** Migration, external edits, scoping, stale saves, settings-only writes,
  preference deltas and restoration are covered by focused tests. UI checks are
  recorded separately; this does not establish improved model editing quality.

## 2026-10-08 — opt-in automatic personal preference adoption

User → Settings exposes automatic application of all future validated personal
findings, including inferred/conflicting choices. This profile option leaves old
suggestions pending, preserves evidence and scope, and does not change skill
approval or learning opt-outs. Context states that later same-scope style entries
take precedence. A regression covers future adoption, pending preservation, retained
counterevidence and format scoping; the ordinary review policy remains tested.

### 2026-10-09 — revision accompanies timeline context

A desktop tool-only Codex trial needed multiple rejected preflights while assembling
a proposal, including an invalid expected_revision: timeline_get had no revision
field. The timeline GET owner now returns SHA-256 revision alongside its payload,
derived from the same raw byte read as the normalized timeline. Read normalization
still performs no writeback. A focused test verifies exact source-byte identity,
whitespace-sensitive revisions and source preservation. This additive context field
needs packaged rebuild and matched model qualification before claiming fewer calls.

## 2026-10-12 — the project open in the editor

- **Observation:** A template's copied request ("Use the Word Search Trace template with my
  footage.") names no project. The creator: "shouldn't the agent already know" which project.
  Coding agents had no way to see what the editor shows.
- **Decision:** Each editor window reports the project page it shows (editor, storyboard,
  library and other `/p/<id>` routes) on navigation, focus, leaving the page and a 5-minute
  heartbeat while visible, into `open-project.json` in the profile. The last viewed project is
  kept when no project is open. `editor_context_get` (read-only, core tool) returns it with
  its age and status: `current` within 30 minutes, `ambiguous` when another recent window
  shows a different project, `stale` or `none` otherwise; agents ask unless `current`. A
  named project always wins. The in-editor agent is excluded: its session is bound to one
  project.
- **Verification:** Storage tests cover route parsing, freshness, ambiguity, leaving and
  closing windows, and rejection of unknown projects; an MCP test covers the read-only route,
  editing-profile exposure and argument rejection. Live: opening a project at `/p/<project_id>` made the
  tool return that project.
- **Limits:** "Viewed" means the page was shown, not that the creator meant it; a visible
  second monitor keeps a project current. No feature-eval case measures fewer clarifying turns.

### 2026-10-13: the creator's selection travels with the open project

Working in the browser beside a coding agent, the creator selects things (a clip, a Library image,
a caption look, a sound, a layout) and then tells the agent what to do with them. Without the
desktop chat dock those selections stayed inside each panel, so the agent could not see them.
Selections now live in one project-wide list, saved to `workspace-selection.json` `items`
(kind, label, the text the agent reads). `editor_context_get` returns them as `selection` for the
open project and `timeline_get` includes them in `library_selection`; the editor lists them in a
Selected control beside Marks. Verified in the editor: selecting a music track and a caption look
across tabs showed both in Selected and in `editor_context_get`.


### 2026-10-17: templates are selected, not copied

Templates were the one surface that still asked the creator to copy a request and paste it into
chat; clips, Library media, looks, layouts and sounds were already selected and read by the agent.
The creator called the copy step an anti-pattern: select it, then talk. Template cards (Properties
→ Templates, the Library's Templates tab, Guide → Templates) now select on click into the same
project-wide `items` list (group `templates`, kind `Template`, label = title, id
`template:<recipe id or title slug>`, the same id `capability_catalog get` resolves). The
`agent_text` names that lookup. Details opens a card; its Select button is the same toggle. The
Copy request control (`EffectAgentRequest`) is removed. `editor_context_get` and `timeline_get`
descriptions name Template items. A request naming a template by title still resolves through
`capability_catalog` (`gallery_request`). No new tool or field: the existing selection contract
carries it.

2026-10-13 — `editor_context_get` answers "is this project in front of the creator right now?"
(creator direction: agents end a turn by opening the project they refer to when it is not
already showing). Optional `project_id` adds `project_shown {project_id, showing,
last_seen_seconds}`; `showing` needs a visible editor window on that project that reported
within 6 minutes (the 5-minute heartbeat plus slack). Editor windows now report `visible:
false` when hidden, and report again at once when shown, so a just-hidden window no longer
counts as showing while it still counts as recently viewed for picking the project. The MCP
instructions tell agents to call it before ending a turn that refers to a project, open the
project in their built-in browser when it is not showing, and end with its link. Verified by
unit tests (open-project, editor-context MCP route test) and a live probe: the project open in
the Browser pane reported showing true, another project false.

## 2026-10-23 — restricted ChatGPT desktop trial

Existing owners: the local MCP dispatcher, launcher and proposal safe-write layer.
A process-level --local-media-only switch restricts both discovery and dispatch;
family loading cannot expand it. Results are reconstructed from audited fields,
not recursively scrubbed. Arbitrary errors, media and resource responses stay out
of the transcript. Only numeric patches are accepted for proposal operations.
Private setup uses separate app data, profile and projects, with cloud ingestion off.
The host's unrelated filesystem/browser tools are outside this boundary. No claim
of complete host isolation or visual understanding is made. Acceptance is covered
by local-media-policy tests, including actual JSON-RPC dispatch to a mock editor.
ChatGPT desktop installation and human approval remain interactive acceptance steps.

## 2026-10-23 — explicit upgrade to normal local capabilities

The private installer now supports an explicit `--full-access` upgrade after the
creator requests transcription and ordinary editing. It reuses shipping entry
skills and the normal MCP dispatcher, preserves project/profile roots and backs up
the old package. The restricted default and human approval boundary are unchanged.
The installer test covers upgrade, project preservation, skill selection and
return to restricted mode. Installation is distinct from a running chat's tool
refresh; reconnect and real transcription remain separate acceptance checks.

## 2026-10-27 — The closeout check fits in a tool result

- **Observation:** In one session all six `editing_feedback_check` calls returned 77,000 to 90,000 characters (63 directions with every linked proposal summary and history change) and overflowed the agent's tool result, so each closeout needed a second shell call to parse the saved file.
- **Decision:** The `/memory/feedback` GET (used only by this tool) returns `feedbackCheck`: `unaccounted_feedback_ids`, the unaccounted directions in full, and the accounted ones one line each with proposal ids and states, a count of history changes and any disposition, newest first. Memory, the Proposals queue and export evidence keep the full `feedbackCoverage`.
- **Verification:** `src/lib/local-store/editing-feedback.test.ts`; on a copy of the session's project the result drops from 93,300 to 24,830 characters.
- **Limits:** It still grows with the project's history; a per-session filter would be a new input.

## 2026-10-28 — A brief started from Home reaches the agent

- **Observation:** Home's Start project kept the creator's message only in the browser tab and dropped it into the in-app chat composer, which the browser editor never shows. Creators working in Claude Code or Codex landed on an empty editor; their direction and media reached no agent.
- **Decision:** Start project (`POST /api/projects/start`) creates an assembly workspace whose objective is the creator's words and records them as `user_words` feedback, so the brief shows under Up next with its Library media. Draft on that row asks for the first cut (`firstBuildPrompt`) while the grant is live and the timeline empty. `editor_context_get` returns `first_build {project_id, brief, feedback_id, media, guidance}` for that project, so "go" in Claude Code or Codex is enough.
- **Verification:** `src/lib/local-store/home-start.test.ts`; on a disposable editor, three dropped files and a brief created a 16:9 project, imported all three, opened on Proposals with the brief and files under Up next, and Draft returned the first-build request.
- **Limits:** The brief is capped at 2,000 characters (the feedback ledger's verbatim limit). The desktop app's own chat still sits beside the Storyboard only, so its agent gets the brief as a ready-to-send draft there, not on landing.
