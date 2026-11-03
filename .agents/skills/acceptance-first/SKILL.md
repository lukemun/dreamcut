---
name: acceptance-first
description: Build substantial features by walking through plain-language acceptance scenarios before implementation, then independently grading the working flows against fixed expectations. Use for new user journeys, persistence/identity changes, or an explicit acceptance-first request; keep trivial edits proportional.
---

# Acceptance-first development

Read project instructions and existing plans, tests and shared owners. This skill orchestrates development and verification; product rules, UX, accessibility and security standards remain authoritative. No particular framework, browser tool or backend is assumed.

For a trivial edit, use a brief expected-outcome note and focused verification; a separate scenario document and multi-agent round are not required unless the user or project requires them.

## 1. Write and walk through the contract before code

Start with the intended user outcome and bounded scope. Reuse existing acceptance IDs where possible. For each scenario record: ID, priority, actor/setup, exact user actions, observable expected outcome, failure/recovery, verification method and evidence required. Explain the main journeys in ordinary language to the user before implementation. This is a narrative walkthrough, not a passing test or an automated test script.

Cover success, refusal/cancellation, empty/loading/error, retry, interrupted work, identity switching, persistence and consequential boundaries. Only include relevant cases. Derive expectations from user decisions and product contracts, not from the implementation. Separate approved decisions, proposed defaults and unresolved dependencies. Ask about genuinely blocking ambiguity while continuing independent work; do not add a mandatory approval pause when execution is already authorized. If the user asked only for a walkthrough, stop before building.

Save a versioned scenario document with every execution status initially NOT RUN. Link the scope and any explicit exclusions. A missing required feature is NOT IMPLEMENTED, never N/A. Record the existing build/state and available test environments. Mark fixtures and demonstrations as such; do not mutate real user data or send messages to others to test a flow.

## 2. Inspect design and implement the smallest complete slice

Follow local design-first and shared-component requirements. Map each change to scenarios and shared owners. Build the smallest end-to-end slice; don't implement unrelated features merely because the full product plan contains them. Choose meaningful unit/service/browser checks where they prove a contract; don't write implementation-mirroring tests by habit.

Preserve the frozen expected outcomes. If product direction changes, version the contract with a recorded user/product-owner decision before removing or weakening a previously required case, including reason and authorization, retain the prior failure, and identify invalidated evidence. Never weaken a failed acceptance criterion to make the implementation pass.

## 3. Execute and retain evidence

Exercise user actions through the working interface. Fixture setup may use APIs; it cannot replace the user action being tested. For persistence, ownership, export or deletion, inspect permitted stored data as well as visible feedback. A success toast isn't proof of a stored result. Mocked delivery/data can establish a controlled UI case but cannot prove real email delivery, database rules or cross-device persistence.

Record per ID: contract version, build fingerprint (including uncommitted changes), environment, fixture, expected/actual, status and evidence link. Keep credentials and personal data out of evidence. Distinguish automated checks, rendered/keyboard review, real assistive technology and live-service evidence. Missing tools/data block only dependent claims; finish independent checks. Run project-required regressions and applicable UX/accessibility reviews.

## 4. Independent grading and repair

When authorized and available, use fresh-context graders after implementation. Give them the scenario contract, tested build/environment, fixtures, evidence and relevant product standards; omit the implementer's conclusions. Assign complementary coverage (functional/persistence, isolation/recovery, UX/accessibility) and require every required ID to have an owner. Graders should execute critical cases themselves where tools permit and report exact reproduction steps, expected/actual, evidence and status. Static review and evidence-only review must be labeled; neither is a live execution pass. Never expose credentials in reviewer prompts.

Reconcile disagreements against observations. Preserve findings; fix within scope, then rerun failed cases and affected regressions on the final build. Changed UI invalidates affected rendered evidence. Independent graders are fallible reviewers, not approval authorities. If delegation is unavailable, disclose the missing independence and do not invent a reviewer.

## 5. Completion report

Use per-case PASS, FAIL, BLOCKED, NOT IMPLEMENTED, NOT RUN or N/A (with an explicit scope reason). BLOCKED means a required dependency is unavailable; NOT RUN means execution has not been attempted despite no identified dependency blocker. When independent grading is required by the user/project, it is itself a required gate. Overall acceptance is COMPLETE only when every required in-scope case passes on the final build; otherwise INCOMPLETE with specific gaps. Product review standards may impose stricter statuses. List passed/failed/blocked/unrun counts, final-change rerun, evidence, known limits and cleanup. Distinguish implemented locally, verified locally, verified against services and deployed. Do not claim all tests passed from one test suite or a grader score.

Capture reusable learning through [skill-authoring](../skill-authoring/SKILL.md) and [author-workflows](../author-workflows/SKILL.md). See [EVALS](EVALS.md) and [evolution](evolution.md). This procedure is guidance, not installed CI enforcement.
