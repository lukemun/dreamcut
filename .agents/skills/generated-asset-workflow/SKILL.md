---
name: generated-asset-workflow
description: Prepare references, stage image or video generation, inspect drafts, revise failed attempts, and promote accepted assets to delivery quality in DreamCut. Use for iterative generated-asset work, including multi-shot continuity; prompt-only writing belongs to prompt-authoring and timeline application belongs to dreamcut-proposals.
---

# Generate and refine an asset

Deliver media that matches the creator's direction, with inspectable prompts,
references, settings and review evidence. A completed provider job is a candidate,
not proof that the shot works. Aim for creator acceptance with the fewest useful
review turns and paid attempts; economy cannot replace checking the shot.

Read [prompt-authoring](../prompt-authoring/SKILL.md) and its
[generation direction](../prompt-authoring/references/generation-direction.md).
Follow [AGENTS.md](../../../AGENTS.md) for feedback capture, preferences and timeline
authority. Use [media-intake](../media-intake/SKILL.md) for supplied files and
[recreate-effect](../recreate-effect/SKILL.md) when deciding between generation and
an editable editor effect. This workflow does not require generation for native effects.

## 1. Establish the shot contract

Read existing project direction and applicable preferences. Record material feedback
before responding with work. Separate explicit requirements from assumptions.

Identify the input assets, output role, aspect ratio, duration, sound, model constraints,
quality target and authorization. Define observable acceptance criteria before spending:
what is on screen, what moves, where it starts and ends, how long each beat lasts,
what must stay fixed, and which defects make the result unusable.
Carry a short shot contract across revisions: accepted features, current failure,
and the next candidate's one intended difference. Use existing feedback and results
instead of asking the creator to restate a decision already made.

For camera moves, distinguish camera translation from rotation and subject motion.
State the subject's orientation independently of the lens. For example, passengers
face the aircraft nose while a camera crosses the fuselage: they appear in profile.
Measure timing against the requested edit, not just the provider's duration choices.
Do not lengthen a requested five-second result into a ten-second scene to make it easier.
If a longer source is needed, explain the source-to-final timing and verify the retimed result.

## 2. Inspect and prepare the inputs

Inventory existing assets before generating replacements. Inspect actual reference
pixels; filenames, prompts and annotations alone do not establish appearance.
Assign each reference its supported role and verify framing, orientation, identity,
lighting and start/end compatibility. Preserve original media and derivative provenance.
For adjoining clips, prefer the actual prior result's ending frame when appropriate;
record its source and extraction time/frame. An intended end reference may differ
from the generated ending.

Respect the selected model's reference limits. Do not describe extra images as attached
when the route accepts only start/end frames. For a video or audio reference, choose the
`window` to send from evidence (shot cuts, words, beats): only that part is uploaded and
priced, and recast or edit models return a clip of the same length and shape. New references, a different model, or a
split sequence are choices, not mandatory fixes. Honor a user's instruction to keep
original references and revise only the prompt. Avoid silently changing the approach.

## 3. Stage visibly, then generate

A request made with a Look or Template selected, or one to draw or build the thing, is not
a generation request: build it through that look's or template's skill. Any other new
request ("make an image of…", "generate a video of…") starts with `generate_media`:
draft it, rewrite the prompt by the returned `prompt_guide` and draft again, open the
returned `review_url` so the creator sees the prompt, model and settings in the Generate
form, and tell them the model and price. It picks the best-quality model and its settings
for the inputs unless the user names one. The creator generates by clicking Generate, or
by approving that price in chat (then call it again with their words). DreamCut does not
route generation through an agent's own image tool. Use
`asset_generation_prepare` below when the draft needs fields `generate_media` does not
set, or to revise a draft already in the form.

Inspect the current [integration entry points](references/execution-and-review.md).
Use `asset_generation_prepare` to put the full draft in the visible Generate form before
submitting: prompt, intent, model, references, duration, resolution, sound and settings.
It opens the form for the creator and returns the price in credits and whether they can
generate now. Use the current returned price; never carry historical prices into a new
request. If the check says `sign_in`, tell the creator the form offers Sign in or create
account; if `buy_credits`, give the price and balance and point them to Buy credits.
Verify the staged form shows the intended prompt, model, references and settings, then
stop. Generate only when the creator clicks Generate, or explicitly approves this draft
and price in chat: then call `asset_generation_submit` with their exact words. Apply the
canonical [visible-generation boundary](../../../AGENTS.md#visible-generation-drafts).
Do not infer approval from the original creative request, and do not use browser
or HTTP/provider calls to bypass review. Revisions require review of the changed draft;
a `draft_changed` refusal means show the returned draft and price and ask again.

When iterating inside a project, use the lowest supported useful draft quality while
solving motion or composition, unless the user directs otherwise. Preserve the approved prompt and settings. Do not
silently change prompt expansion, duration, model or reference roles during a quality pass.
Retain the job ID. An unconfirmed (uncertain) request is checked again under the same
request id, which never charges twice; do not stage a duplicate to retry it.

## 4. Inspect the result, not the prompt

Inspect the original output, not a timeline proxy. Play the complete video at intended
speed to assess pacing, camera path, cuts, morphing and continuity. Then examine frames
around every transition, occlusion, entrance, exit and suspected defect. For short,
complex camera shots, inspect the full consecutive frame sequence as well. Listen when
sound is part of acceptance. Stills require inspection at useful resolution and in context.

A sparse contact sheet does not establish continuous motion. If tooling only provides
still frames, inspect all needed frames and report that full-motion playback was not
observed; do not say “watched” because playback was merely started. Likewise, all-frame
inspection alone does not establish how the shot feels at speed. Report review limitations
and do not automatically promote when a material criterion remains unverified.

Check every acceptance criterion, including those that previously passed. A correction
can fix passenger orientation while breaking entry, or preserve the endpoint while
inventing a cut. Check dimensions, duration and source identity from the actual file.
For fixed-framing shots, compare the first, intermediate and final frames for subject
size, frame margins and crop drift, alongside full-speed playback. Separate intended
subject motion from camera drift; a prompt saying “locked” is not verification that
the framing stayed fixed. Disclose a failed framing criterion before promotion or
handoff, even when the requested action improved.
Record timestamped findings and a pass, fail or uncertain decision using the
[review receipt](references/execution-and-review.md#review-receipt).

## 5. Revise one identified failure

Compare the candidate with the best prior attempt. Preserve successful requirements;
change the smallest relevant prompt phrase or supported setting. Prefer concise positive
motion descriptions over accumulating repeated prohibitions, capitals and timing claims.
Before another paid attempt, check whether the proposed change actually removes the
conflicting or over-weighted wording that caused the failure. State what should improve,
what must remain, and how the new result will be judged. Review all those features
together afterward; a fixed detail does not justify a retry that breaks the shot.
Separate observation from inferred cause: an unexplained model result is not evidence
that the user's idea is impossible or that a certain prompt rule always works.

After repeated failures, reassess contradictory constraints, references, model capability
and review evidence before paying for another equivalent retry. Explain the changed
hypothesis. Keep the user's chosen approach; if it cannot yet pass, report the specific
unresolved criterion rather than claiming success or forcing a rejected alternative.
Preserve candidates and receipts. User acceptance can override an agent's taste judgment;
record that acceptance and any known remaining deviation without relabeling it as exact.

## 6. Promote and hand off

When the draft passes, stage any delivery-quality generation for human review. A prior
approval does not authorize a new prompt, settings, resolution or provider submission.
A higher-resolution regeneration is a NEW candidate, not a deterministic upscale: it
may change framing, motion, people and joins. Review it against the same contract again.
Retain the accepted draft if the quality pass regresses; do not silently replace it.

Show the result in Results with generation context available. Distinguish generated,
reviewed, creator-accepted, kept in Library, annotated and placed on timeline. Keeping an
asset uses the normal intake path; report annotation readiness separately. Describe
observed content, not desired content, in annotations. Apply assets or speed ramps through
[dreamcut-proposals](../dreamcut-proposals/SKILL.md); generation permission does not
approve timeline mutations. A plan to speed up later is not verified sped-up playback.

Before handing back a completed generation, open the project's generation Results
surface and bring the new output into view. For video or audio, leave the original
output paused at the beginning with playback controls visible and media loaded: the
creator should only need to press Play. For multiple takes, expose the new takes
together where practical and identify their order. Verify the visible player is bound
to the actual new output, not an older result or timeline proxy. Preserve the review
tab as a user-facing deliverable when the browser requires it. This applies to failed
creative attempts too; explain the defect without hiding the candidate. If the editor
cannot present playback, show a playable local artifact and report the UI limitation.
Do not treat opening a player as evidence of having watched or approved the result.

Close with outputs, review outcome, material deviations, credits spent and remaining work.
Account for feedback using the repository closeout contract. Record transferable lessons
in this skill's evolution log; prompt craft belongs to prompt-authoring. New external
prompting guidance goes through [research-deliverable](../research-deliverable/SKILL.md),
then reviewed local instruction changes under the [evolution standard](../../../docs/standards/skill-evolution.md).
Do not claim that this skill automatically fetches the latest lab guidance.
