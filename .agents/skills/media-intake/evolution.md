# media-intake — evolution log

## Purpose
Turn supplied files or folders into correctly routed, durable, annotated assets with explicit per-file readiness. Scope: destination selection, import, preparation and annotation coordination; importing does not authorize timeline placement. Good looks like: originals preserved, suitable preparation selected by actual content and intended use, and missing analysis or unsupported inputs reported rather than treated as ready.

## 2026-09-19
- **Observation:** User requested one router for first-time and subsequent file imports; managed import and proxy preparation did not guarantee annotation or editorial readiness.
- **Decision:** Add a default, file-role-based intake router with existing-project, new-assembly, and library branches. Keep preparation, annotation, and placement distinct and retain per-input failures and unsupported formats.
- **Verification:** Inspected import/preparation and analysis routes; checked skill links and frontmatter. Reviewed mixed-folder, new-assembly, existing-project, and unsupported-input routing without importing user media.

## 2026-09-23
- **Observation:** In the Scratchpad generation workflow, Library showed opaque names such as `pose-08.png`; the user explicitly requested readable names as part of intake.
- **Decision:** Updated intake to require inspected display names and concise descriptions in canonical metadata, preserving original filenames and source identity. Missing inspection is pending, not guessed completion. No timeline or routing permissions changed.
- **Verification:** Inspected the existing library annotation schema and card rendering; visually reviewed the eight-stage pose contact sheet against its derivative receipt and added source-bound metadata for that sequence.

## 2026-09-24

- **Observation:** Retiring the Social Content workspace brought pre-edit visual collections into DreamCut's ignored local data tree; those collections need cataloging without an editor project.
- **Decision:** Route a pre-edit visual collection to the new `media-annotation` skill while preserving project import and readiness boundaries.
- **Verification:** Compared the new skill with existing `media-intake` and `media-pull` responsibilities; checked the route names and paths.

## 2026-09-26 — Actionable effect intake

- **Observation:** The creator requested required inputs and a easiest-first ranking for
  every effect identified in the reference; a visual inventory alone left the next
  creation step underspecified.
- **Decision:** Route effect references explicitly from intake and record input availability,
  preparation, craft ownership and implementation gaps during analysis. Recreate-effect
  owns the worksheet and ranking; repeated methods share procedures.
- **Verification:** Applied the worksheet to all 20 reference entries; performed a local
  code audit, skill discovery/purpose checks and relative-link checks. This is a planning
  walkthrough, not a completed effect implementation or runtime visual proof.

## 2026-09-30 — reusable cutout preparation

- **Observation:** Repeated mask preparation and local repair scripts delayed proposals;
  a convincing flash did not establish the quality of the settled composite.
- **Decision:** Route requested masks through cached preparation/status and immutable
  correction tools. Keep import authority unchanged and check one settled treatment
  before expanding a new sequence.
- **Verification:** Synthetic correction/cache/source-image tests exercise tool mechanics.
  Skill routing was checked for requested cutouts, import-only requests and missing
  prompt evidence. This does not establish a real-footage quality or speed improvement.

## 2026-10-01 — configurable visual analysis routing

- **Observation:** The creator requested a shared routing workflow for technical preparation, descriptions and detailed effect inspection, with configurable VLM tool use and retained observations.
- **Decision:** Extend the existing media-intake router; replace blanket one-second catalog sampling with purpose-specific bounded selection and explicit coverage. Link the new visual-analysis tool while preserving the project/non-project boundary, source clocks and separate readiness states. Local inference is not treated as free of time or resource limits.
- **Verification:** Runtime tests and practical synthetic-tool evidence are recorded in the visual-analysis architecture. Skill discovery/link checks and representative routing walkthroughs are recorded there; they are not proof of creative quality or exhaustive footage coverage.


## 2026-10-02 — Reference and revision continuity (Updated)

- **Observation:** Partial reference extraction and rebuilding tuned drafts cause repeated corrections.
- **Decision:** Route full references through video-reference-analysis; bounded effects share its structured record. Proposal revisions use the saved tuned baseline and combined preview before handoff.
- **Verification:** Focused schema, proposal and tool checks exercise the new paths; no whole-session speedup or visual equivalence is claimed.

## 2026-10-09
- **Observation:** Record creator identity corrections as authoritative canonical metadata and check that corrected identity before any later placement naming the subject. Evidence: feedback:085ab4ca37e2d48ef2cd11a8cc8d1d77f4000be07f2f2c240eade0c1f0ac39fa, feedback-disposition:89ace957a0a994686946f3ae011c56c75f5a978b837ed0ac59c136361d1cf9af, c7816b8a-aef7-40e1-bf8a-5593ad168915.
- **Decision:** Updated — Approved Memory improvement `75f06dbb1e4202aebb9d38f029bf4340714ca308727ec64b83ae43cf5e244cc2` from retros `d688c0da-57f9-4922-a249-9a2bbddd9e10`. Reconciled candidates: 75f06dbb1e4202aebb9d38f029bf4340714ca308727ec64b83ae43cf5e244cc2.
- **Verification:** Human-approved instruction incorporated once; operational verification remains required when applying the skill to an edit.

## 2026-10-12 — files supplied with a template request

The creator copies a one-line request from Templates ("Use the Mask Glitch template
with my footage in project …") and drops their files into Claude Code. Added the route:
resolve the template by name, import the files, map them to the template's inputs,
ask only on ambiguity, then propose. Copied requests no longer carry recipe IDs or
construction steps, so name lookup is the expected path.

## 2026-10-17 — templates arrive as a selection

The creator now selects a template card instead of copying a request (creator direction:
copying is an anti-pattern; select it, then talk). The route reads the selected Template
item (`template:<…>` id) from the editor selection and `get`s its brief; title search stays
for templates named only in words.

## 2026-10-27 — Measure a long preparation and say so

In a tutorial-editing session a 21-minute 4K HLG phone clip spent over 55 minutes in preview preparation. The
agent told the creator "a few more minutes" at 00:33 without measuring, polled the job by reading
`preprocess/` JSON in shell loops (one loop stopped early on a read error), and only offered a
smaller copy after the creator asked twice ("status?", "Where is the phone video?") and then
proposed it ("We should never be using the full 4K copy"). The slow path itself was fixed in the
product the same day (fast HDR preview proxy, full-quality copy deferred to export). This entry
adds the agent side: wait through `media_readiness`, measure and report a real estimate, offer
what can proceed, and keep analysis off full-resolution 4K decodes. Not yet run by a fresh agent.

## 2026-10-31 — Reuse stopped-action observations from intake

- **Observation:** A verbal request to clone each stopped walking position should not require manually supplied timestamps or repeat source inspection at construction time.
- **Decision:** Route useful action windows to media-annotation; preserve source clocks, normal-speed handles, position, confidence and coverage in supported source-hash descriptions. Explicit marks remain optional; no automatic detector or new interval schema is claimed.
- **Verification:** Inspected media_describe plan/record validation, source-hash persistence, visual-analysis and analysis annotation schemas. Both skill-purpose/catalog tests and changed instruction links passed. A source-only disposable trial inspected 49 planned samples plus denser candidate samples and saved provisional action windows through media_describe; it did not inspect motion playback, certify live handles, or test an end-to-end effect from verbal input.
