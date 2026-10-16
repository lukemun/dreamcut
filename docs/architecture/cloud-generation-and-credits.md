# Cloud generation, credits and purchases

Status: cloud side live at dreamcut.io since 2026-10-11 (code in `site/`, schema in `supabase/migrations`, both in the private
DreamCut Cloud repository); the editor client is built (see [Editor client](#editor-client)).
It adds the only hosted pieces DreamCut has: accounts, credits and cloud generation.

## Business shape

- **The editor stays free.** Editing, preview, export, the agent tools and the Library need no account.
- **Revenue is generation credits.** A creator signs in only to generate through DreamCut Cloud, which holds
  the fal account. Credits come only from purchased packs: no free credits and no subscription at launch.
  The free editor is the free tier.
- **Credits only** (decided 2026-10-12). Every generation runs through the creator's DreamCut account and
  purchased credits. There is no bring-your-own provider key in the product: no key field, no key storage, no
  "use your own key" copy. A `FAL_KEY` is read only as a development and test override (see
  [Editor client](#editor-client)).

## Scope: small on purpose

DreamCut Cloud is a thin service. It reuses:

- **An existing Stripe account** shared with another product. DreamCut gets its own products and prices (tagged `metadata.app = dreamcut`)
  and its own webhook endpoint, which ignores events for other prices.
- **The pattern, not the code.** pg_cron tick → pg_net → dispatch and reconcile routes → fal queue with a
  webhook. Written fresh for DreamCut.

Besides [shared recipes](#shared-recipes), nothing else is hosted: no projects, collaborators, subscriptions or
media library.

| Rule in the local contract | Change |
| --- | --- |
| No user accounts | Optional account, needed only for cloud generation, purchases and sharing recipes. Browsing shared recipes needs none. |
| Servers never receive footage | Still true for footage and projects. Only references attached to a generation are uploaded, after Generate is clicked, and deleted when the job ends. A shared recipe's example video and poster are uploaded only when its author shares it. |
| No hosted MCP | Unchanged. The local server calls the cloud API for the creator. |
| Staging never charges | Unchanged. Only the human's Generate click spends credits. |

## System

```
 Local DreamCut (127.0.0.1)                     DreamCut Cloud (dreamcut.io on Vercel + Supabase)
 Generate form ─ quote/submit ─ HTTPS + JWT ──▶ /api/v1/quotes, /generations, /me
 asset worker ◀── poll, download ───────────────  generation_jobs · credit_ledger · stripe_events
 keep → media/generated (unchanged)              pg_cron tick ─pg_net▶ /internal/dispatch, /reconcile
                                                 fal webhook ▶ /webhooks/fal
                                                 Stripe webhook ▶ /webhooks/stripe
```

**Sign-in:** the website uses an emailed 6-digit code (sent through Resend from `updates.dreamcut.io`).
The local app connects with Settings → Sign in, which opens `dreamcut.io/connect`; after the creator confirms,
the site mints a separate session and redirects to the local server's loopback callback with a one-time code
bound to a PKCE challenge. The local server exchanges it at `/api/v1/connect/token`, stores the refresh token
in `profileDir()/private-credentials/`, and refreshes through `/api/v1/connect/refresh`.
Browsers never see it.

**Generation flow:**

1. **Quote** — `POST /v1/quotes` returns credits for the draft from the server's price table (in code, versioned).
   The button reads **Generate · 120 credits**. Quoting needs no account and never charges.
2. **Submit** — on the click, the worker uploads references to signed URLs, then
   `POST /v1/generations {client_request_id, quote, input}`. `client_request_id` is the local job UUID, so a
   retry returns the same job. One RPC checks the quote, debits credits and inserts the job in one transaction.
3. **Dispatch** — the tick claims queued jobs with a lease and submits to fal with
   `…/webhooks/fal?job=<id>`. A submit whose outcome is unknown becomes `uncertain`; it is never resubmitted.
4. **Complete** — the webhook (or reconcile, as backup) records the result and stores the output (below).
5. **Deliver** — the local worker polls the job, downloads the output into `media/.generation/<jobId>/` and
   acknowledges. Keep, provenance and "never touches the timeline" stay as today.

## Editor client

Built 2026-10-12 in the editor (`src/lib/generation/cloud-generation.ts`, `cloud-readiness.ts`,
`asset-worker.ts`).

- **Generate form** (docked in Library, a drawer in the editor) offers only the models the Cloud catalog sells.
  It shows the draft's price from `/quotes` and, signed in, the balance from `/me` with a Buy credits link to
  `dreamcut.io/pricing`. Signed out, Generate is replaced by **Sign in or create account** (the email-code sign-in
  creates the account on first use) and the draft stays. When the balance is short, Generate is replaced by
  **Buy credits**; the form re-checks when the creator returns. A draft naming another model says it is not
  available with DreamCut credits.
- **Generate** records the request with the price the creator saw (re-quoted; a changed price is refused before
  anything is charged), then the worker uploads references, creates the generation with the local job
  id as `clientRequestId`, polls, downloads into `media/.generation/<jobId>/` and acknowledges. Keep copies the
  result into the project (managed copy, hash-checked) with provenance: service DreamCut Cloud, model, endpoint,
  Cloud generation id and credits.
- **Failures are honest.** Insufficient credits, sign-out, price changes and rejected drafts fail with "Nothing
  was charged". A create without an answer is retried with the same id; if still unanswered it is shown as not
  confirmed, and checking again repeats the same id, so it is never charged twice. Cancel is refunded before the
  model starts; after that the generation is delivered. A failed generation says its credits are refunded. A
  failed download resumes the same Cloud job.
- **Video and audio references** (recast, motion copy, video edit, reference video) carry a `window` on their
  own clock. Only that window is sent: the worker trims it into job scratch
  (`preprocess/asset-generation/<jobId>.references/`), re-encoding video to H.264 MP4 at 30 fps with the movie
  header first, sized for the model (`reference-media.ts`), and audio to 16-bit WAV. Each file is deleted once
  uploaded and the folder on every terminal path; preparing one first checks for its estimated size plus 5 GiB
  free. The Cloud draft declares each window's length to 0.01 s. Those lengths set the price (recast, Kling O1
  and motion copy per input second; Wan per 16 frames at 30 fps; Seedance reference per output plus input
  second), and before charging the generation route reads each uploaded file's MP4 or WAV header and refuses a
  length more than 0.1 s off. Uploads allow images up to 10 MB and MP4/WAV up to 200 MB (`generation-inputs`
  bucket limit raised in `20261014033330_generation_media_inputs`).
- **Music models** (MiniMax Music 3, Mureka, ElevenLabs Music) return audio; the draft carries `lyrics`, and
  results land in `media/.generation/<jobId>/` like other outputs. Providers that label audio as
  `application/octet-stream` are stored by their file extension.
- **Agents** stage with `asset_generation_prepare`, which reports the price, sign-in and balance without charging.
  After the creator explicitly approves the draft in chat, `asset_generation_submit` generates exactly the draft
  in the form, stores their words as the approval record, and refuses if the form changed since the agent
  reported it or the creator never had it open.
- **Development override, never in the UI:** with both `DREAMCUT_DEV_DIRECT_FAL=1` and `DREAMCUT_FAL_KEY` (or
  `FAL_KEY`), the worker submits directly to fal instead of the Cloud (`development-fal-key.ts`). A key alone
  does nothing, so an old environment file cannot skip credits.

## Generated media: store briefly

The cloud keeps a temporary copy; the Library copy is the real one.

- **Why store at all:** the creator pays when they click Generate, but their laptop may be closed or offline
  when fal finishes, and fal's own result URLs are not ours to rely on. A short-lived copy guarantees they get
  what they paid for.
- **Why not keep it:** DreamCut is local-first, storage costs grow with video, and holding people's media makes
  us responsible for it.
- **Rule:** delete 24 hours after the local app confirms download; delete unclaimed outputs after 14 days.
  References are deleted when the job ends. The Generate tab shows "Kept on DreamCut for 14 days until
  downloaded" only for unclaimed results.

## Database (whole schema)

RLS on; clients may only `select` their own rows. All writes go through `security definer` functions that are
revoked from `public`, `anon` and `authenticated` and called by the API with the service role.

The applied SQL lives in `supabase/migrations/`; this sketch is the shape.

```sql
create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  client_request_id uuid not null,
  model text not null,
  provider_payload jsonb not null,                -- built by the server
  credits int not null check (credits > 0),
  status text not null default 'queued' check (status in
    ('queued','submitting','running','completed','failed','canceled','uncertain')),
  provider_request_id text,
  lease_until timestamptz, next_check_at timestamptz,
  deadline_at timestamptz not null,
  output_path text, error text,
  created_at timestamptz default now(), downloaded_at timestamptz,
  unique (user_id, client_request_id)
);

create table credit_ledger (                      -- append-only; balance = sum(delta)
  id bigserial primary key,
  user_id uuid not null references auth.users,
  kind text not null check (kind in ('purchase','spend','refund','clawback','admin')),
  delta int not null,
  job_id uuid references generation_jobs,
  stripe_ref text,
  created_at timestamptz default now(),
  unique (job_id, kind),                          -- one spend and at most one refund per job
  unique (stripe_ref, kind)                       -- one grant per payment
);

create table stripe_events (id text primary key, received_at timestamptz default now());
```

Functions: `create_generation_job` (locks the user, checks balance, writes spend and job together),
`finish_job(id, expected_statuses, new_status)` (conditional update; failure or cancel writes the refund),
`claim_jobs(kind, limit)` (`for update skip locked`, sets `lease_until`), `grant_credits(user, kind, amount, ref)`.

## Scheduled jobs

| pg_cron job | Every | Does |
| --- | --- | --- |
| `generation_tick` | 1 min | When work exists, POSTs dispatch and reconcile with a Vault secret. |
| `generation_sweep` | 10 min | Fails and refunds jobs past `deadline_at` or `uncertain` for 30 min; deletes expired media. |

## Purchases

- Credit packs through Stripe Checkout on dreamcut.io, opened from the local app in the system browser.
- Grant on `checkout.session.completed` only when `payment_status = 'paid'`, with quantity from expanded
  `line_items`; `stripe_events` makes every webhook a no-op on replay.
- `charge.refunded` and disputes write a `clawback`. A negative balance blocks new generations.
- One credit sells for $0.002, about a 2x markup on the provider price (`CREDITS_PER_USD` in `site/src/lib/catalog.ts`).

## Shared recipes

Creators can share a recipe (a reusable editing treatment) with a real example so others can browse it in the
the editor for inspiration. A shared recipe is portable: title, description, skill, prompt, input directions,
preparation, limitations and parameter bundles, with no local file paths. Every published recipe has an example
video and poster; the database refuses to publish one without both files in storage.

Publish flow:

1. **Create** — the local app, signed in through connect, calls `POST /api/v1/recipes` with the recipe, a
   public credit name and the media sizes. It gets a draft and signed upload URLs for `example.mp4` and the poster.
2. **Upload** — the app uploads both files to the private `recipe-examples` bucket (50 MB limit).
3. **Submit** — `POST /api/v1/recipes/{id}/submit` checks both uploads and moves the draft to `pending`.
4. **Moderate** — a moderator sets `published` or `rejected` in the dashboard. Publishing stamps `published_at`.
5. **Browse** — `GET /api/v1/recipes` lists published recipes with time-limited media URLs, cached for about a
   minute. The editor merges them into Properties → Templates as Shared recipes credited to their author, playing the
   examples through a local proxy. If the Cloud is unreachable the editor shows the local list.
6. **Remove** — `DELETE /api/v1/recipes/{id}` lets an author withdraw their recipe and deletes its media.

Limits: 10 new recipes per author per day and 5 awaiting review at once. Only published rows and their media
are readable without the service role; author identity and moderation notes stay private.

## Status

| Part | State |
| --- | --- |
| Schema, ledger functions, Vault secrets, pg_cron tick and sweep | Live |
| Website, email-code sign-in, account page, Stripe Checkout and webhook | Live |
| Generation API, fal dispatch, webhook, reconcile, media expiry | Deployed; no real generation run yet |
| Local client: connect (Memory → Settings → DreamCut account) | Built in the editor; live sign-in unverified until the account endpoints deploy |
| Local client: cloud route in the asset worker, credits and sign-in/buy-credits gating in the Generate form, chat approval (`asset_generation_submit`); bring-your-own fal key removed | Built 2026-10-12; tested against mocked Cloud responses, no live generation yet |
| Shared recipes: schema, storage bucket and site API | Built; migration `20261012032301_shared_recipes` applied |
| Video/audio references and music models (recast, Wan replace, Kling O1 edit, Kling motion copy, Seedance 2/2.5 reference, MiniMax Music 3, Mureka, ElevenLabs Music) | Built 2026-10-13; Cloud/local catalog parity, header length checks and the trim-and-upload worker are tested locally against mocked Cloud responses. Migration `20261014033330_generation_media_inputs` applied 2026-10-14 (bucket limit 200 MB). The storage project is on the free plan, whose 50 MB global file limit still applies until the project is upgraded and that limit raised; reference video is encoded at up to 8 Mbps, about 30 MB for 30 s, to fit meanwhile |
| Shared recipes in the editor's Templates (read only, from `DREAMCUT_CLOUD_URL`) | Built |
| Share recipe from the editor (Templates → one of your templates → Share with DreamCut) | Built; checked against a contract mock, not the live site |
| Moderation page, abandoned-draft cleanup | Not started |
| Hosted style, account-linked evidence, manual retros | Built: editor and Cloud (migration `20261012053704_account_style_sync` applied, site live); not yet tried with a real sign-in ([hosted style and cloud learning](cloud-style-and-learning.md)) |
| Google sign-in | Deferred |

## Open questions

- Pack sizes (launch: $10 → 5,000, $25 → 13,000, $50 → 27,500 credits).
- `pg_net` sits in the `public` schema (advisor warning); moving it was declined for now.
