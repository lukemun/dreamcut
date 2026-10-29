# platform-video-delivery — evolution log

## Purpose
Prepare and quality-check a video for a delivery format, then close out with a retrospective. Scope: format readiness (aspect ratio, safe areas, duration, caption readability, audio peaks, end-frame hold), export variants that differ only by the named change, and the mandatory delivery retrospective in project Memory. Rendering is a separate delivery step, never implied. Good looks like: a full-timeline QC pass (no black frames, clipped text, missing media, caption drift, or abrupt audio boundaries); variants verified to differ only as requested; every export ending with a retro — "no new lesson" recorded honestly rather than inventing one.

## 2026-09-19 — Updated: organic safe areas now resolve to the measured platform template

**Observation:** Real organic Reels uploads were losing top and right-side content after upload even though exports were clean 9:16 and QC passed. `safeAreaFor` gave organic projects a 5% graphics-safe fallback (top 96px) instead of the measured Reels template (top 270px, bottom 672px, plus the action rail), so the delivery check blessed content Instagram's own UI then covered. The check failed its purpose: "ready for the platform" was not actually true.

**Change:** `src/lib/qc/standards.ts`: organic and paid-ad now resolve to the same measured platform template (the templates measure player chrome, identical on organic; the ad-only CTA cluster makes the template more conservative at the bottom, the safe failure direction). Added the Reels action rail (193px right clearance below 44.8% frame height) that Meta's template does not model. Rewrote the 4 tests in `check-timeline.test.ts` that encoded the old lenient-organic behavior. Skill text now cites the concrete Reels box; new human-readable standard at `docs/standards/vertical-video-safe-zones.md`.

**Verification:** tests rewritten against the new geometry; not yet run (no shell on this machine). Human must run `pnpm test` and the typecheck.

## 2026-09-29 — Updated: compact export handoff delegates to the skill

- **Observation:** The copied export prompt repeated render, verification and retrospective instructions despite already naming this skill. The creator explicitly requested a skill-owned workflow.
- **Decision:** Keep project/format/mute inputs in the handoff; centralize ordered execution, tracked-job reuse, verification and retro status handling here. Preserve explicit export authorization and opt-outs. A skill invocation does not itself execute software.
- **Verification:** Handoff argument/empty-input tests and skill discovery checks; no project export authorized or performed for this change. End-to-end delivery remains unexercised by this change.

## 2026-09-30 — Updated: capture benchmark candidates during enabled retros

- **Observation:** Creator requested a gradual tool-use benchmark sourced from real videos
  while editor capability development continues separately.
- **Decision:** Route to editing-eval-curation for zero to three candidates; preserve opt-outs,
  delivery completion and separate model-run authorization. Automatic worker integration
  remains implementation work.
- **Verification:** Skill purpose/discovery and link checks; written workflow walkthrough.
  No export, retrospective worker or model evaluation was executed for this change.

## 2026-09-30 — Updated: chat-only tool candidates from captured activity

- **Observation:** The creator requested that delivery retros identify work done outside
  app tools as candidates for future tool-only agents, keeping these findings in chat
  and out of the editor UI.
- **Decision:** Add a scoped activity review after completed exports. A local helper
  freezes explicitly selected calls/results against the export checkpoint; the delivery
  agent compares existing capabilities and surfaces zero to three candidates in chat.
  Preserve learning/retro opt-outs, original checkpoints, app findings and delivery
  success. Candidate discussion does not authorize implementation.
- **Verification:** Nine tests passed covering helper gates, missing/ambiguous evidence,
  late-result packet identity, isolated CLI persistence/idempotence, skill discovery and
  export handoff. Representative walkthrough: a delivered edit with a mask-repair script
  selects relevant calls and checks the catalog; unrelated feature development is excluded;
  absent capture reports insufficient evidence. These walkthroughs are not a model-quality
  evaluation. No real export or retrospective worker was run for this change.

## 2026-09-30 — Updated: delegate tool review to its independent owner

- **Observation:** Creator wants tool-candidate review outside delivery as well.
- **Decision:** Delivery invokes the standalone tool-candidate-review skill in export mode;
  its own export/opt-out gates stay intact. The procedure and contract have independent owners.
- **Verification:** Skill discovery, helper mode tests and link checks; no export performed.

## 2026-09-30 — Updated: delivery invokes independently owned reviews

- **Observation:** Creator wants outcomes, efficiency, tools, skills, styles and My Style
  reviewable independently; delivery is merely a useful time to consider them.
- **Decision:** Reference learning-review for evidence-supported tracks, reuse existing
  editorial findings and preserve opt-outs. Do not execute every review or create new UI.
- **Verification:** Skill discovery/catalog exclusion and link checks; written routing
  walkthroughs. No actual video delivery, worker run or learning adoption performed.

## 2026-10-10 — Updated: the editor exports directly; chat requests remain supported

- **Observation:** The creator called the copied export prompt legacy and asked for a conventional export dialog.
- **Decision:** The Export dialog now starts the tracked render itself and no longer produces a chat request. This skill's workflow applies to export requests made in chat, with lane sets defaulting to the project's saved state. Authorization and opt-outs are unchanged.
- **Verification:** Dialog opened in the running editor at desktop and phone widths; no project export was run for this change.

## 2026-10-28 — Updated: Standard is the default for YouTube and social; HDR only for mostly-HDR footage

- **Observation:** A screen-recording tutorial with one iPhone HLG clip, exported as HDR (10-bit HLG) and
  published to YouTube, looked dim and grey on an HDR Mac; the Standard export of the same cut looked right.
  The Export dialog labelled HDR "brighter on YouTube and phones" and the pipeline called HDR "for HDR
  platforms such as YouTube".
- **Decision:** HDR keeps BT.2408 placement (SDR white at HLG 75%). Measured on a synthetic HLG wedge:
  macOS Core Image shows HLG 75% at UI white only with ≥3× EDR headroom (0.89 at 2×, 0.50 with none);
  Chrome 152's SDR tone-map also gives 0.50 linear. A brighter SDR placement is not a standard choice and
  would glare on capable screens. Standard is the default for YouTube and social; the dialog and the render
  API warn when HDR is picked for a timeline that is not mostly HDR camera footage (`src/lib/render/dynamic-range.ts`).
- **Verification:** `dynamic-range.test.ts`, `hdr-encode.test.ts`; wedge measurements in the HDR export
  section of `docs/architecture/playback-rendering.md`. No project was exported.
