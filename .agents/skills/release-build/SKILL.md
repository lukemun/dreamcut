---
name: release-build
description: Build and verify a DreamCut release without publishing anything, with `pnpm release --dry-run`, and read its log against the release checklist. Use when preparing or checking a release (from releasing), or after a packaging change that needs the full release pipeline exercised. Publishing is release-publish.
---

# Build and verify a release

The outcome is a dry run that builds every download for this Mac, passes every packaging and first-run check,
and shows what would be published, with nothing published. The commands, prerequisites and checklist are in
[docs/releasing.md](../../../docs/releasing.md); follow them, and use this for the decisions around them.

## Before running

- The release builds from a clean, pushed `main`. If the working tree has changes, stop and report what is
  uncommitted: committing or pushing someone else's work is the owner's call, and in a shared checkout other
  sessions may be mid-change.
- The version and its `CHANGELOG.md` section are the owner's. Without them the dry run stops; report that
  rather than choosing a version.
- `pnpm editor:build` rebuilds `.next-desktop` and the compiled workers. On a computer where the owner's
  stable editor (port 3123) or another session is running, say so and confirm before running it.
- It takes about 30 minutes, 10 of them building FFmpeg; run it in the background.

## Run and read

Run `pnpm release --dry-run`. Then check its log against the dry-run checklist in docs/releasing.md: compiled
job and entry counts, source-map handling, no source or source maps shipped, the FFmpeg build and its
`media_source` archive, and the first-run check passing in full.

A failure stops the pipeline at that step. Fix causes in the code the step checks (packaging, launcher,
server, build scripts), never by loosening the check, then rerun the dry run from the start.

## Report

The version, the commit, each checklist item with its result, the archive sizes, and what the dry run would
publish (the release-gate decision it printed). A passing dry run is not a release; state that publishing
waits for the owner (release-publish).
