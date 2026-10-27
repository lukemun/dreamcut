# video-compositing — evolution log

## 2026-09-27 — Renamed mask-sequence entry point

- **Observation:** Pop-in white flash was expanded into Mask Glitch and consecutive
  mask handoffs by explicit creator request.
- **Decision:** Route named mask sequences to mask-glitch; retain general alpha
  preparation and composition here.
- **Verification:** Relative links and repository skill discovery checked.

## Purpose
Combine layered media into a coherent, legible, revisable picture. Scope: layer order, crops, masks, keys, blending and supported effects; spatial arrangement and editorial timing coordinate with their specialist skills. Good looks like: intentional overlaps, clean edges, preserved essential content, predictable preview/export, and independently adjustable actors. Supported implementation controls remain defined by the skill and contracts, not by this purpose statement.

## 2026-09-19
- **Observation:** The purpose narrowed all compositing to effect graphs, unlike the skill's broader layering, masking and crop remit.
- **Decision:** Updated the yardstick to describe outcomes and scope without inventing a graph-only restriction.
- **Verification:** Compared the complete SKILL.md against the purpose; retained its supported-control and proposal requirements.

## 2026-09-26 — Reusable object extraction

- **Observation:** The bird transition used generated instance masks and original
  photo RGB, but the extraction and cleanup procedure remained project-local. The
  creator asked to finish the skill and include alternatives to generation.
- **Decision:** Added a linked procedure covering supplied alpha, manual masks,
  compatible segmentation, and optional generated masks; source registration,
  bounded cleanup, separate actors, white silhouettes, timing, and receipts.
  Marked the existing SAM 2 route as video-oriented, with still support unverified.
- **Verification:** Grounded the procedure in the inspected bird prototype and local
  cutout implementation. Skill purpose/discovery and relative-link checks passed.
  No alternate mask method or second asset set was executed during documentation.

## 2026-09-27 — Named effect entry point

- **Observation:** The creator requested a dedicated Pop-in white flash invocation instead of a broad compositing prompt.
- **Decision:** Updated: link the named skill; retain mask and layering construction here. User authorized this routing addition.
- **Verification:** Named-effect, neighboring general-overlay, and missing-input routing walkthrough; no new media execution.

## 2026-09-27 — Effect recipe packaging
- **Observation:** Reference analysis and successful recreation were not distinguished in catalog data.
- **Decision:** Link versioned evidence receipts with explicit candidate/partial/complete status.
- **Verification:** Catalog validation checks media hashes and both ownership links; recorded limitations remain unresolved.

## 2026-09-28
- **Observation:** Scope colour and brightness effects to the intended actors and beats, then verify at representative frames that embedded and reveal layers retain their independently intended colour. Evidence: feedback:cb91e684ec27c86a10cc159e1e982cf75e8bf6d0d5879c5b37ac5f6b8ec6c03a, 20260928T202411-59bf556d, 2026-09-28T20-27-22-540Z-editor_agent_workshop.json, history:2026-09-28T20-27-22-571Z-editor_agent_workshop_applied.json.
- **Decision:** Updated — Approved Memory improvement `e771768935254ec244a5e4100a964fc59a0809eb0c507c8c3d7c9113123c7a7d` from retros `4e190376-c022-4d7e-8da8-5fcd5107e08e`. Reconciled candidates: e771768935254ec244a5e4100a964fc59a0809eb0c507c8c3d7c9113123c7a7d.
- **Verification:** Human-approved instruction incorporated once; operational verification remains required when applying the skill to an edit.


## 2026-09-28 — Continuous source with timed effects

- **Observation:** In the sunglasses sky-portal session, the negative treatment was
  baked into `negative.webm` and handed off to `subject.webm`. The creator reported
  a visible jump and explicitly requested one clip with effects as the standard,
  then authorized recording and strengthening enforcement of this lesson.
- **Evidence:** The private sunglasses sky-portal project, negative element
  `fd6c588d-b8ec-422a-b781-76036b1e7ef1` and normal element
  `5e6488ce-020e-48bf-9f8d-5f065d5e4a82`; inspected boundary at 1.00s.
  Matching-frame alpha hashes were identical at frames 29 and 30. Rendered stills
  showed a treatment change without a framing mismatch; browser hitch remained
  unverified. These local project references are evidence, not workflow dependencies.
- **Inference:** Baking the negative introduced an unnecessary media handoff and
  removed native inversion tunability. It is not proven to have caused a playback hitch.
- **Decision:** Link the shared continuous-source gate at the skill entry point.
  Require source/interval/control evidence and justification for derivatives/cuts;
  reject unexplained effect-only cuts during review. Missing native inversion remains
  a capability gap. No timeline change or new export is part of this rule update.
- **Verification:** Written walkthrough: a timed negative keeps one clip; an actual
  take change may cut; a background/lens insert stays a separate actor; unavailable
  inversion is reported before construction. Runtime rejection of arbitrary baked
  actor substitutions is not implemented by this instruction change.

## 2026-09-29
- **Observation:** Moving-mask preparation needed a general discoverable owner alongside still extraction.
- **Decision:** Linked the new rotoscope workflow; existing compositing and proposal authority remain unchanged.
- **Verification:** Link and catalog checks passed; no runtime behavior changed.

## 2026-09-30
- **Observation:** Use the current approved graded source as color authority for its derivatives, and verify every plate, cutout, mask-context layer, and replacement shot matches it at representative reveal and settled frames. Evidence: feedback:f451426baf2d8d1de7fa9c8026e15208d2efdbe3663a41ff8b09aa50b3e36663, 20260930T221424-018a9f99, 22b8a8a3-aa49-41aa-ab8b-7b2b5e0a0598.
- **Decision:** Updated — Approved Memory improvement `a3cd54bfce6fadecc9c57e7999180ce1e3225132dc7ecf1115b85c167f2e63ee` from retros `5131ecaf-5df4-4c9c-8556-841a291ff8c1`. Reconciled candidates: a3cd54bfce6fadecc9c57e7999180ce1e3225132dc7ecf1115b85c167f2e63ee.
- **Verification:** Human-approved instruction incorporated once; operational verification remains required when applying the skill to an edit.

## 2026-10-14 — Templates from @nvision.media recreations

- **Observation:** Effects recreated from a @willrvail breakdown of an @nvision.media video were worth reusing as Templates; smaller transitions (wipe, layer crossfade, slow-motion breather, handheld, closer) were not distinct enough.
- **Decision:** Package each kept effect as a template page under `templates/`, linked from Packaged templates, with a Properties → Templates card and Pexels teaching media built from demo proposal previews.
- **Verification:** Each template ran on two input sets in its own demo project (proposals only, none approved); entrance, peak and settled frames were checked with `pnpm frame-state --proposal-file` and GPU preview renders. Limits are listed on each page.

## 2026-10-14 — Speed Entrance & Exit and Moving Grid Matte templates

- **Observation:** Both shared templates had construction briefs but no template page or public demonstration.
- **Decision:** Add `templates/speed-entrance-exit.md` and `templates/moving-grid-matte.md` with Pexels teaching media from demo proposal previews; the promoted cards now route to this skill.
- **Verification:** One input set each (`tpl-speed-entrance-demo`, `tpl-grid-matte-demo`), proposals only, none approved; entrance, settled and exit frames (speed) and cell coverage across the clip (grid) checked in GPU preview renders. Reuse on a second input set is not yet run.
