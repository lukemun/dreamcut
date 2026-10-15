# PR review standard

Implemented 2026-09-14. [Source findings](../research/2026-09-14-pr-quality.md).

## Two distinct gates

`pnpm check:pr` runs typecheck and the full test suite locally. The **PR quality gate** GitHub job runs the same checks on PRs and main. A separate trusted workflow posts one updatable PR comment using job results. It never checks out PR code or executes artifacts and ignores results for an older PR head. Fork runs without a PR association may only receive the check summary.

Passing automation means **ready for code review**, not merge approval. Tests cannot grade simplicity or prove the UI looks right. We use a readiness verdict rather than an invented 0–100 score:

- **BLOCKED:** failed required checks or a confirmed P0/P1/P2 defect.
- **NEEDS REVIEW:** checks incomplete, unsupported environment, uncertain findings, or an applicable review dimension lacks evidence.
- **READY:** all applicable checks and dimensions reviewed at the recorded head; no unresolved P0/P1/P2 defects. Human merge judgment remains separate.

## Local review hooks

This checkout installs `.githooks/pre-commit` and `.githooks/pre-push` through `core.hooksPath`. Before a commit, the hook runs the native review against the pending worktree. Before a push, it reviews the branch against `main` (or `DREAMCUT_REVIEW_BASE`). The reviewer is Claude Code with Opus, limited to reading files and git inspection; `DREAMCUT_CODE_REVIEW_TOOL=codex` uses `codex review` instead, and `DREAMCUT_CODE_REVIEW_MODEL` picks the model. A failed or interrupted review blocks the operation. When the local reviewer session is unavailable, an explicit one-shot bypass is available with `DREAMCUT_SKIP_CODE_REVIEW_HOOK=1`; the skipped review should be reported with the resulting commit or PR.

## Review dimensions

| Dimension | Required evidence |
| --- | --- |
| Correctness | User trigger, before/after behavior, edge cases, failure paths and state ownership |
| Safety and compatibility | Proposal gate, safe writes, migration behavior, secrets/permissions, input validation where affected |
| Public content | Changed and newly added files are appropriate to distribute; private/internal records excluded, media clearance and attribution recorded, generated copies and links consistent |
| Simplicity | Reuses canonical helpers, avoids duplicate authorities, unnecessary abstractions and unrelated churn |
| Tests | Tests fail for the actual regression; appropriate checks and explicit gaps; no weakened assertions |
| UX | Real screenshots/interactions for changed UI, theme contrast, keyboard access, stable player/layout |
| Playback/delivery | Applicable AGENTS instruments; do not equate player/unit checks with encoded render proof |

P0 is an immediate critical failure, P1 a serious regression/security or data-loss risk, P2 an actionable functional defect, P3 a non-blocking improvement. Every finding includes a path/line, concrete triggering condition, impact and supporting evidence. Taste-only comments are nits. Do not manufacture findings to fill a quota.

## Public-content review

Apply the [public documentation boundary](../development-workflow.md#public-documentation-boundary)
to the complete intended diff, including untracked additions, renamed files, skill
references, catalog data, generated pages, fixtures, screenshots and media. This
dimension applies to code-only changes too: comments and test data can expose private
context. A secret scan passing does not establish publication suitability.

- Keep competitor/editor evaluations, internal UX reviews, session diaries, private
  project incidents, local paths/identifiers, workspace migrations and unadopted
  business/licensing deliberations out of distributed files. Preserve them in ignored
  local storage; extract reusable requirements into their existing public owner.
- Retain relevant technical research, source credits, active legal notices and
  reproducible sanitized benchmarks. A date, another product's name or the word
  “review” alone is not a defect; assess purpose and content.
- For added or changed media, inspect its recorded provenance and redistribution
  basis, and check visible/audible content for private information where applicable.
  Accept an explicit maintainer clearance already recorded for those assets; do not
  demand it again or infer ownership, broader use rights or clearance for new assets.
- Check linked assets, embedded/generated catalogs and reciprocal skill receipts.
  Moving a file to another public directory does not resolve a finding. Removing it
  requires repairing references; current-tree removal does not erase Git history.

The review receipt must record the paths examined, disposition, supporting rights
record when applicable, and any uninspected content. Confirmed internal/private
material crossing this boundary is a blocking finding (normally P2; escalate for
secrets or serious disclosure). Missing applicable evidence is NEEDS REVIEW, not a
claim of infringement or an automatic request for renewed permission. Do not copy
the sensitive content into a public review comment; identify its location and class.

## Repair loop

Use the [PR review skill](../../.agents/skills/pr-review/SKILL.md), which requires the standalone [code-review skill](../../.agents/skills/code-review/SKILL.md). A reviewer identifies issues; the author verifies and fixes confirmed ones, then reruns affected checks and reviews the new diff. Native local Codex review is required before READY, uses existing local authentication, and produces candidate findings that must be verified. Record the reviewed base/head and dirty diff fingerprint when applicable. Missing or incomplete native review means NEEDS REVIEW, unless confirmed defects or failed checks require BLOCKED. Repeat the native pass after repairs. This is an agent workflow requirement; the GitHub check does not run or enforce the AI review. No hosted API key or paid AI action is required by this implementation. Automated commits, approval and merge are not enabled. At most two unsuccessful repair cycles before reporting a blocker.

## GitHub deployment and enforcement

Both workflows must exist on the default branch before the comment workflow can run. Pin action revisions; update pins deliberately. CI runs untrusted PR code with read-only permissions and no supplied secrets on disposable hosted runners. The comment job only formats GitHub job metadata; it never executes PR text or downloaded files. New commits invalidate prior review receipts.

Require the **PR quality gate** check for main in branch protection/rulesets, with up-to-date branches, no force pushes and no deletion. Protect workflow and review-policy changes with maintainer review. A required check alone cannot prevent a contributor from weakening tests in a PR; code review still matters. Solo-maintainer repositories should not require a second person's approval until another reviewer is available. Direct snapshot pushes bypass the PR discussion and should be exceptional.

Deployment status and live verification are reported in the task that installs this workflow; source files alone do not establish that GitHub enforcement or PR comments have run.
