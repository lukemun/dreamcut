---
name: release-publish
description: Publish a DreamCut version (the runtime downloads and update feed on dreamcut.io, the GitHub release, and the npm launcher when npm lacks the version) and run the after-release checks. Use only when the owner explicitly says to release a version, after release-build passed at the same commit. Building or checking a release without publishing is release-build.
---

# Publish a release

The outcome is a published version that installed editors offer within about 15 minutes and that
`npx dreamcut@latest` installs on a clean computer, published only on the owner's word.

## Authority and gates

- Publish only when the owner, in this conversation, says to release this version. A request to prepare,
  check or build is not it, and approval of an earlier version does not carry over.
- Stop and report when: the version is in `packaging/release-hold.json`; release-build has not passed at this
  commit; install-check or windows-compatibility found a failure the owner has not accepted; or the working
  tree is not the pushed `main`.
- Never edit `release-hold.json`, bump the version or push to make a release possible; those are the owner's.

## Publish

Run `pnpm release` (the steps and prerequisites are in [docs/releasing.md](../../../docs/releasing.md)). It
uploads the downloads and the FFmpeg corresponding-source archive to dreamcut.io, publishes the feed last,
records the GitHub release, and publishes the npm launcher only when npm lacks this version. A failure stops
it; rerun after the fix, since every step skips what is already published.

For Windows, run `pnpm release --add-platform` in the Windows VM at the same commit
([windows-compatibility](../windows-compatibility/SKILL.md) has the VM's commands); it attaches the Windows
download and merges it into the feed.

## After publishing

Work through the after-release checklist in docs/releasing.md: Sentry release and source maps, a clean
`npx dreamcut@latest` install opening a project, Report a bug, and the signed-out and membership views.
Also confirm the feed's `media_source` archive downloads from dreamcut.io: the FFmpeg licence requires that
source to be available to everyone who receives the download.

## Report

The published version, what was uploaded (from the release log), the npm decision, each after-release check
with its result, and anything left (the Windows download not yet attached, a check not run).
