# User identity, export closeout and community learning

Status: proposed architecture, 2026-09-26. Based on the working checkout at
`59205bead2674063240ad6379390ba4eb146b861` plus uncommitted local changes.
Local feedback capture and causal links are implemented in this checkout; identity,
cloud bundles, upload and the unified coordinator below are not implemented.
This document replaces the earlier minimal-analytics proposal. It does not enable sharing.

**2026-10-10 first slice (implemented).** The creator chose Supabase as the destination
and sharing **on by default**, switchable off in Memory → Settings. A completed export
uploads the privacy-limited retro evidence projection, not the complete record bundle
below, keyed by a random install ID. See the
[export retrospective contract](standards/export-retrospective-contract.md#cloud-export-sharing).
Still missing from this plan: authenticated ingestion (the function accepts
unauthenticated, schema-checked writes), a metadata table, project exclusions,
payload preview, remote deletion, cancellation of queued sends, failed-export
evidence and non-export coverage. Cloud retros and pushed style updates remain future
work; retros still run locally.

## Product decisions and boundaries

The goal is comprehensive evidence of how an edit developed: user direction and
stated reasons, alternatives, decisions, changes, reversals, export outcomes,
retrospectives and resulting improvements. Preserve the complete editing records;
small analytics events are a derived view, not the archival authority.

The user confirmed that cloud contributions include **editing records only, no
media files**. Do not upload original or generated audio/video, exported videos,
images, screenshots, thumbnails, proxies or other binary media. Transcripts,
scripts and editorial text are editing records and can contain personal content;
setup must say this plainly. Source references and technical media metadata can
be retained without transferring the referenced media. This is DreamCut project
evidence, not a backup of the user's computer or unrelated Codex conversations.

Use one existing delivery skill as the agent entry point and one durable runtime
coordinator as the owner. The skill explains and invokes the workflow; it cannot
be the only place its state lives. A closed chat or disconnected network must not
lose a retrospective or upload. Deliver the video locally even when the cloud is
unavailable. Report video, retrospective, improvement review and sync separately.

## What exists today

| Component | Current responsibility | Gap this proposal fills |
| --- | --- | --- |
| [Timeline/history store](../src/lib/local-store/store.ts) | Current timeline and full mutation snapshots, including restore evidence | Stable project identity and versioned bundle inventory |
| [Proposals](../src/lib/local-store/proposals.ts) | Options, review outcomes and revision relationships | Remote preservation of every observed record revision |
| [Editorial feedback](standards/editorial-feedback.md) | Direction, reason, provenance, targets, response links and coverage | Reliable coverage across entry points; cloud association |
| [Editing Memory](../src/lib/local-store/editing-memory.ts) | Events, preferences, checkpoints and improvement candidates | User identity separate from taste/settings; contribution records |
| [Tracked export](../src/lib/local-store/render-jobs.ts) | Persist render job, freeze learning checkpoint before encoding when learning is enabled, dispatch retro after completion | One durable closeout run joining job, evidence and sync |
| [Retro worker](../src/lib/local-store/editing-retro.ts) | Read-only review, retained attempts, validated findings, candidates | Sync findings and later review outcomes without rerunning export |
| [Delivery skill](../.agents/skills/platform-video-delivery/SKILL.md) | Quality checks, explicit export request, retrospective and delivery receipt | Invoke/resume the coordinator and explain all statuses |

The [export retrospective contract](standards/export-retrospective-contract.md)
remains the implemented authority. Actor values such as `human` and `agent`
describe request provenance, not authenticated identity. Historical unknowns must
stay unknown. Neither `learning` nor `agent_retros` authorizes remote contribution.
[Diagnostics](observability.md) remain separate and exclude editorial content.

There is a timing discrepancy to resolve during implementation:
the former export-chat prompt (removed 2026-10-10) requested
session review during encoding, while the automatic export retrospective waits
for a completed job. The coordinator should own one final retrospective. Optional
parallel evidence preparation is provisional; it must not run a duplicate retro
or claim successful-delivery findings before completion.

## User metadata and record identity

Introduce a versioned `identity.json` beside the local profile's `preferences.json`,
using the existing `profileDir()` location. Keep credentials in private credential
storage, never in identity files or bundles. Store contribution settings separately
in `community-sharing.json`. These filenames and schemas are proposed.

| Identifier/context | Meaning and lifetime |
| --- | --- |
| `profile_id` | Random stable UUID for one local creator profile; survives app upgrades |
| `installation_id` | Random installation UUID; separate from person and never a hardware fingerprint |
| `account_id`, `workspace_id` | Optional cloud principal and team; server verifies membership |
| `project_uid` | Stable UUID independent of folder name; explicit fork gets a new UUID and parent lineage |
| `session_id`, `turn_id` | Originating editing session/turn where actually known |
| `transaction_id`, `feedback_ids`, `proposal_ids` | Existing causal relationships, carried through snapshots, decisions and restores |
| `export_run_id`, `render_job_id`, `checkpoint_id` | One closeout, its encoder job and frozen review evidence |
| `profile_revision`, `app_build`, `skill_versions` | Context effective when the event/run happened, not today's values |
| `sharing_revision` | Saved contribution choice governing a send, checked again immediately before sending |

Assign legacy projects a project UUID once, under a lock. Do not rewrite historical
files to insert it: a manifest maps their original paths, IDs and hashes into the
new project identity. Preserve original bytes and hash semantics. New record
schemas can add identity references through explicit versioning. Copy/import must
distinguish reopening the same project from a fork; never silently merge two
unrelated projects because their folder names match.

A bundle has one contributor/context manifest, referenced by its records. Avoid
repeating email or a full user profile on every event. Optional creator metadata:
display name, self-described role, editing experience, primary content categories,
intended platforms, language and product goals. Timestamp and version changes.
Do not infer demographics from footage or editorial choices. Account contact
information belongs in the account service, not the learning corpus.

Separate three facts: **who contributed the bundle**, **who initiated a recorded
action**, and **who authored its contents**. An agent proposal approved by a human
retains both authorships. A shared computer's active profile is contextual evidence,
not proof that a particular person clicked a button. Historical records may have
`principal_id: null` even when their uploader has an authenticated account. Login
links a local profile to an account; it does not retroactively authenticate history.
Machine/provider/model versions belong to agent execution metadata when known.

Illustrative new contribution context (not a migration of existing event bytes):

```json
{
  "schema_version": 1,
  "profile_id": "uuid",
  "installation_id": "uuid",
  "project_uid": "uuid",
  "export_run_id": "uuid",
  "profile_revision": "sha256",
  "app_build": "commit-plus-local-build-fingerprint",
  "sharing_revision": 2,
  "scope": "editing_records_no_media"
}
```

The server derives authenticated ownership from credentials; it does not trust an
`account_id` claimed inside uploaded JSON. Pseudonymous IDs are still linkable and
must not be described as anonymous.

## Complete editing-record bundle

Keep the existing local formats. Full snapshots remain useful for recovery and
analysis; do not replace them with deltas. Package versioned copies with a manifest
and optional compression. Normalized decision tables are derived server-side.

| Include | Content and handling |
| --- | --- |
| `timeline.json`, `metadata.json`, `history/*.json` | Full state and snapshots, including before/after, Undo/Redo and attribution |
| `proposals/*.json` | All options, rationales, approvals, rejections, stale/superseded drafts and observed revisions |
| `memory/events/*.json` | Original feedback, corrections, dispositions, edits, exports and learning events |
| `review/`, relevant `analysis/` records | Marks, assembly briefs, auditions, scripts, transcripts, alignment, selection and reasoning records |
| `source-manifest.json` and relevant preprocessing records | Provenance, source IDs, hashes, timing, transformation recipes and readiness; no referenced media bytes |
| Instrument reports | Structured measurements, coverage and validation receipts; referenced stills/audio/video excluded |
| `memory/retros/`, `memory/retro-attempts/`, `memory/skill-candidates/` | Checkpoints, worker attempts, findings, failures, candidates and review outcomes |
| Applicable profile/skill snapshots | Versioned relevant preferences, skill contents, evolution evidence, before/after changes and approval receipts |
| Export/job/delivery records | Captured export settings, mute variants, success/failure/cancellation, validation, artifact hashes and later closeout additions |

Use a registered artifact collector per subsystem, not a recursive upload of the
project directory. Include all recognized editing records within the chosen scope;
unknown files appear in a coverage report for future collector support. Exclude
credentials, `.env`, dependencies, caches, arbitrary process logs and unrelated
chats. File extension alone cannot establish safety: JSON can contain embedded
media, secrets or remote URLs with credentials. Collectors must reject/extract
embedded media, strip credentials and record transformations explicitly.

The manifest lists logical path, record type/schema, source hash, transmitted hash,
size, capture time, relationships, transformation version and status for every
candidate artifact. Media entries carry `excluded_by_scope`; inaccessible files,
unsupported formats and failed reads are distinct. Preserve logical/source
relationships using asset IDs and project-relative paths; replace home-directory
prefixes and credential-bearing URL components in contributed copies. Never alter
local originals. Do not promise automated redaction makes editorial text anonymous.

A bundle is complete only relative to a declared inventory and capture boundary.
Report missing/unrecognized records and collection failures. Existing event
capture can fail; reconcile canonical history and proposals rather than treating
the event stream as proof of complete capture. No backfill can recover an unwritten
user reason or unobserved overwritten proposal version. Preserve those gaps.
Without uploaded media, cloud analysis cannot independently verify visual/audio
quality or reproduce a render; it can inspect recorded measurements and decisions.

## Export workflow and durable state

Proposed project storage:

```text
identity.json                         # project UID and lineage only
delivery/runs/<run-id>/run.json      # atomic mutable stage/status record
delivery/runs/<run-id>/events/       # immutable transition receipts
delivery/runs/<run-id>/manifests/    # immutable bundle revisions
```

Transport objects live in a private bounded local outbox outside collected paths.
Do not recursively include prior bundle archives. One run owns one render job and
one final export checkpoint. Lock transitions and use stable idempotency keys;
chat, GUI and CLI all resume that run rather than starting competing work.

1. **Preflight.** Confirm explicit export request, format and approved timeline;
   read effective preferences, feedback coverage, validation and sharing settings.
   Missing feedback links remain visible; the agent cannot invent user reasons or
   approve pending proposals to make the report clean.
2. **Freeze.** Under a short project lock, capture the exact timeline revision,
   metadata, export-only mutes, relevant history/proposal versions and context.
   Renderer and checkpoint consume that same snapshot. Release the lock before
   encoding; later edits belong to subsequent snapshots. Persist the initial
   manifest before starting the worker. With local learning enabled, preserve the
   current rule that checkpoint failure blocks render startup.
3. **Render.** Start one tracked job. Evidence packaging can proceed in parallel.
   If sharing is enabled, initial records may upload while encoding proceeds.
   Do not upload the encoded video or any source media.
4. **Verify delivery.** Save render result and validation receipts; distinguish
   encoding success from quality checks still pending. Failed/canceled jobs retain
   failure evidence but do not enter the successful-export retro path.
5. **Run the retrospective.** After durable completion, dispatch/resume the one
   checkpoint through the existing worker. Retain attempts, citations, explicit
   versus inferred reasons, counterevidence and no-learning outcomes. Respect
   `learning` and `agent_retros` settings; skipped/paused is a real status.
6. **Handle improvements.** Apply existing personal-style policy, including its
   inference and conflict checks. Stage shared skill candidates for separate human
   review unless that exact change was already authorized. Record actual changes,
   versions and receipts; never label a pending candidate as an applied update.
7. **Reconcile and sync.** Add export, verification, retro and improvement records
   in a new immutable manifest revision. Resume missing object uploads and commit
   the manifest only after server checksum acknowledgements. Later candidate
   approval/rejection produces an addendum; it never requires another render.
8. **Deliver the receipt.** Show the local video, validation status, retro outcome,
   pending improvement reviews and cloud status with retry/settings actions.

Do not collapse everything into a single `complete` boolean. Track render,
verification, retrospective, improvement review, packaging and upload separately.
The UI can say “Video ready · Retro complete · 2 skill changes awaiting review ·
Editing records synced.” Pending human review may last days and must not hold up
video delivery or syncing already available evidence.

| Condition | Required behavior |
| --- | --- |
| Cloud not configured | `not_configured`; local records/manifest retained; no invented endpoint or claimed upload |
| Offline/server error | Durable retry with backoff; video remains usable |
| Retro failure or disabled worker | Explicit failed/paused/skipped status; sync available evidence; manual retry uses same checkpoint |
| App/chat restart | Reconcile job/checkpoint/outbox, resume eligible stages, no second render or duplicate adoption |
| Packaging/disk failure | Mark incomplete and expose recovery; never delete canonical records to clear backlog |
| Sharing turned off | Stop new sends, cancel queued sends and best-effort cancel in-flight transfers; retain local history |
| Failed/canceled export | Preserve and optionally sync failure evidence under existing sharing choice; no success lesson |
| Later skill approval | Attach an independently versioned change/review receipt to the originating run |

An export reconciles a useful final boundary, but export-only upload misses abandoned
projects and edits between deliveries. Follow with incremental sync after durable
local writes plus startup reconciliation. Retain each observed mutable-record
revision. Until that exists, clearly label coverage as export-triggered only.

## Skill and setup responsibilities

Extend `platform-video-delivery` rather than creating a second conflicting export
ritual. Its proposed contract is: inspect preflight, invoke/resume a closeout run,
review findings, explain pending human decisions and report actual stage statuses.
Runtime owns persistence, locks, retries, file selection, permission checks and
network operations. Add a typed coordinator entry point without exposing agent
self-approval or bypassing the existing explicit export authorization boundary.
The current MCP does not expose rendering; adding an entry point is a deliberate
contract change, not permission to work around its gate.

Consent to export sharing is given at download, decided 2026-10-11. DreamCut is free,
and contributing editing records is the price: the download page states this and the
creator opts in there. The app therefore shares by default whenever learning is on
([export-sharing.ts](../src/lib/local-store/export-sharing.ts)); a profile's
`cloud_sharing: false` turns it off, and `CLOUD_INGEST_URL=off` disables uploads for
tests and offline development. Media files are never uploaded. The app does not ask
again, so the download page must stay accurate about what is collected.

A setup wizard and a Codex setup prompt should call the same settings interface.
Create local identity, explain complete-record contribution (including text) and
show the configured destination. Separate local retrospectives, community
contribution and diagnostics. Offer project exclusions, pause/off, a payload preview,
history backfill selection and remote deletion. With no cloud configured, show
“Cloud sharing unavailable” and send nothing.

Illustrative prompt for the future interface:

> Set up DreamCut and my creator profile. Configure local learning and show me the
> community-sharing destination and the editing records it collects, excluding all
> media files. Save my sharing choice, show where I can turn it off or exclude a
> project, and verify the setup. Report unavailable features honestly.

The product decision about first-run presentation/defaults is still open; the
implementation must record a real contribution choice. Selected historical
projects require explicit backfill selection. Recheck current permission before
every request, not just at bundle creation. Previously acknowledged records need
a separate deletion request; turning off sharing cannot unsend them.

## Cloud we still need to build

Start with an authenticated ingestion API, a metadata database, private object
storage and an asynchronous analysis queue. No vendor or destination is selected.
Store complete contributed record objects separately from derived analytics and
curated evaluation cases. Keep operational diagnostics separate.

Proposed protocol:

1. Authenticate/enroll profile and installation; authorize project ownership.
2. Submit a manifest revision with scope, sharing revision and idempotency key.
3. Server validates schemas/quotas and returns the missing-object upload plan.
4. Client uploads bounded, resumable objects; server verifies sizes and hashes.
5. Commit manifest only when required objects are present and acknowledged.
6. Queue analysis and retain acknowledgements locally for reconciliation.

Treat all client IDs and records as untrusted assertions. Enforce tenant access on
every read/write; deduplicate within the authorized scope without exposing other
users' object existence. Never execute uploaded scripts or follow arbitrary local
paths/URLs in records. Strict size/schema limits apply before analysis. Unknown
schema versions fail visibly instead of being silently reinterpreted.

Define retention, backup expiry, access controls and deletion before a pilot.
Deletion tombstones prevent retries/backfills from resurrecting deleted records.
Keep per-account contact details out of broadly accessible research data. The
initial purpose is product evaluation and reviewed skill improvement; public
redistribution or model-training uses need separately stated scope.

Cloud learning joins direction → proposal/options → human decision → changes →
reversals → final export → retro → improvement outcome. Approval is acceptance of
that proposal, not proof of a universal preference. Exports are not satisfaction
ratings. Keep contributors/decisions as grouping units so repeated snapshots do
not become repeated votes. Generate candidate improvements and evaluation cases;
review and ship general skill changes through the normal repository/release path.
Do not overwrite all users' personal styles from aggregate behavior.

## Implementation sequence and acceptance

1. **Local identity and bundle builder:** versioned schemas, registered collectors,
   manifest preview, synthetic fixtures, completeness report, no network dependency.
2. **Durable closeout coordinator:** integrate tracked render/checkpoint, stage
   receipts, restart recovery and later improvement addenda; update delivery skill,
   its evolution log and export-chat prompt together.
3. **Sharing setup:** real settings API, wizard/agent interface, project exclusions,
   contribution receipts, immediate disable and selected history backfill.
4. **Cloud + uploader:** authenticated object ingestion, checksums, resumable retry,
   manifest commit, deletion and a limited enrolled pilot.
5. **Incremental coverage and learning:** non-exported projects, mutable record
   revision capture, completeness monitoring, curated cases and reviewed improvements.

Required acceptance checks:

- User/project identity survives rename/restart; forks and account linking preserve
  historical authorship without guessing missing principals.
- Bundle joins feedback, proposal, transaction, Undo/Redo and export evidence;
  legacy source hashes remain verifiable after context is added.
- No media payloads, embedded base64 media, credentials or unrelated files leave
  the device; source references and transcript records follow the declared scope.
- Render and checkpoint use the same frozen revision despite concurrent edits.
- Restart/retry cannot duplicate render, retro adoption or uploaded manifest commits.
- Remote unavailability does not invalidate delivery; incomplete uploads are visible.
- Disabled sharing prevents network sends, including retries; deletion survives retry.
- Pending/rejected/approved skill changes sync as distinct outcomes with exact versions.
- Missing capture and media exclusions are measurable; no claim of full conversation
  capture, visual verification or abandoned-project coverage without evidence.

This revision changes architecture documentation only. It does not create an
account, configure a destination, export a project, modify a skill or upload data.
