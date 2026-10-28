# Releasing DreamCut

DreamCut ships from this repository. Creators install with `git clone`, `pnpm install` and `pnpm bootstrap`,
and update with `git pull && pnpm install` (see the README's Install section). Releasing is pushing `main`
to GitHub after the checks below; there is no build or download to publish.

The npm `dreamcut` launcher and its runtime download feed are no longer updated (2026-10-27): they stay at
0.3.0 and are not referenced; their packaging was removed from this repository.

## Before pushing

- [ ] The work to push is committed on `main`; `git log origin/main..main` lists exactly it.
- [ ] `pnpm check:pr` passes (tool registry, catalog privacy, typecheck, effects and the test suite).
- [ ] Each changed `scripts/*.ts` parses: `npx esbuild --log-level=error <file> > /dev/null` (typecheck does
      not cover `scripts/`).
- [ ] A code review of `origin/main..main`, including the
      [public-content review](standards/pr-review.md#public-content-review), finds nothing blocking.
- [ ] `node scripts/check-private-files.mjs --base $(git rev-parse origin/main)` passes: Gitleaks and the
      private-path rules over every outgoing commit, deleted files included.
- [ ] Changes to setup, dependencies or start-up pass the
      [install check](../.agents/skills/install-check/SKILL.md); changes to process spawning, paths, native
      dependencies, media preparation or export pass the
      [Windows check](../.agents/skills/windows-compatibility/SKILL.md).

The `pre-push` hook (`.githooks/pre-push`) runs the private-file and secret scan and a native code review
again as the push goes out. It is a backstop, not a substitute for the list above.

When a change is worth naming for creators, add it to `CHANGELOG.md` under the next version.
