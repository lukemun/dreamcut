# pr-review — evolution log

## Purpose
Run the complete PR workflow: review changes, grade readiness from evidence, fix confirmed issues when authorized, and rerun checks before publishing. Scope: owns the workflow — the native code-review inspection is its required step; it never auto-approves, self-merges, weakens tests, or mutes checks to get green. Good looks like: BLOCKED / NEEDS REVIEW / READY graded from concrete findings with severity, trigger, impact, and evidence per rubric dimension; no numeric quality scores; any verdict invalidated and re-earned after edits or new commits.

## 2026-09-29 — public-content coverage

- **Observation:** Code-focused validation did not prevent internal documentation from entering the public tree.
- **Decision:** Route the entire intended diff through the shared public-content review and include its evidence in readiness. The code-review skill owns inspection; the standard owns the boundary.
- **Verification:** Skill-purpose and catalog tests passed (2/2). Walked through internal-document additions, legitimate technical research, existing media clearance and missing evidence; the corresponding inspection cases are recorded in the code-review evolution log. Native-review detection effectiveness has not been measured.
