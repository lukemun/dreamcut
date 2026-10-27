# release-build — evolution log

## Purpose
Build and verify every download a release would publish from this Mac, with nothing published, and read the
result against the release checklist. Scope: `pnpm release --dry-run`, its prerequisites and log, and fixing
what it finds in the checked code. Good looks like: a dry run that passes every checklist item at a clean,
pushed commit, with the would-publish decision reported and publishing left to the owner.

## 2026-10-25 — created

- **Observation:** Part of the releasing bundle the owner asked for. The release pipeline gained an FFmpeg
  build (about 10 minutes) and a `media_source` archive, and `pnpm editor:build` can disturb a running stable
  editor in a shared checkout.
- **Decision:** A short skill over docs/releasing.md's dry-run section, adding the decisions it lacked: stop on
  uncommitted work rather than committing it, leave the version to the owner, and confirm before rebuilding
  next to a running editor.
- **Verification:** Not executed; the dry run was not run in the session that wrote it.
