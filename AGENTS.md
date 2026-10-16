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

Decide first whether the request changes how DreamCut works (code, UI, contracts, skills)
or edits a project. A product change ends at verified code, checked on a disposable copy;
do not draft cards, edit project files or record editorial feedback to demonstrate or
migrate it unless asked. If it leaves project material stale, say so and offer a card.
When an editing request names no project, call `editor_context_get` and use the
project open in the editor if its status is `current` (viewed in the last 30 minutes,
no other window showing another project); otherwise ask which project.

Keep the editor in front of the creator while discussing a project. Once the project
is known, check that the editor answers at http://127.0.0.1:3123; if it does not,
start it (`pnpm dev`, through your preview/launch tool when you have one). Then open
`http://127.0.0.1:3123/p/<project_id>` in your built-in browser when you have one, and
navigate there again when the project changes or new proposals are ready to review.
Opening a browser pane does not show the creator where the project is: every reply
that mentions a project, its proposals or anything to review in the editor links it
as a clickable `[<project title>](http://127.0.0.1:3123/p/<project_id>)`. Opening the
editor is viewing only; it never approves anything.

Read the relevant skill before using it. Load linked detail when the task needs it,
not every skill and standard at startup. Canonical skills live in `.agents/skills/`;
shared contracts live in `docs/standards/`.

| Task | Required starting point |
| --- | --- |
| Edit an existing timeline, including an exact dictate | [open-edit-proposals](.agents/skills/open-edit-proposals/SKILL.md) |
| Interpret several requests, marks or dependent edits | [editorial-intent-planning](.agents/skills/editorial-intent-planning/SKILL.md) before proposing |
| Build a new edit | [editorial-assembly](.agents/skills/editorial-assembly/SKILL.md) |
| Storyboard or break up supplied footage into beats | [storyboard-drafting](.agents/skills/storyboard-drafting/SKILL.md) |
| Recreate a reference video with other people (recast) | [video-recast](.agents/skills/video-recast/SKILL.md) |
| Compare alternatives for one creative decision | [timeline-auditions](.agents/skills/timeline-auditions/SKILL.md) |
| Import supplied files/folders, or choose analysis and sampling for existing footage | [media-intake](.agents/skills/media-intake/SKILL.md) |
| Recreate an effect from a reference | [recreate-effect](.agents/skills/recreate-effect/SKILL.md), then its craft skill |
| Generate project images or video | [generated-asset-workflow](.agents/skills/generated-asset-workflow/SKILL.md) |
| Select or join spoken takes | [talking-video-editing](.agents/skills/talking-video-editing/SKILL.md) |
| Add, change, restyle or reorganize editor UI | [editor-ui-design](.agents/skills/editor-ui-design/SKILL.md) |
| Change preview/render integration | [open-edit-remotion](.agents/skills/open-edit-remotion/SKILL.md) and [renderer contract](docs/standards/renderer-contract.md); the skill name is historical |
| Review code or a PR | [code-review](.agents/skills/code-review/SKILL.md) or [pr-review](.agents/skills/pr-review/SKILL.md), respectively |
| Write shared instructions | [prompt-authoring](.agents/skills/prompt-authoring/SKILL.md); use [skill-authoring](.agents/skills/skill-authoring/SKILL.md) for skills |
| Review outcomes, workflow efficiency, tools, skills or style | [learning-review](.agents/skills/learning-review/SKILL.md), or the explicitly requested independent review skill |
| Record published research | [research-deliverable](.agents/skills/research-deliverable/SKILL.md) |
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
  If the contract cannot express the edit, extend it (schema, GPU renderer support,
  then regenerate `mcp/proposal-schema.json`; the running MCP server adopts it without
  a restart) and propose. The edit need not wait for its dial; see below.
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
with linked work or `editing_feedback_disposition` and a reason. For net-new work,
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
project exceptions and suggested/retired records. Never regenerate STYLE.md from that
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
in the profile's `private-terms.txt`, which is never committed.

Treat audio the creator supplies for their own project as cleared for use in that project.
Record that provenance and preserve any more specific terms; this is neither an
ownership claim nor permission to redistribute it publicly.

## Visible generation drafts

`asset_generation_prepare` fills the Generate form (docked in Library, a drawer in
the editor) with the full context, prompt, references, model and settings; an open
editor brings it up, with its price in credits. Then stop for review. Generate only
when the creator clicks Generate, or explicitly approves that draft and price in
chat: then call `asset_generation_submit` with their exact words. A request to
prepare or improve a draft is not approval; never infer it. Generation runs through
the creator's DreamCut account and purchased credits; there is no API-key route.
Default image generation to the Codex image tool; use a credit-paid image model only
when the user selects it. Video generation keeps its separately selected model.
Staging never uploads, creates a provider job or charges. Preserve the selected model
on revisions unless the user asks to change it.

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

## Rendering and learning

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
that approval event. Follow the [export retrospective lifecycle](docs/standards/export-retrospective-contract.md)
for authorized exports; preserve the creator's retro settings.

Retros examine editing outcomes, repeated agent work and missing or mischosen dials.
Use recorded feedback, revisions and final overrides; do not assume intermediate
adjustments were logged. See the [tuning audit coverage](docs/standards/inspector-information-architecture.md#audit-tuning-and-improve-selection).
Route evidence to the owning skill/evolution log, standard or implementation;
creator-specific taste stays in personal preferences. A documentation update alone
is not measured behavior improvement.

Learning bookkeeping stays quiet. Session learning closeout runs only when the user
explicitly finishes the session, following [session learning hooks](docs/standards/session-learning-hooks.md).
An ordinary reply, pause or completed task is not session completion. Never export,
start a retro or change preferences/skills merely to satisfy a hook. Installation
is not proof of trust or runtime activation.

## Run it

Run commands from this repository, not its parent. Common entry points:

```bash
pnpm install                 # first-time dependencies
pnpm dev                     # editor: http://127.0.0.1:3123
pnpm review <id>             # stable review: port 3124, leaves dev server alone
pnpm project-health <id>     # read-only project report
pnpm typecheck
pnpm test
pnpm frame-state <id>        # appearance evidence
pnpm render <id>             # only for an explicitly requested project export
```

See `package.json` and the task's standard for specialized checks. Projects contain
`timeline.json`, `metadata.json`, source provenance, media, history and renders;
`projects/` is Git-ignored and `TIMELINE_PROJECTS_DIR` may relocate it. Workspace
layout is a view preference separate from output aspect ratio: it follows the video
shape by default, and flipping it never changes the output. Keep private media,
local receipts and generated build output out of commits. See [development workflow](docs/development-workflow.md)
and [contributing](CONTRIBUTING.md) for repository operations.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
