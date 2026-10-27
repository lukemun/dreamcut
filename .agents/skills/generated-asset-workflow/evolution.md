# generated-asset-workflow — evolution log

## Purpose

Turn creator feedback into an accepted, usable generated asset with as few creator
turns and paid attempts as practical. Prepare references, stage visibly, and inspect
each result against a persistent shot contract; preserve accepted decisions, candidates
and authorization across revisions. Success means the creator accepts a result that
meets the material shot requirements at the intended quality, with unnecessary retries
avoided. Timeline approval remains a separate workflow.

## 2026-10-01 — Updated: verify fixed framing after regeneration

- **Observation:** A higher-resolution portrait motion candidate retained the requested
  pose and softer movement but introduced a progressive push-in. The original prompt
  already requested locked framing; all-frame inspection detected the regression and
  the creator rejected it. The procedure required checking every criterion but did not
  name subject-size and crop comparisons for this common failure.
- **Decision:** Made first/intermediate/final framing comparisons explicit in result
  review, while retaining full-speed playback and separate subject-motion assessment.
  Prompt craft owns the corresponding fixed-camera wording; this workflow owns evidence.
- **Verification:** Reviewed the baseline request and consecutive-frame evidence in a
  private project-local packet. Skill discovery checks and written fixed-framing,
  intentional-approach and missing-playback walkthroughs validate the instruction path.
  No new generation was submitted during this review; better compliance and fewer
  retries have not been demonstrated.

## 2026-09-30 — Updated: keep accepted motion while correcting one defect

- **Observation:** In the ball-toss shot, a closer-apex revision made the Post-it larger
  than the ball. The first size correction retained language demanding a fully visible
  square at the peak, and the output stayed too large. A miniature-sticker rewrite fixed
  size, but the hand stayed in contact with the ball. A release-specific revision restored
  the airborne gap; a 1080p seam-continuity pass was then creator-accepted. The five
  attempts from the closer-apex candidate through acceptance had $0.45 in generation
  estimates. See the project-local asset-generation retro for job IDs and limits.
- **Decision:** Clarified the Purpose around creator acceptance, turn count and paid
  attempts. Added a compact carried shot contract and a pre-spend check that the new
  wording resolves the identified failure without discarding accepted features. This
  sharpens the existing small-revision workflow; it does not assume a particular model
  will obey a phrase or make low resolution a universal rule.
- **Verification:** Compared the five saved prompts, generation receipts and reviewed
  outputs; the final 1080p asset was accepted by the creator and kept in Library. Skill
  discovery tests pass. The revised procedure itself has not yet been tested on a new
  generation series, so reduced turns and cost remain an outcome to measure.

## 2026-09-28 — Updated: visible submission and model continuity

- **Observation:** The Hungarian flag quality pass switched from Kling Standard to
  Pro and regressed into unnatural torque. A subsequent retry was submitted through
  the API. The creator explicitly requested H3 as their default and submission through
  the visible generation UX; direction is recorded in project memory event
  `feedback:d358271fc14e8e48b2f8b2bc48d153468edce1de820c4526f21072a962880e74`.
- **Decision:** Strengthened the canonical visible-generation standard and linked
  execution procedure: expose the composer, verify its request, submit through Generate,
  and report a UI blocker before an alternative path. Preserve the selected model
  during quality promotion. H3 is this creator's direction, not a universal model rule.
- **Verification:** Verified the staged H3 prompt, start/end references, five-second
  duration and 480P setting in the live composer. This verifies staging, not successful
  generation or natural motion.

## 2026-09-27 — Updated: generation iteration workflow

- **Observation:** In the Budapest window-return session, prompt-only edits repeatedly
  traded one defect for another: aircraft entry, sideways cabin travel, passenger
  direction and pacing. The agent lengthened a requested five-second shot, introduced
  a reference/split approach the creator rejected, and initially judged motion from
  sparse frames. Even later all-frame checks did not establish full-speed playback.
  The creator requested a local skill for this complete process and authorized automatic
  1080p generation only after inspection passed.
- **Decision:** Added a workflow separate from prompt craft, with explicit shot criteria,
  model-aware references, visible staging, draft quality, honest playback/frame evidence,
  small revisions, preserved user choices and reinspection after quality regeneration.
  Automatic promotion is conditional on session authorization, not a universal permission.
  Added Guide discovery and links from prompt-authoring and recreate-effect.
- **Verification:** Repository purpose/catalog tests and local link checks; routing
  walkthroughs for a complete generated shot, prompt-only request, missing reference,
  rejected approach and high-resolution regression. These are documentation/discovery
  checks, not a fresh execution trial or proof the prior flight shot was physically exact.

## 2026-09-27 — Updated: ready-to-play handoff

- **Observation:** Two Budapest camera-catch drafts were registered in Results, but
  the creator still had to ask the agent to open them. Reporting completion alone
  left avoidable navigation between generation and review.
- **Decision:** Require the agent to open Results, expose the new original outputs,
  and verify loaded, paused playback with controls visible before closing the turn.
  Keep multiple takes accessible and preserve the browser deliverable. This is an
  agent handoff procedure, not a claim of automatic UI navigation on job completion.
- **Verification:** Exercised the handoff on the two camera-catch drafts in the
  project Results panel; checked output bindings and player readiness in the browser.
  Repository skill-purpose and catalog checks cover continued discovery.

## 2026-10-12 — Credits-only generation and chat approval

- **Observation:** The creator removed bring-your-own provider keys; generation now spends
  DreamCut credits, and agents previously had no supported way to act on a spoken "yes".
- **Decision:** Stage with `asset_generation_prepare` (price, sign-in and balance come back);
  generate only on the Generate click or explicit chat approval via `asset_generation_submit`
  with the creator's words. A changed form is shown again before submitting.
- **Verification:** Unit tests with mocked Cloud responses cover refusals, idempotent resubmit
  and the click/chat overlap. No live paid generation was run.

## 2026-10-13 — Windows on video and audio references

- **Observation:** Recast, motion copy, video edit and reference-video models take video and
  audio inputs priced by length, so sending a whole file would overcharge and break limits.
- **Decision:** Each video or audio reference carries a `window`; choose it from evidence
  (shot cuts, words, beats). Only that part is sent and priced; recast and edit models return
  a clip of the same length and shape.
- **Verification:** Unit tests cover window pricing, limits and the trim-and-upload worker
  against mocked Cloud responses. No live paid generation was run.

## 2026-10-13 — One numbered Images list for image models

- **Evidence:** The creator found "Image to edit" versus "Add reference" confusing. For Nano
  Banana the roles never reached the provider (every reference is sent as `image_urls`), so the
  form showed a distinction that did not exist.
- **Change:** Nano Banana and GPT Image show one **Images** list (Image 1, Image 2…); the prompt
  says what each image is for. GPT Image with any attached image is an edit, and its Codex
  handoff numbers the images. Models whose slots matter keep them.
- **Verification:** Unit tests (pooled roles, Nano payload, Codex task rule), `check:editor-ui`,
  typecheck, and a browser pass on a throwaway project: list, add from Library ("Choose the
  image"), remove and renumber, switch to Kontext. Independent fresh-eyes check not run.

## 2026-10-22 — Chat-first generation with quality defaults and per-model prompt guides

- **Evidence:** The creator wants DreamCut to be the generator an agent picks for "make an
  image/video" in chat, comparable to Higgsfield's MCP and skills, with quality-first models and
  prompt guidance owned by DreamCut, not Cloud.
- **Change:** One-off requests use `generate_media` (draft, show model and price, generate on
  chat approval of that price). Quality defaults and a short guide per model live in
  `src/lib/generation/model-guides.ts` and also feed `asset_generation_prepare` and the prompt
  writer. Low-cost draft quality now applies to iteration inside a project.
- **Verification:** Unit test and a stdio MCP probe on a disposable library (see the
  media-intake-generation evolution record). No paid generation was run.

## 2026-10-23 — Generation requests open the Generate drawer

- **Evidence:** The creator wants a generation request to show the drafted prompt and the
  recommended model and settings in DreamCut's Generate drawer, not only in chat.
- **Change:** `generate_media` drafts fill the Generate form and return `review_url`; the creator
  generates with Generate or by approving in chat. `asset_generation_prepare` is for fields
  `generate_media` does not set, or revising a draft already in the form.
- **Verification:** Unit test (see the media-intake-generation evolution record). No paid
  generation was run.

## 2026-10-23 — Codex image route removed

- **Evidence:** The creator wants all generation through DreamCut models; an agent's own image
  tool is outside DreamCut and used only when the user tells that agent directly.
- **Change:** The skill no longer offers the Codex image route; `generate_media` is always the
  starting point and drafts by default.
- **Verification:** Unit tests and typecheck (see the media-intake-generation evolution record).

## 2026-10-27 — A selected Look or Template is not a generation request

- **Observation:** In session retro docs/audits/2026-10-27-proof-look-walking-man-retro.md (git-ignored), a "create a guy walking" request made with the Proof
  look selected was drafted as a Seedance video. The owner: "No, don't use generation. Draw it
  with the look I selected."
- **Decision:** Updated. Step 3 says a request made with a Look or Template selected, or one to
  draw or build the thing, goes to that skill, not `generate_media`. The same rule is in
  AGENTS.md "Visible generation drafts" and the timeline-editor MCP instructions.
- **Verification:** Text only. No model eval; first-attempt routing is unmeasured.
