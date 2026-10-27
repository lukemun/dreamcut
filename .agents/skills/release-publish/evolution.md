# release-publish — evolution log

## Purpose
Publish a release only on the owner's explicit words, after release-build passed at the same commit, then
confirm it installs and reports as expected. Scope: `pnpm release`, the Windows `--add-platform` step, and the
after-release checklist. Good looks like: nothing published without the owner's go-ahead or for a held
version, and every after-release check reported.

## 2026-10-25 — created

- **Observation:** Part of the releasing bundle the owner asked for. Releases happen only when the owner says
  so; 0.2.1 is held. Shipping DreamCut's own FFmpeg makes its corresponding source part of every release.
- **Decision:** Gate publishing on the owner's words in the conversation and on release-build at the same
  commit; never edit the hold list or version; after publishing, also confirm the FFmpeg source archive is
  downloadable.
- **Verification:** Not executed; nothing was published.
