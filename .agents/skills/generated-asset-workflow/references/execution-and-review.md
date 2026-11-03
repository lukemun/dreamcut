# Execution and review reference

Check current code before using these entry points; this document is not a second schema.

- MCP catalog: `node mcp/server.mjs --catalog`. `asset_generation_prepare` stages a
  draft, opens the Generate form and returns the price in credits plus a
  `generation_check` (ready, sign_in, buy_credits, model_unavailable, incomplete); it
  does not upload, submit or charge.
- Draft and model authorities: [assets.ts](../../../../src/lib/generation/assets.ts)
  and [asset-models.ts](../../../../src/lib/generation/asset-models.ts). DreamCut models
  (route `fal`) run through DreamCut Cloud with the creator's credits; only Cloud catalog
  models can be generated ([cloud-generation.ts](../../../../src/lib/generation/cloud-generation.ts)).
- Generation happens when the creator clicks Generate, or after they explicitly approve the
  staged draft in chat: `asset_generation_submit` with the `staged_id` and their verbatim
  words. It generates exactly the draft in the form and refuses, without charging, on
  `approval_required`, `stale_draft`, `draft_changed` (show the returned draft and price,
  ask again), `not_viewed`, `sign_in` or `buy_credits`. Repeating it returns the same job.
  The local `POST /api/projects/<projectId>/asset-generation` route is the button's
  implementation, not an agent route.
- Nano Banana and GPT Image read every attached picture alike: the form lists them as
  Image 1, Image 2… in reference order, and the prompt says what each is for ("keep the
  face from Image 1"). Roles only matter for slot models (Kontext's image to edit, video
  frames, recast sources, Seedance `@Image` references).
- See results with `asset_generation_status` (job id from submit, or the latest request):
  it waits up to 120 s, returns each output as an actual image in chat (a video as three
  frames) and the Generate › Results `review_url` to open for the creator. It is a preview,
  not playback review. The raw job is at `GET /api/projects/<projectId>/asset-generation/<jobId>`.
  The [job route](../../../../src/app/api/projects/[projectId]/asset-generation/[jobId]/route.ts)
  owns keep, cancel and resume semantics. Cancellation is best effort;
  inspect status and report if the request already completed.
- Provider jobs and references are recorded under `preprocess/asset-generation/`;
  generated outputs live under `media/.generation/`. Use returned paths and hashes.
- Asset generation routes never authorize timeline edits. Use the proposal contract
  for placement, retiming and replacement.

## Review receipt

Store a concise project-local analysis record, beside other shot preparation evidence.
No private project paths are prerequisites for this skill. Suggested fields:

```text
Shot and intended use:
Requirements and user-approved deviations:
Candidate job/output/hash; parent attempt:
Prompt/settings/reference roles; change from parent:
Price in credits, approval record and submission status:
Actual dimensions, fps, duration:
Playback reviewed: original/proxy, speed, interval, audio, limitations
Frame evidence: source timestamps/frame range and contact-sheet mapping
Criterion → pass/fail/uncertain → observed evidence/time
Decision: retry / ready for creator review / accepted / promote / regression
Next action and authorization basis:
```

Consecutive-frame contact sheets must retain frame ordering and coverage, including
final partial sheets. Blank tile padding is not a black frame in the source. A receipt
must distinguish a provider `ready` status from a reviewed pass. If the high-quality
result changes the shot, record both outcomes rather than overwriting the draft decision.
