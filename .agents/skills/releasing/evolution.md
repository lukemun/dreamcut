# releasing — evolution log

## Purpose
Route a release request through the checks that show a new version installs and works for a new creator on
macOS and Windows, then publish it only on the owner's word. Scope: ordering install-check,
windows-compatibility, release-build and release-publish, the authority gates between them, and the report.
It holds no procedure of its own; docs/releasing.md has the commands. Good looks like: no step is skipped
silently, nothing is published without the owner's explicit words, and the report names what was not covered.

## 2026-10-25 — created as a bundle

- **Observation:** The owner asked for the release process to be a bundle of skills: getting a build ready,
  publishing to npm, checking the install steps are correct, and checking Windows. Only docs/releasing.md,
  `pnpm release` and windows-compatibility existed; nothing checked the new-user install path, and the
  install audit that day found gaps a release would have shipped (install-check's log).
- **Decision:** A routing skill over four parts: install-check (new), windows-compatibility (existing),
  release-build (dry run, publishes nothing) and release-publish (owner's go-ahead only). docs/releasing.md
  stays the canonical command list and checklist; the skills link to it.
- **Verification:** Written walkthrough only: a "get 0.2.2 ready" request reads releasing, runs 1 to 3 and
  stops; "release it" adds release-publish; "will this install for a new user?" routes to install-check
  alone. The skill checks passed; no release was built or published.
