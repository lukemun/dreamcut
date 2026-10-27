# editor-media-preprocessing — evolution log

## Purpose
Prepare proxies and reversible derived media (stabilized video, enhanced voice, cutouts) so editing never blocks on missing derivatives. Scope: pixel or signal transformations with provenance recorded, render authority kept distinct from preview proxies, originals never overwritten; ordinary editorial trims are NOT preprocessing. Good looks like: a ready media package (archival source, full-quality render authority, verified preview, mapped audio authority, receipt) before any placement; deterministic derivation; preparation failures recorded explicitly rather than treated as ready.


## 2026-09-28 · Original-source still derivatives

Creator direction: image cutouts must come from the original source because final
rendering uses it. Explicitly require full-resolution original frame extraction,
source frame/time and hash receipts, and separate preview authorities. Verified the
jet-card source is the 1080x1920 generation result, not its 360x640 preview.

## 2026-10-01 — configurable visual analysis routing

- **Observation:** The creator requested a shared routing workflow for technical preparation, descriptions and detailed effect inspection, with configurable VLM tool use and retained observations.
- **Decision:** Extend the existing media-intake router; replace blanket one-second catalog sampling with purpose-specific bounded selection and explicit coverage. Link the new visual-analysis tool while preserving the project/non-project boundary, source clocks and separate readiness states. Local inference is not treated as free of time or resource limits.
- **Verification:** Runtime tests and practical synthetic-tool evidence are recorded in the visual-analysis architecture. Skill discovery/link checks and representative routing walkthroughs are recorded there; they are not proof of creative quality or exhaustive footage coverage.
