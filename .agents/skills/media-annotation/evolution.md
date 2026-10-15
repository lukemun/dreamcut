# media-annotation — evolution log

## Purpose

Create a source-linked visual catalog before an edit exists, preserving the boundary between inspected pixels, supplied metadata, and inference. Good output is searchable, reusable, and verifiable without changing original media or making editorial selections.

## 2026-09-24

- **Observation:** The retired Social Content workspace held a visual annotation procedure for pre-edit shoot catalogs. DreamCut's `media-intake` and `media-pull` cover project import but did not state the complete collection-level sampling and catalog contract.
- **Decision:** Adapt the reusable observation rules into a DreamCut-owned pre-edit skill. Keep personal collections in ignored local directories and project intake in the existing router.
- **Verification:** Compared the legacy skill with `media-intake` and `media-pull`; checked the new skill's routing and relative paths. No personal media was published or imported.

## 2026-10-01 — configurable visual analysis routing

- **Observation:** The creator requested a shared routing workflow for technical preparation, descriptions and detailed effect inspection, with configurable VLM tool use and retained observations.
- **Decision:** Extend the existing media-intake router; replace blanket one-second catalog sampling with purpose-specific bounded selection and explicit coverage. Link the new visual-analysis tool while preserving the project/non-project boundary, source clocks and separate readiness states. Local inference is not treated as free of time or resource limits.
- **Verification:** Runtime tests and practical synthetic-tool evidence are recorded in the visual-analysis architecture. Skill discovery/link checks and representative routing walkthroughs are recorded there; they are not proof of creative quality or exhaustive footage coverage.
