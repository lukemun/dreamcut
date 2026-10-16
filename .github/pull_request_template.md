## What changes for the user?

Describe the problem, trigger, and resulting behavior.

## Evidence

- Checks run and results:
- UI changes: before/after screenshots in both themes, or explain why not applicable.
- Playback/render changes: relevant instrument receipt (a unit test is not delivery proof).

For editor UI changes: include the creator task, canonical UI path, reused/replaced controls, state and reset/undo semantics, and tall/wide plus narrow-panel and keyboard evidence under the [feature integration standard](../docs/standards/editor-feature-integration.md). Include the fresh-eyes task and pass/fail/unverified result: an unfamiliar tester must find, change, verify and undo through visible UI without implementation hints. Mark untested cases explicitly.

## Review

- Review base and head commit:
- Confirmed findings fixed; remaining risks or unreviewed areas:
- Compatibility, rollback, or migration notes where needed:
