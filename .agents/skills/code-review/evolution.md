# code-review — evolution log

## Purpose
Review repository changes for concrete defects using the native Codex review plus the shared DreamCut rubric, standalone or as the required inspection step inside pr-review. Scope: inspection only — it never repairs, publishes, or approves; pr-review owns the workflow. Good looks like: verified findings with severity, path/line, trigger, impact, and evidence; uncertain candidates kept separate from confirmed defects; no finding quotas or numeric scores. A clean result means no actionable defects found within the recorded coverage, not a guarantee of correctness.

## 2026-09-29 — public-content boundary

- **Observation:** Internal reviews and session records accumulated in distributed documentation despite existing secret checks.
- **Decision:** Require the shared public-content dimension during full-scope review, including additions and generated assets. Preserve recorded media clearance and attribution; report coverage without reproducing private material.
- **Verification:** Skill-purpose and catalog tests passed (2/2). Written walkthroughs: an internal editor-comparison diary is a blocking publication finding; a sanitized technical benchmark with reproduction steps is appropriate; an existing asset with recorded maintainer clearance does not require renewed permission; uninspected media or missing rights evidence remains NEEDS REVIEW. These are procedure walkthroughs, not a measured native-review detection benchmark.
