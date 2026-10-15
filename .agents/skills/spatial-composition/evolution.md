# spatial-composition — evolution log

## Purpose
Arrange and verify multiple visual actors as one composition: hierarchy, alignment, spacing, safe areas, layer order, and intentional overlap. Scope: compositional geometry, resolved through resolveMediaScene; assessment output is advisory numerical fact, never a bypass of the proposal gate. Good looks like: one coherent semantic arrangement per scene state; intentional overlap only with supporting evidence; speakers never identified from face tracks; sampled frame coverage never treated as continuous clearance.

## 2026-09-20 — Logged: visible artwork, not padded source boxes

- **Observation:** In a private creator project, a generic safe-grid reflow reduced supporting graphics and displaced logo/character relationships. The creator explicitly requested larger artwork, visible-center alignment, and correct ranked podium placement. Transparent source bounds were not the visible subject bounds.
- **Decision:** Keep the existing craft rule: alpha/mask bounds and rendered pixels already govern ambiguous overlap and alignment. No new universal permission to cross safe zones. Record readable scale as personal style and top/bottom crossings as this project's exception. Added deterministic semantic arrangements in the implementation, not a new taste rule in the shared skill.
- **Evidence:** That private project's `analysis/editorial-intent-plans/intent-five-mark-visual-scale.json`; five human-approved proposals dated 2026-09-20T19:43; `instruments/five-mark-after/REVIEW.md` within that project.
- **Verification:** Fifteen semantic-layout tests and typecheck passed. All five marked scenes and adjacent selected states were rendered and inspected. This is sampled evidence, not continuous clearance.

## 2026-09-28 — Updated: semantic default with explicit coordinate fallback

- **Observation:** During contributor-principle documentation, the creator explicitly clarified: “we can do X, Y, Z fallback, but it should never be the default path.” The old skill prohibited the fallback categorically.
- **Decision:** Link the canonical spatial-authoring standard. Keep semantic placement as the default; allow measured, documented fallback through supported proposal fields, with unambiguous coordinates and one placement authority. No timeline or runtime schema was changed.
- **Verification:** Reviewed supported semantic and numeric paths in `timeline-editor-agent-apply.ts`; checked the instruction against named placement, unsupported relationships, and ambiguous coordinates. Documentation/link and skill-catalog checks are recorded with this change; no media trial or spatial accuracy improvement is claimed.
- **Observation (2026-10-10):** Agents skipped or over-used the separate spatial preflight (see open-edit-proposals evolution, same date).
- **Decision:** The scoped check runs inside `proposal_create` for anything that can move or cover something; the preflight remains as a dry run for iterating on layouts. Guidance updated to read `spatial_review` from the staged proposal.
- **Verification:** Same eval and route tests as the proposal change; no spatial accuracy change is claimed, only when the check runs.
