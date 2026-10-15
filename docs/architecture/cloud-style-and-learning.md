# Hosted style and cloud learning

Status: proposed, 2026-10-11. The DreamCut Cloud side of phases 2, 3 and 5 is built on the
`cloud-style-sync` branch (migration `20261012053704_account_style_sync`, not yet applied); the
editor side is built against the API below ([editor implementation](#editor-implementation)), so
live sign-in, sync and suggestions are unverified until the Cloud API deploys. It extends
[cloud generation, credits and purchases](cloud-generation-and-credits.md) (accounts) and
[user identity, export closeout and community learning](../community-learning-architecture.md)
(evidence upload), and changes the "Personal profile: not uploaded" row of
[desktop data layout](desktop-data-layout.md) once it ships.

## Decisions (creator, 2026-10-11)

- **Learning leaves the device.** A creator's style is hosted on their DreamCut account and synced
  to every machine they sign in on. The editor keeps a local copy; it does not run the learning
  process.
- **Retros are manual for now.** Nothing runs a retrospective automatically, locally or in the cloud.
  The DreamCut team pulls evidence down, runs the review by hand and sends the resulting
  suggestions back to the creator's account for them to accept or reject.
- **No footage.** Only editing records are uploaded, as the community learning plan already decided:
  never source or generated media, exports, frames or thumbnails.
- **Learning is free with an account** to start. Credits pay for generation only.

## What exists today

| Piece | Today | Change |
| --- | --- | --- |
| Style (`STYLE.md`, `preferences.json`) | Local profile, authoritative ([editing memory](../../src/lib/local-store/editing-memory.ts)) | The account copy becomes authoritative; the profile copy is a cache |
| Saved templates (`personal-styles/`) | Local profile | Synced with the account |
| Export evidence | Uploaded after each export to the `ingest-export` Edge Function, keyed by a random install ID, on by default ([export sharing](../standards/export-retrospective-contract.md#cloud-export-sharing)) | Linked to the signed-in account; authenticated ingestion |
| Activity journal and product signals | Opt-out upload, per [desktop data layout](desktop-data-layout.md) | Linked to the account in the same way |
| Retros | Dispatched automatically on the device after a tracked export | Automatic dispatch off; run manually by the team |
| Account sign-in from the editor | Not built (connect flow exists on the site) | Required for sync; shared with generation and template sharing |

## System

```text
Editor (signed in)                     DreamCut Cloud (Supabase)              DreamCut team
  style cache  ◀── sync (revisioned) ──▶ style, saved templates
  export ──── evidence (no media) ─────▶ evidence store (per account) ──pull──▶ manual retro
  Memory: review suggestions ◀───────── style suggestions ◀─────────push───── reviewed findings
```

### 1. Sign in once

The editor signs in through the existing connect flow (`/api/v1/connect/*`). The same session
serves generation, template sharing and style sync. At first sign-in the install ID is attached to
the account, and earlier evidence uploaded under that install ID is claimed by it.

Without an account the editor still works: the local style keeps working as it does today, it
is not synced, and no suggestions arrive.

### 2. Hosted style

One row per account in `account_styles`: `revision`, `markdown` (the creator's `STYLE.md`, at most
200 KB), `preferences` (the `preferences.json` sidecar as one JSON document, at most 1 MB),
`templates` (the saved templates from `personal-styles/` as a JSON array, at most 1 MB) and
`updated_at`. The style is one document rather than per-record tables because runtime preferences
derive from `STYLE.md`; the sidecar and templates travel with it under the same revision.

All four cloud tables (`account_styles`, `install_claims`, `style_suggestions`,
`evidence_access_log`) have row-level security on and no grants to `anon` or `authenticated`. The
site reads and writes them with the service role after authenticating the caller. Writes go through
security-definer functions that only the service role may execute:

- `save_account_style(user, base_revision, markdown, preferences, templates)` replaces the style
  when `base_revision` equals the current revision (0 when there is no row) and returns the new
  revision; otherwise it raises `DC409 stale_style_revision`.
- `decide_style_suggestion(user, id, decision, base_revision)` accepts or rejects one pending
  suggestion owned by the account (`DC404` otherwise). Accepting compare-and-sets like a save,
  appends the suggestion's `markdown_addition` to the style after a blank line, bumps the revision
  and records it as `accepted_revision`. Rejecting records the decision. Both return the resulting
  style revision.
- `claim_install(user, install_id)` and `recent_evidence_uploads(user, since)` serve evidence
  ingestion below.

Sync rules:

- The account copy is authoritative. Writes carry the revision they were based on; a stale write is
  refused, like timeline revisions, and the editor reloads and reapplies. Nothing is merged silently.
- The editor keeps the profile copy as a cache so editing and agent context work offline. Offline
  edits queue and send on reconnect under the same revision check.
- Agents keep reading style through `timeline_get` and `editing_memory_get`, unchanged. Both read
  the cache, so [agent parity](../standards/agent-surface-parity.md) is unaffected.
- `STYLE.md` stays human-readable and human-editable. It is never regenerated from records.

### Cloud API

All routes are under `/api/v1`, take and return JSON, and authenticate with the editor's connect
bearer token (`requireUser`; the website's cookie session also works). Errors use the site's
`{ error, message }` body.

| Route | Body | Returns |
| --- | --- | --- |
| `GET /style` | | `{ revision, markdown, preferences, templates, updated_at }`; with no style `{ 0, "", null, [], null }` |
| `PUT /style` | `{ base_revision, markdown, preferences, templates }` | 200 `{ revision, updated_at }`; 409 `{ error: "stale", current: <GET body> }`; 413 when a part is over its limit |
| `POST /installs/claim` | `{ install_id }` | 200 `{ claimed: true }`, idempotent for the same account; 409 `install_claimed` when another account owns it |
| `POST /evidence` | an export packet (`dreamcut.export-packet.v1`, as sent to the Edge Function) | 200 `{ ok: true, already_received }`; claims the install first (409 as above); 429 over 60 packets an hour per account |
| `GET /style/suggestions` | | `{ suggestions: [{ id, title, rationale, markdown_addition, evidence: [{ ref, note }], created_at }] }`, pending only, oldest first |
| `POST /style/suggestions/{id}` | `{ decision: "accept" \| "reject", base_revision }` | 200 `{ revision }`; 409 `{ error: "stale", current }`; 404 when not pending or not owned; 413 when accepting would exceed 200 KB |

The website's `/account/style` page shows the style document and the pending suggestions, each with
its rationale, the text it would add and its evidence notes, with Accept and Reject. A stale or
already-decided suggestion reloads the page.

### 3. Evidence

Keep the existing privacy-limited projection (`buildRetroEvidence`) and the activity journal as
the only learning inputs. Changes:

- Signed-in installs send packets to `POST /api/v1/evidence`. It applies the Edge Function's checks,
  claims the install for the account (`install_claims`) and stores the packet unchanged at the same
  path in the private `export-packets` bucket (`v1/<install_id>/<project_id>/<job_id>.json`),
  never overwriting an earlier copy. Packets stay keyed by install ID; the claim links them, and
  earlier anonymous packets from that install, to the account.
- Signed-out installs keep using the anonymous `ingest-export` Edge Function, unchanged.
- Deleting the account deletes its style, claims, suggestions and access log by cascade. Its packets
  in storage are not deleted by cascade (see open questions).
- Add the missing pieces the community learning plan lists: project exclusions, a preview of what
  is sent, and remote deletion.

### 4. Manual retros

No automatic retro runs. The tracked export still freezes its checkpoint and uploads evidence, but
the local worker is not dispatched.

The team's workflow:

1. **Pull.** An operator command downloads one account's evidence since its last review into a
   local working folder outside the repository:
   `pnpm cloud:learning pull --email <email> [--since <iso>|all] [--out <dir>] [--env-file <file>]`.
   It finds the account by email (Supabase admin API), lists the packets under its claimed installs
   in `export-packets`, writes them and an `index.json` to `~/DreamCut-learning/<email>/` by default
   (refusing a folder inside the repository), and logs the pull. `--since` defaults to that folder's
   previous pull.
2. **Review.** The operator runs the existing review procedure
   ([learning-review](../../.agents/skills/learning-review/SKILL.md) and the
   [export retrospective contract](../standards/export-retrospective-contract.md)) against it.
   Evidence rules are unchanged: two distinct citations, no counter-evidence, inferred reasons
   labelled as inferred.
3. **Route.** Taste specific to this creator becomes a **style suggestion**. Shared problems (a
   skill, tool, dial or catalogue gap) go to the repository as normal improvement work, never into
   one creator's style.
4. **Push.** An operator command writes suggestions to `style_suggestions`, status `pending`: a
   title, a rationale, the text to add to the style (`markdown_addition`) and evidence citations
   (`[{ ref, note }]`), with the operator's name in `created_by`. A suggestion that should no longer
   be offered is marked `withdrawn`. Command:
   `pnpm cloud:learning push --email <email> --file <suggestions.json>`, where the file is
   `{ "suggestions": [{ "title", "rationale", "markdown_addition", "evidence": [{ "ref", "note" }] }] }`.
   It validates each suggestion (two distinct evidence refs, the table's size limits) before
   inserting, and logs the push.
5. **Decide.** The creator sees pending suggestions in Memory, with the evidence behind each.
   Accepting one writes a new style revision; rejecting one is recorded and not offered again. A
   suggestion never applies itself.

Operator access to a creator's editing records is new: consent text must say the team may read
uploaded edit history to improve their style and DreamCut. Every pull is logged against the
account in `evidence_access_log` (operator, action, object count). Both commands use
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the operator's environment (or `--env-file`, for
example the site's local env file), take the operator name from `--operator`, `DREAMCUT_OPERATOR` or
the OS user, and are internal operator tools (`scripts/cloud-learning.ts`, inventoried in
`docs/tools/script-inventory.json`); they never ship in the app.

### 5. Later: a cloud retro worker

Once manual reviews show which findings are reliable, automate step 2 as a queued job using the
same pattern as generation (pg_cron tick, dispatch route, worker). Decide pricing then.

## Editor implementation

| Piece | Where | Behaviour |
| --- | --- | --- |
| Automatic retros off | `render-jobs.ts`, `resumeProjectRetros` in `editing-retro.ts` | Export completion freezes the checkpoint and uploads evidence; it never starts the worker. Memory → Export reviews runs it. Restart recovery only resumes a review a person started. |
| Sign-in | Memory → Settings → **DreamCut account** (`CloudAccountSettings.tsx`); `/api/user/cloud-account` and its `/callback`; `cloud-account.ts` | Opens `/connect` with a PKCE challenge, a state value and the loopback callback. The session (tokens, expiry, email) is `profileDir()/private-credentials/dreamcut-cloud.json`, mode 0600 in a 0700 folder beside the fal key; never in the repository or browser storage. Refreshes two minutes before expiry; a refused refresh or **Sign out** deletes it. The browser only sees the email and sync state. |
| Style sync | `cloud-style-sync.ts`, started from `instrumentation.ts` | Payload: `STYLE.md`, `preferences.json` and the active `personal-styles/*.json`. `profileDir()/cloud-sync/style.json` records the account, last synced revision and payload hash. Runs at sign-in, every five minutes and a few seconds after a local style save. Local unchanged and a newer revision → pull. Local changed → `PUT` with the last synced revision. A `409`, or a first sign-in where the account already has a different style, adopts the account copy and keeps the local one in `profileDir()/style-conflicts/` (JSON plus a readable `-STYLE.md`), listed in Memory → My style → **Earlier versions from this computer** with **Use this text** and **Hide** (the file stays). No account style yet → upload the local one. Templates the account no longer has leave the active list; their revision files stay. |
| Account evidence | `export-sharing.ts` | Signed in: claim the install (at sign-in and before the first account upload), then `POST /api/v1/evidence` with the bearer token, keeping the outbox retry rules. Signed out: the Edge Function, unchanged. |
| Suggestions | Memory → My style → **Suggestions from DreamCut** (`CloudStyleSuggestions.tsx`); `/api/user/cloud-style` | Title, rationale, the text that would be added and evidence notes. **Add to my style** and **Reject** first send local changes, decide against the synced revision (retrying once on `409`), then pull. |
| Share a template | Templates → one of your templates → **Share with DreamCut** (`TemplateShare.tsx`); `cloud-template-share.ts` | Needs sign-in, an MP4 from the project's `renders/` (up to 50 MB) and a credit name. Takes a JPEG poster with FFmpeg, then draft → upload → submit through the shared-recipes API. Shows **Waiting for review** until the published listing includes it, then **Published**. |

Agents keep reading the cache through `timeline_get` and `editing_memory_get`; the agent surface did
not change.

## Rules that change

| Current rule | Change |
| --- | --- |
| The personal profile is never uploaded | Style and saved templates sync to the signed-in account |
| Retros run locally after tracked exports | No automatic retros; the team runs them from uploaded evidence |
| Evidence is pseudonymous (install ID) | Linked to the account once signed in |
| Servers never receive footage | Unchanged |
| Style never overrides approval or source preservation | Unchanged; suggestions need the creator's acceptance |

## Rollout

| Phase | Delivers | Done when |
| --- | --- | --- |
| 0 | Turn off automatic local retro dispatch | A tracked export freezes and uploads evidence; no retro starts |
| 1 | Editor sign-in (connect) | Signed-in state survives restarts; sign-out clears the session |
| 2 | Hosted style and saved templates with sync | Two machines on one account see the same style; a stale write is refused and recovered |
| 3 | Account-linked, authenticated evidence | New uploads carry `user_id`; install-ID uploads are claimed at sign-in |
| 4 | Manual retro pull and push, suggestions in Memory | One real review completes pull → review → push → accept, with the evidence visible to the creator |
| 5 | Style page on dreamcut.io | The creator can read their style and decide suggestions without the editor |
| 6 | Cloud retro worker | Automated reviews match manual ones on a held-out set before replacing them |

## Open questions

- How long uploaded evidence is kept, and whether an account can opt out of team review while
  keeping sync.
- Whether installs that never sign in keep uploading pseudonymous evidence.
- Whether a creator can have more than one style (for example per client), or one style with
  project exceptions as today.
- **TODO:** deleting an account cascades its rows but leaves its packets in the `export-packets`
  bucket under its claimed install IDs. Remote deletion needs a storage cleanup step (read the
  account's `install_claims` before the user row goes, then remove `v1/<install_id>/` objects).
- The anonymous Edge Function still accepts packets for an install that an account has claimed.
  Once the editor sends signed-in evidence to the site, the function should refuse claimed installs;
  that change is not deployed.
