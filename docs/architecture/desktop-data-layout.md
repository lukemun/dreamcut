# Desktop data layout, activity journal and product signals

Status: decided 2026-10-10. Classifies every file the desktop app writes and names what is
collected for learning reviews. The purpose of collection is to see what an agent proposed,
did and reasoned, and what the creator then did to the timeline, so reviews can improve the
harness (skills, tool contracts, catalog, dials) where a model does badly or wastes effort.
This is not a model-training corpus. The journal's target design is
[agent activity](agent-activity.md); storage limits follow the
[storage lifecycle contract](../standards/storage-lifecycle.md); session capture for
repository development follows [observability](../observability.md).

## One root, six data classes

The desktop app keeps everything under the OS application-data folder for `DreamCut`
(macOS `~/Library/Application Support/DreamCut`; launch is macOS-only, Windows and Linux
follow later), outside the replaceable app bundle. A creator may point the workspace
(projects and libraries) elsewhere with `DREAMCUT_WORKSPACE_ROOT`; the profile follows
`DREAMCUT_PROFILE_DIR` (`profileDir()` in `src/lib/local-store/profile-dir.ts`, re-exported by `editing-memory.ts`) and on
macOS sits in the same root at `DreamCut/profiles/default`.

| Class | Location | Contents | Uploaded |
| --- | --- | --- | --- |
| Creator content | `projects/`, `catalogs/sfx/`, `catalogs/music/`, `catalogs/images/`, `catalogs/visual/` (`desktop/data-paths.mjs`) | Timelines, source media, proposals with `control_gaps`, feedback, history (every timeline write with its human/agent actor), renders | Only when the creator exports or shares it; a learning session needs a project's `proposals/`, `history/` and `memory/` alongside the journal |
| Personal profile | `profiles/default/`: `STYLE.md`, `preferences.json`, `personal-styles/`, `style-history/`, `style-conflicts/`, `cloud-sync/`, `private-credentials/`, `preview-settings.json`, `workspace-tabs.json`, `open-project.json` (the project each editor window shows, for `editor_context_get`), `library/` (the creator's personal images, visuals, music and sound effects, merged into every project's Library), `private-terms.txt` (creator terms for `pnpm check:catalog-privacy`) | Taste, settings, personal media, the DreamCut session (0600) and its sync state | Only when signed in to DreamCut: `STYLE.md`, `preferences.json` and active saved templates sync with the account ([hosted style](cloud-style-and-learning.md)). Credentials never leave the computer |
| Agent session state | `agent-transcripts/`, `<provider>-sessions/`, `<provider>-editing-journals/`, `<provider>-conversation-archives/`, `<provider>-conversation-resets/`, `claude-workspaces/`, `last-project.json` | What resumes a conversation and reconciles tool calls | No; the activity journal carries the same content in reviewable order |
| Local diagnostics | `profiles/default/`: `agent-activity/`, `otel/`, `worker-usage/`, `tool-events/`, `proposal-work/` | Debugging evidence for repository development sessions | No |
| **Activity journal** | `profiles/default/activity-journal/`: `episodes/`, `outcomes/`, `snapshots/`, `media/` | Complete agent episodes and creator decisions on them | **Yes (opt-out)** |
| **Product signals** | `profiles/default/product-signals/` | Fixed-schema capability-gap records | **Yes (opt-out)** |

Browser runtime caches (`Cache/`, `GPUPersistentCache/`, `Local Storage/` and similar)
belong to Electron and are never read as product data.

## Activity journal

One episode is one creator request and the agent's whole turn, recorded by the desktop chat
controller through `desktop/activity-journal.mjs` and stored by the editor
(`src/lib/observability/activity-journal.ts`, `POST /api/agent/activity-journal`). It is the
runtime and tool boundary capture that [agent activity](agent-activity.md) specifies; an
episode is that design's run, and `snapshots/` and `media/` are its hashed blobs.

| Record | Contents |
| --- | --- |
| `episode_start` | Project, provider, `agent` (`gpt`, `claude`, `local`), requested model |
| `snapshot` | The instructions and tool schemas the model was given, stored once in `snapshots/<sha256>.json` |
| `user` | What the creator typed (`display`) and the full text sent, including replayed conversation and page context; attachments |
| `reasoning`, `assistant_text` | The reasoning summaries and reply text the agent streamed to the chat, merged into whole messages between tool calls (never hidden reasoning the runtime does not expose) |
| `model` | The model that actually answered |
| `tool_call`, `tool_result` | Every call's full arguments and raw result, including rejected calls, for all three agents (`onToolRecord` in `desktop/codex-tool-bridge.mjs`) |
| `episode_end` | Status, the proposals the turn staged (`proposal_ids`), final reply, records lost on the way |

Images returned to the model are stored once in `media/<sha256>.<ext>` and referenced in
place, so a review sees what the model saw. Source media is not copied; tool results carry
its identity.

What the creator did with the work joins by proposal id and project:

- `outcomes/YYYY-MM-DD.jsonl`: each saved dial tuning (`tuned`), approval with final dial
  values, rejection with the creator's reason, and supersession, written by
  `resolveProposal` and `saveProposalTuning`.
- The project's `history/`: every timeline write with `actor` (human, agent, system),
  operation, label and full snapshot, so a manual correction after an agent's proposal is
  visible as the creator's own edit.
- The project's `memory/events/`: editorial feedback in the creator's words.

`pnpm learning:evidence <project-id>` indexes a project's episodes with these records for
the [learning-review](../../.agents/skills/learning-review/SKILL.md) tracks, and
`pnpm episode <id>` prints one episode as a timeline: request, reasoning, each call and
result, the proposals staged, the creator's decisions, and the creator's own later edits to
the clips those proposals touched (from the project's history). `pnpm episode` alone lists
recent episodes; `--journal DIR` reads a folder copied from another machine.

Feature-eval runs (`pnpm eval:features`) are recorded the same way, under project
`feature-case` with the case, request and pass on the episode, so a failed or slow run is
reviewed exactly like a creator's turn; `--journal DIR` keeps them apart from the profile's
journal and `--no-journal` skips recording.

Only credentials are removed; the home folder is written as `~`. Retention: 4 GB of
episodes, oldest first; media is shared by hash and kept with its episodes. Not yet
recorded: assembly and audition runs outside the desktop chat.

## Product signals

Fixed-schema records that answer one product question each, read by `pnpm product-signals`.

| Event | Question it answers |
| --- | --- |
| `catalog_search` | What do agents look for, and when do we not have it (`miss`)? |
| `arguments_rejected` | Which fields do agents invent or leave out, and at which layer? |
| `proposal_staged` | Which changes ship without a creator dial (`control_gaps`)? |

`pnpm control-gaps [--projects DIR]` reads the per-proposal gap record from any projects
folder, including one copied from another machine.

## Upload policy

Decided 2026-10-10: sharing is on by default with a setting to turn it off (opt-out). Data
is always recorded locally; only `activity-journal/` and `product-signals/` are uploaded,
for learning sessions that improve the harness. An uploader sends completed episodes and
completed outcome and signal days, records its cursor in `upload-state.json` in each
folder, and never edits a recorded file. Turning sharing off stops uploads immediately and
does not delete local files.

Not yet implemented: the upload endpoint, the uploader and the settings control. Until they
exist nothing leaves the machine. The settings control must say plainly what is shared
(requests, the agent's work, decisions on proposals, the frames the agent looked at) and let
the creator open the folder.

## Follow-up

The provider-prefixed session folders would read better as
`agents/<provider>/{sessions,journals,archives,resets}`. Journals pin their path for
replay safety, so that move needs a migration with tests, not a rename.
