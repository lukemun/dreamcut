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

## 2026-10-27 — releasing is updating the public repository

- **Observation:** The owner decided DreamCut installs from its public GitHub repository and retired the npm
  launcher and runtime feed at 0.3.0: "release is going to be kind of retired because we're not doing the
  NPM anymore. Release should just be we're updating the repo and we should just check everything we didn't
  break anything and do a code review and make sure no secrets are in there."
- **Decision:** This skill now checks a push to the public repository: `pnpm check:pr`, a code review with the
  public-content review, and the private-file and secret scan, routing install and Windows changes to
  install-check and windows-compatibility. `pnpm release`, its gate and `release-hold.json` were removed;
  release-build and release-publish were retired.
- **Verification:** The scan command and `pnpm check:pr` were run on the owner's Mac; no push was made.
