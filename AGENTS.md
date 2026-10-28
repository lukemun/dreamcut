# DreamCut — agent operating guide

`AGENTS.md` is canonical. `CLAUDE.md` is a symlink to it; edit this file only.

DreamCut is a local, file-backed video editor. Each project is a folder;
`timeline.json` is its editing source of truth. Agents prepare edits, people review
and approve them, and the editor applies approved changes through its safe-write
layer. Preview and export use the owned frame runtime; exports use Chrome and FFmpeg.

## Start with the task

Identify the requested outcome, what must remain fixed, and the evidence needed to
call the work complete. Use current user direction over applicable style defaults.
Ask only when missing information would materially change the result; otherwise
state a bounded assumption and proceed within the authorized scope.

Take the preferred path first. Each skill names its preferred tools, templates and
presets; use them before anything you make up. Before authoring a style, look, treatment,
layout or payload, find what DreamCut already has: the skill's named route,
`capability_catalog` (tools, recipes, skills), Templates, the owning registry's presets
(caption looks, entrance presets, colour looks) and the tool that compiles that operation
(for captions, `caption_proposal_compile`). Use the closest match as it ships and tune it
through its dials. Hand-built payloads, new presets and new features come only when that
path cannot do the job: name what is missing and ask the creator before building it.

Decide first whether the request changes how DreamCut works (code, UI, contracts, skills)
or edits a project. A product change ends at verified code, checked on a disposable copy;
do not draft cards, edit project files or record editorial feedback to demonstrate or
migrate it unless asked. If it leaves project material stale, say so and offer a card.
When an editing request names no project, call `editor_context_get` and use the
project open in the editor if its status is `current` (viewed in the last 30 minutes,
no other window showing another project); otherwise ask which project.

Keep the editor in front of the creator while discussing a project. Once the project
is known, check that the editor answers at http://127.0.0.1:3123; if it does not,
start it (`pnpm editor`, through your preview/launch tool when you have one). Then open
`http://127.0.0.1:3123/p/<project_id>` in your built-in browser when you have one, make
sure that browser is visible to the creator (a hidden pane shows them nothing; in the Claude
desktop app, call `show_pane` for the Browser pane), and navigate there again when the project
changes or new proposals are ready to review. Do this first, before you talk about the project;
`editor_context_get`'s `project_shown` counts your own hidden tab, so it is not proof the creator
sees it. In Claude Code a Stop hook (`scripts/hooks/editor-shown-gate.mjs`) holds back a reply
that links a project when the editor was not shown that turn.
Opening a browser pane does not show the creator where the project is: every reply
that mentions a project, its proposals or anything to review in the editor links it
as a clickable `[<project title>](http://127.0.0.1:3123/p/<project_id>)`. Opening the
editor is viewing only; it never approves anything.

Read the relevant skill before using it. Load linked detail when the task needs it,
not every skill and standard at startup. Canonical skills live in `.agents/skills/`;
shared contracts live in `docs/standards/`.

| Task | Required starting point |
| --- | --- |
| Edit an existing timeline, including an exact dictate | [dreamcut-proposals](.agents/skills/dreamcut-proposals/SKILL.md) |
| Several requested changes at once (the default routine) | [working-through-requests](.agents/skills/working-through-requests/SKILL.md): one to three cards per pass |
| Interpret several requests, marks or dependent edits | [editorial-intent-planning](.agents/skills/editorial-intent-planning/SKILL.md) before proposing |
| Build a new edit | [editorial-assembly](.agents/skills/editorial-assembly/SKILL.md) |
| Edit a supplied screen recording, with or without a presenter take, into a tutorial or walkthrough | [product-walkthrough](.agents/skills/product-walkthrough/SKILL.md), with editorial-assembly for a new build |
| Storyboard or break up supplied footage into beats | [storyboard-drafting](.agents/skills/storyboard-drafting/SKILL.md) |
| Recreate a reference video with other people (recast) | [video-recast](.agents/skills/video-recast/SKILL.md) |
| Correct or restyle a clip's colour | [color-grading](.agents/skills/color-grading/SKILL.md), with dreamcut-proposals |
| Compare alternatives for one creative decision | [timeline-auditions](.agents/skills/timeline-auditions/SKILL.md) |
| Import supplied files/folders, or choose analysis and sampling for existing footage | [media-intake](.agents/skills/media-intake/SKILL.md) |
| Change media import, probing, preparation, decoding, colour handling or export | [source-format coverage](docs/standards/source-format-coverage.md), then [device-format-coverage](.agents/skills/device-format-coverage/SKILL.md) |
| Recreate an effect from a reference | [recreate-effect](.agents/skills/recreate-effect/SKILL.md), then its craft skill |
| Generate project images or video | [generated-asset-workflow](.agents/skills/generated-asset-workflow/SKILL.md) |
| Select or join spoken takes | [talking-video-editing](.agents/skills/talking-video-editing/SKILL.md) |
| Add, change, restyle or reorganize editor UI | [editor-ui-design](.agents/skills/editor-ui-design/SKILL.md) |
| Change preview/render integration | [dreamcut-rendering](.agents/skills/dreamcut-rendering/SKILL.md) and [renderer contract](docs/standards/renderer-contract.md) |
| Review code or a PR | [code-review](.agents/skills/code-review/SKILL.md) or [pr-review](.agents/skills/pr-review/SKILL.md), respectively |
| Retro an agent session ("retro this") | [session-retro](.agents/skills/session-retro/SKILL.md) |
| Write shared instructions | [prompt-authoring](.agents/skills/prompt-authoring/SKILL.md); use [skill-authoring](.agents/skills/skill-authoring/SKILL.md) for skills |
| Record published research | [research-deliverable](.agents/skills/research-deliverable/SKILL.md) |
| Update the public repository (checks, code review, secret scan); check a new user's install | [releasing](.agents/skills/releasing/SKILL.md) (pushing only when the owner says to) |
| Deliver an explicitly requested export | [platform-video-delivery](.agents/skills/platform-video-delivery/SKILL.md) |

For editor UI changes, including small styling fixes, read
[editor-ui-design](.agents/skills/editor-ui-design/SKILL.md) and the
[shared component map](docs/standards/editor-controls.md) before implementation.
Reuse the section, item-header, disclosure and input owners named there; improve
those owners when needed rather than adding local substitutes. Run
`pnpm check:editor-ui` and `pnpm typecheck`, then verify the affected UI visually.
The UI skill defines when an independent visual-only acceptance check is required.

For coding, read the [architecture overview](docs/architecture/README.md) and the
relevant subsystem. Use the [standards index](docs/standards/README.md) and
[skill index](.agents/skills/README.md) for discovery. The
[knowledge architecture](docs/agent-knowledge-architecture.md) defines where rules,
procedures, personal preferences and evidence belong.

Every code review includes the [public-content review](docs/standards/pr-review.md#public-content-review),
including native commit/push reviews. Check new documentation, skill references and
assets for internal or private material; passing tests and secret scans is insufficient.

## Proposing an edit instead of making one

- Existing working-timeline edits use `proposal_create`, including exact user
  dictates. Never substitute direct HTTP writes, file edits or mutation scripts.
  Call the MCP tools themselves against the editor on 3123, not a script that starts its
  own MCP client: script output hides refusals, and a dev server's code drifts from the
  editor the creator uses.
  If the contract cannot express the edit, extend it (schema, GPU renderer support,
  then regenerate `mcp/proposal-schema.json`; the running MCP server adopts it without
  a restart; `pnpm editor:status` says when the editor serves the new code) and propose.
  The edit need not wait for its dial; see below.
- Net-new work uses `assembly_create`; source/take comparisons use `audition_create`.
  Both create a separate project without overwriting the working cut. Their bounded
  `agent_workspace` grant ends permanently at the first layout handoff or human edit, whichever comes first. It never permits
  agent approval, rejection or history restoration.
- Before presenting the first assembled layout (including an audition), call
  `assembly_handoff`. Handoff permanently closes direct editing authority. All
  feedback corrections and further layers use proposals, even without a human edit.
- An edit offers one result per independently reviewable beat by default. An audition
  compares alternatives to the same question. Music/SFX alternatives on a working
  cut use proposal options while preserving picture and speech timing.
- Edit incrementally. Never send one large card for a big edit, and never queue cards for
  the whole video at once: work in passes of one to three small cards (a few sections, a
  few cuts), let the creator settle them, then draft the next pass from where they are.
  Clean the source (cuts, pacing) before captions, and captions before visuals. When the
  direction is open to interpretation, send one card first and ask before drafting the rest.
- Every pending card applies on its own, in any order, whatever the creator does with
  the others; `proposal_create` refuses a card that overlaps or depends on another.
  Keep dependent changes atomic in one card. Revisions name the drafts they supersede
  rather than overwriting audit records. Preserve accepted choices during corrections.
- Read the current revision. Preview and approval must derive the same result. A card
  re-validates onto newer revisions; one that would replace a setting the creator has
  since changed says so on the card, and only the human's Apply replaces it. Approval and Undo/Redo
  must preserve timeline, metadata and affected proposal review states together.
- The human approves or rejects in the editor. Recommendation, preview, selection
  and tuning are not approval. Never self-approve to test a proposal.

Use [proposal presentation](docs/standards/proposal-presentation.md) for the review
experience. Before working with operation payloads, proposal persistence, source
windows or recovery, read the relevant [implementation contracts](docs/architecture/editing-implementation-reference.md).
The MCP entry point is `mcp/server.mjs`; its catalog describes available tools.
Do not write dated one-off timeline mutation scripts; reusable preparation tooling
must stop before timeline mutation and return artifacts a proposal can reference.

## Agent tools and harness development

Before exposing scripts or changing tools, read the [tool-authoring standard](docs/standards/tool-authoring.md).
Register the owning capability and update its evolution record under `docs/tools/`;
run `pnpm check:tools` and the affected runtime tests. Prefer reusable editing outcomes
over one tool per script. New model runners and eval harnesses also follow the
[agent/harness standard](docs/standards/agent-harness-authoring.md).

Coding agents and the in-editor agent share one editing surface: the MCP server. Set each
capability's `editor_agent` access in the registry; never hand-edit session or allowlist
tool lists. Editing skills name the MCP tool for any shell or file step, or record the gap.
`pnpm check:agent-parity` enforces this; see [agent surface parity](docs/standards/agent-surface-parity.md).

## Effect and parameter development

Before adding or extending an effect, composition builder or agent-editable parameter,
read the [editable parameter contract](docs/standards/editable-parameter-contract.md).
Declare meaningful controls in the owning registry and bind compound dependencies
through deterministic adapters. Build the dial with the field when you can. When the
dial would hold back a working capability, list the field in `PENDING_CONTROL_PARAMETERS`
with why: it ships as a recorded control gap (previewable, approvable, undoable, not yet
tunable), and the entry is removed once the dial exists. Run `pnpm check:parameter-contract`;
never put new fields on the legacy gap list. Preserve the 15-slider first-class limit and atomic dependencies; keep remaining supported dials reachable in Advanced adjustments.

Make nearly everything tunable underneath, including timing relationships between linked
pieces; the agent chooses which dials lead, not what is tunable. Visible motion (a flip,
spin, overshoot or rise) always has a dial with an off position and defaults to off unless
asked for. Build a new capability as a general block any element can use (a camera, a
timing anchor), named generically, never tied to the effect that prompted it. Pieces split
from one motion graphic are independent elements with no sync link; a change across them
is one proposal touching each piece.

## First-proposal tuning and unaided editing

The first proposal should give the creator the working controls and useful ranges
needed to reach their intended result. Map explicit requests and likely adjacent
adjustments to meaningful actor or group controls. Favor more relevant dials over
an artificially minimal set; preserve unrelated and explicitly locked choices.

Craft skills define meaningful parameters. The proposal skill selects controls from
the actual supported inventory. Main controls come first; all remaining supported dials belong
in Advanced adjustments. Follow the [coverage contract and current UI](docs/standards/inspector-information-architecture.md#first-proposal-control-coverage),
not invented schema fields. A missing control is a capability gap, not a decorative
slider or a reason to flatten the effect. Preview, reset and approval must agree.

A human must be able to understand, tune and undo the result without AI or source
code. UI changes require the [feature integration standard](docs/standards/editor-feature-integration.md),
shared controls, self-explanatory labels (no help icons or explanatory text), and its fresh-eyes acceptance
check. Run `pnpm check:editor-ui` and verify affected interactions in the actual UI;
static checks alone do not establish usability. Report any unverified browser check.

## Capture editorial direction

Before responding to material direction on an existing edit, use
`editing_feedback_record`. Preserve user wording, agent paraphrase and inferred
reasoning as distinct evidence; never invent a reason. Link work with
`responds_to_feedback_ids`. Corrections append `supersedes_event_id` records.
At editorial turn closeout, call `editing_feedback_check` and account for directions
with linked work or `editing_feedback_disposition` and a reason. An ask queued for a later
pass stays open so it shows under Up next; report it as queued. For net-new work,
create its bounded project first, then record direction before placing media.
Do not create a project for coding/admin conversation. See [feedback capture](docs/standards/editorial-feedback.md).

## Read personal style before editorial work

Read active, applicable preferences before planning an assembly or proposal:
`timeline_get` supplies `editing_context.preferences`; `editing_memory_get` supplies
the same scoped context. Refresh on resumption. For net-new work, read the local
profile before choosing a treatment, then refresh with `editing_memory_get` after
`assembly_create` and before placing media.

Personal defaults live in the authoritative `STYLE.md` under `profileDir()` in
[editing-memory.ts](src/lib/local-store/editing-memory.ts), honoring
`DREAMCUT_PROFILE_DIR` (legacy `OPENEDIT_PROFILE_DIR` is still read). Use that
resolver for migration/fallback behavior. Runtime preferences derive from this document; `preferences.json` retains settings, evidence,
project exceptions and retired records. Never regenerate STYLE.md from that
sidecar. Named reusable treatments live as user-only effect recipes in Properties → Templates. Current user direction wins over project preferences, which
win over broader applicable preferences. Style never overrides approval or source
preservation. Report unreadable preferences and material exceptions. Universal
requirements belong in shared rules, not My Style.

## Storage-producing changes

For imports, proxies, frame extraction, caches, model downloads or export scratch, follow the [storage lifecycle contract](docs/standards/storage-lifecycle.md). Declare ownership, preserve originals and render authority, bound temporary bytes, and check destination-volume headroom. The [storage management plan](docs/architecture/storage-management.md) distinguishes implemented subsystem limits from pending global enforcement. Never treat an arbitrary frame folder as disposable based only on its name.

## Media ingestion

Use `media_import` with `managed_copy` by default: preserve unchanged bytes, verify
hashes and retain provenance. Use `external_reference` only when explicitly asked
to keep another library as the source of truth. Import does not authorize timeline
placement, generation, export or publication. Report per-file readiness and gaps.

Preserve originals and real source handles. Ordinary trims remain timeline edits,
not newly baked files. Video preparation must satisfy the [preview proxy contract](docs/standards/preview-proxy-contract.md)
before placement, with timing parity and the declared render authority. Moving masks
must follow the actual source clock. Read [media preparation details](docs/architecture/editing-implementation-reference.md#media-preparation-details)
when changing ingestion, cutouts, proxy generation or playback readiness.

Tracked catalogs (`catalogs/images/`, `catalogs/visual/`, `catalogs/music/`, `catalogs/sfx/`)
hold only generic, redistributable defaults. Anything depicting or naming the creator, their
people, pets, clients or brands, media from their projects, and assets cleared only for them
belongs in the profile library (`<profileDir()>/library/<kind>/`), which every project's
Library lists as Your media; move entries with `pnpm personal-library-move`.
`pnpm check:catalog-privacy` (pre-commit and `check:pr`) enforces this, using creator terms
in the profile's `private-terms.txt`, which is never committed. One owner-approved exception:
shipped Template demos use the owner's bobblehead character ([project status](docs/project-status.md), 2026-10-26).

Treat audio the creator supplies for their own project as cleared for use in that project.
Record that provenance and preserve any more specific terms; this is neither an
ownership claim nor permission to redistribute it publicly.

## Visible generation drafts

Always use `generate_media` for any image, video, music or voiceover generation. A request for
media ("make an image of…", "animate this photo") is a request to draft it, not
approval to generate. A request made with a Look or Template selected, or one to draw or
build the thing, is not a generation request: read `editor_context_get`'s selection first and
build it in that look or template through its skill. The draft uses the best-quality model and its recommended
settings unless the user names one, fills the Generate form (docked in Library, a
drawer in the editor; open its `review_url`) and returns the price in credits and that
model's prompt guide. Then stop for review. Generate only when the creator clicks
Generate or approves that model and price in chat: call `generate_media` again with
their exact words. Never infer approval. Without a project it generates into the
Generations project. DreamCut does not route generation through an agent's own image
tool (such as Codex's); that is outside DreamCut, done only when the user tells that agent
directly.

Use `asset_generation_prepare` only for fields `generate_media` does not set, or to
revise a draft already in the form; it follows the same review rule, with
`asset_generation_submit` for chat approval. Drafting and staging never upload, create
a provider job or charge. Generation runs through the creator's DreamCut account and
purchased credits; there is no API-key route. Preserve the selected model on revisions
unless the user asks to change it.

## Talking-head take-selection gate

Inter-take spoken cuts require word-level MFA alignment against the reviewed
transcript. Whisper/WhisperX may locate candidates but do not authorize boundaries.
If MFA cannot run, create an audition with uncut candidates on separate lanes and
report the blocker; do not silently downgrade alignment. Preserve source handles
and record each boundary's words, take ownership, source bounds and timeline bounds.
Human selection remains separate from applied assembly. Read the detailed
[take-selection and audition contract](docs/architecture/editing-implementation-reference.md#talking-head-take-selection-gate)
when preparing these comparisons.

Check both word integrity and cadence at every join; after a join changes or fails,
recheck all joins in the assembly. Do not manufacture breath by freezing the outgoing
picture. Speech-bound pictures and captions follow the master speech clock through
the supported sync/binding contracts; never retime them independently.

## Verify efficiently and report evidence

Before judging an edit's appearance, run `pnpm frame-state <id>` and read the report.
For the same review question, hash-proven unchanged frames can reuse prior inspection;
a new question requires all relevant frames regardless of novelty. Build contact
sheets from `frame-state.json`, never filename globs. A still cannot prove motion or
sound. The [delivery skill](.agents/skills/platform-video-delivery/SKILL.md) owns the full discipline.

Use semantic spatial authoring and measured evidence under the [spatial standard](docs/standards/spatial-authoring.md).
Read coverage and limitations; sampled boxes do not prove continuous silhouette
clearance. Intentional overlap is allowed. Changes to shared geometry require the
production-wrapper conformance check; never add detector/LLM calls to playback.

Run checks appropriate to changed behavior and mandatory contracts. Reuse valid
evidence only when its inputs, dependencies and review question remain applicable.
Avoid repeating discovery or broad checks without a change, failure or unresolved
risk that justifies them. Measure speed improvements and retain regression protection;
optimizing time to a reviewable proposal must preserve correctness and quality.

Report what changed, checks performed and remaining limits. Distinguish implemented,
verified and proposed capabilities. Passing typechecks does not prove visual quality,
playback or usefulness of the selected dials. For PR readiness, follow the PR skill,
including native review and `pnpm check:pr`; never auto-approve or merge.

## Rendering

Browser GPU (CanvasKit) is the default renderer. Anything new you add (effect, style,
animation, preset or element prop) must pass GPU admission before it is offered;
Standard-only support is incomplete. See the [GPU-first feature rule](docs/architecture/playback-rendering.md#gpu-first-feature-rule--decided-2026-10-09).

Export only on an explicit request. Ordinary assembly ends at a reviewable timeline.
Renderer engineering uses the contract's verification fixtures; that is not permission
to export a user's project. Use the [renderer contract](docs/standards/renderer-contract.md)
and [playback architecture](docs/architecture/playback-rendering.md), not historical
Remotion package assumptions. The `src/lib/remotion/` directory name is retained.

After human approval of a render, retain the approved MP4 and remove older project
render MP4s, recording removals in `renders/AUDIT.md`. Never clean them up without
that approval event.

The editor does not learn style on its own. My Style changes only when the creator
edits it or accepts a suggestion synced from their DreamCut account; never add
preferences, start a style retrospective or rewrite skills to record what an edit taught you.
A session retro the owner asks for ([session-retro](.agents/skills/session-retro/SKILL.md)) is different: it reviews how agents worked and fixes what it finds.

## Run it

Run commands from this repository, not its parent. Common entry points:

```bash
pnpm install                 # first-time dependencies
pnpm editor                  # project work: stable build on http://127.0.0.1:3123
pnpm dev                     # code work: hot-reloading editor on http://127.0.0.1:3129
pnpm review <id>             # stable review: port 3124, leaves the other servers alone
pnpm qa                      # QA: fresh clone of pushed main, installed and opened as a new user gets it
pnpm project-health <id>     # read-only project report
pnpm typecheck
pnpm test
pnpm frame-state <id>        # appearance evidence
pnpm render <id>             # only for an explicitly requested project export
```

Verify code changes on `pnpm dev` (3129). The editor on 3123, which the MCP tools and the
creator use, rebuilds by itself in the background once editor code stops changing and switches
over without dropping requests, usually within five minutes. Before work that depends on
changed editor code (an API route, the proposal contract, the renderer), run
`pnpm editor:status`; it exits 0 once 3123 serves the current code. Time performance on the
stable build, never on `pnpm dev`. See `package.json` and the task's standard for
specialized checks. Projects contain
`timeline.json`, `metadata.json`, source provenance, media, history and renders;
`projects/` is Git-ignored and `TIMELINE_PROJECTS_DIR` may relocate it. Workspace
layout is a view preference separate from output aspect ratio: it follows the video
shape by default, and flipping it never changes the output. Keep private media,
local receipts and generated build output out of commits. See [development workflow](docs/development-workflow.md)
and [contributing](CONTRIBUTING.md) for repository operations.

## Owner working agreements

This private repository has one developer, the owner. Unless the owner says otherwise in
the conversation:

- Leave code changes uncommitted until asked; still run the checks for each change.
- Work in the main checkout on `main`. Create no worktrees or branches unless asked; when
  asked to commit finished work, commit to `main` and push `origin/main` (no PR needed).
- Verify locally. Do not iterate by pushing and watching CI, and ask before changing CI
  workflows or timeouts.
- Never wait on the stable editor's rebuild. When project work needs changed editor code
  and `pnpm editor:status` says 3123 is behind, use `pnpm dev` (3129) for that step until
  3123 catches up (owner, 2026-10-27).
- Update the public repository only on the owner's word, after the [releasing](.agents/skills/releasing/SKILL.md)
  checks. Never change the `package.json` version otherwise. The npm launcher and runtime feed stay at 0.3.0 and
  their packaging was removed (owner, 2026-10-27).
- Feature freeze since 2026-10-24: take bug fixes, UX audits, polish and release work;
  propose a new capability as later work instead of building it, unless the owner asks
  for that change.
- Small eval suites are regression checks, not tuning targets; grow them from real
  episodes before tuning against them.

Current decisions and work in flight are in the owner's private project status, kept in the DreamCut Cloud
repository: read `../dreamcut-cloud/docs/editor-project-status.md` when that checkout sits beside this one
(the public [pointer](docs/project-status.md) says so). Record new decisions there, never in this repository.

## Where lessons go

Every agent working here (Claude, Codex, the in-editor agent) shares what it learns
through the homes below, never through agent-private memory, which other agents cannot
read. Before saving a lesson, check whether its home already says it.

| Lesson | Home |
| --- | --- |
| The creator's taste or how they like to work with agents | My Style (`STYLE.md`), only with the creator's say-so |
| How to do a kind of work, including a correction to how agents did it | The owning skill and its `evolution.md` |
| A rule every task must follow | `AGENTS.md` or a [standard](docs/standards/README.md) |
| How the owner wants this repository worked | Owner working agreements above |
| A product decision, initiative or deferred to-do | Private project status (`../dreamcut-cloud/docs/editor-project-status.md`), with its date |
| One project's direction | That project's editing feedback and memory |

Agent-private memory may hold only pointers to these homes and facts about the agent's
own harness. When a correction shows an existing home was ignored, fix the procedure
or add a check rather than repeating the rule.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
