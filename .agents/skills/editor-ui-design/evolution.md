# editor-ui-design — evolution log

## Purpose

Make new editor capabilities feel like parts of one product. This procedure covers finding a creator task's home, consolidating controls, preserving editing semantics and verifying discoverability across selections and layouts. It succeeds when another contributor can integrate a feature with explicit ownership and reviewable evidence; it does not direct a video edit or certify rendering fidelity.

## 2026-10-07 — Nontechnical creator judge

- **Observation:** The creator requested an independent UX reviewer for older, nontechnical users, identifying media-import discoverability and user-facing documentation as concerns. These concerns are user reports, not a completed usability trial.
- **Decision:** Extended the existing fresh-eyes workflow with a reusable judge brief covering documentation, readability and UI task completion, including importing several videos and selecting a subset. Preserve audience boundaries for developer docs and report missing UI separately from unclear instructions. The user explicitly requested this skill update.
- **Verification:** Routing walkthrough: a Guide/media UX audit uses the judge; a timeline edit continues to use proposals; unavailable browser or independent reviewer yields unverified task completion. These are written walkthroughs, not a live judge trial. Skill discovery and link validation are checked for this documentation change; no runtime judge or UI implementation is added.

## 2026-09-29

- **Observation:** The creator reported increasing Properties fragmentation after the speed-effect integration. Inspection found blur controls mounted under a section excluded by the display-label filter, despite an existing information-architecture standard.
- **Decision:** Added a repository workflow and feature integration standard under the creator's explicit request for a skill, audit and enforcement. Replaced label-based section routing with required stable identities and a tested registry. Broader panel consolidation remains a staged rework, not an accomplished redesign.
- **Verification:** Applied the workflow to the speed control discovery issue. The original test receipt is retained privately; the current component contract is [shared editor controls](../../../docs/standards/editor-controls.md). Matching request: adding an effect dial requires this workflow. Neighbor: changing a video's blur value routes to editorial proposals. Missing app: code audit proceeds with visual evidence marked unavailable. These routing cases are written walkthroughs, not independent agent trials.

## 2026-09-29 — unaided human editing

- **Observation:** The creator explicitly required that a human can understand and tweak an edit without AI assistance, and proposed a fresh agent with only the visual interface as a discoverability check.
- **Decision:** Made human independence a core feature-integration principle. Added an outcome-only, visible-UI acceptance procedure with independent context, disposable fixtures, observable changes and Undo. Clip structure is judged by the editing task rather than a blanket preference for continuous clips or cuts.
- **Verification:** Checked document links and skill-purpose/catalog discovery. No independent visual trial was run for this policy change; existing Properties usability remains unverified against the new criterion.

## 2026-09-29 — keep keyframes in Properties

- **Observation:** The creator rejected the replacement keyframe inspector and Back to Properties navigation. A technically editable single source track did not make the effect's individual moments understandable.
- **Decision:** Keep domains and ordinary controls visible during keyframe inspection; share row actions with blur controls and support the existing offscreen position range. Prepare an atomic source-backed section proposal for the working timeline and use a disposable copy for independent UI testing.
- **Verification:** Seven focused routing/navigation/range checks pass and typecheck passes. Independent visual trial and its limitations are recorded in the Properties cohesion audit; implementation checks alone do not establish usability.

## 2026-09-29 — reusable controls and detection corrections

- **Observation:** The creator asked to remove the rhythm viewer's Last 10s shortcut and preserve it as a UX anti-example, then requested missing-hit authoring.
- **Decision:** Audit arbitrary session-derived shortcuts against existing general controls. Documented Last 10s alongside the Start/End/zoom/Fit controls it duplicated. Detection tools need an explicit manual correction path with draft review and reversible saving.
- **Verification:** Removed the shortcut and added per-instrument hit authoring. Targeted tests and UI evidence are recorded in `testing/results/rhythm-manual-hits/review.json`; broader layout coverage is listed there rather than implied.


## 2026-09-29 — Route all UI changes through shared presentation owners

Observation: section titles were weaker than effect names, and Video scopes used
a full-width action button. The shared hierarchy components now exist, but agents
needed an explicit entry path to use them on styling fixes as well as new features.

Decision: broaden AGENTS.md routing and the skill trigger to all editor UI changes;
require component-map selection before JSX edits; link canonical owners and
verification rather than create a parallel skill. User explicitly requested this
setup. Keep source-gate results distinct from visual-only usability evidence.

Verification: checked component paths and instruction links; ran skill-purpose,
skill-catalog and editor UI gates. Routing walkthrough: a title/scopes styling
request reads this skill and hierarchy map; a numeric effect addition also uses
the numeric gate; a timeline-only editorial request stays with proposals. If the
browser is unavailable, implementation checks continue and visual acceptance is
reported unverified. This walkthrough is not a new independent usability trial.

## 2026-10-09
- **Observation:** For repeated duration parameters, provide one compact shared main control in seconds, place per-item overrides in Advanced, and keep frame counts secondary. Evidence: feedback:7b1d1bb3204afc211ab1e4432add04d2741836515b6b6ceb7c38b8ed00e94b63, feedback:b056f952bd05bdf7f7066f62351c1a11d765097a4027a4fb5a5a9677ebae41aa, 20261002T030455-fc17d4e4.
- **Decision:** Updated — Approved Memory improvement `f4e1e44cfdaec5c6851c55a7505a0a6862ee19bfb7493e8827450500257c5f6c` from retros `d688c0da-57f9-4922-a249-9a2bbddd9e10`. Reconciled candidates: f4e1e44cfdaec5c6851c55a7505a0a6862ee19bfb7493e8827450500257c5f6c.
- **Verification:** Human-approved instruction incorporated once; operational verification remains required when applying the skill to an edit.
