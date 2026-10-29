---
name: releasing
description: Check DreamCut before the owner's work is pushed to the public GitHub repository, which is how creators get new versions (they install and update from it with git). Runs the repository checks, a code review with the public-content review, and the private-file and secret scan, then routes install and Windows changes to install-check and windows-compatibility. Use when the owner asks to release, ship, push or update the public repo, or to make sure the next push breaks nothing for a new user. A single setup or platform change that only needs its own verification goes to install-check or windows-compatibility directly.
---

# Update the public repository

DreamCut ships by updating its public GitHub repository: creators install with `git clone`, `pnpm install` and
`pnpm bootstrap`, and are offered each push as an update when their agent opens DreamCut (`dreamcut_update`,
`node bin/dreamcut.mjs update`: fast-forward only, then `pnpm install` when the lockfile changed). There is no build to publish;
the npm launcher and runtime feed stay at 0.3.0 and are not updated. The outcome is
evidence that what is about to be pushed breaks nothing for a creator, carries no secret or private material,
and has been reviewed, pushed only when the owner says to.

## Authority

- Pushing is the owner's decision. "Check it", "get it ready" or "will this break anything?" authorize the
  checks only. Commit and push `main` to `origin/main` only on the owner's words in this conversation.
- Check only what will be pushed: committed work on `main` ahead of `origin/main`. When the working tree
  has changes, report them; committing someone else's work is the owner's call, and other sessions may be
  mid-change in this checkout.
- Never change the `package.json` version or push to make a check pass.

## Checks

Run them on the commits to push (`git log origin/main..main`); run long ones in the background.

1. **Nothing broke:** `pnpm check:pr` (tool registry, catalog privacy, owner-only instructions, typecheck, effects and `pnpm test`).
   `pnpm typecheck` does not cover `scripts/*.ts`: parse each one the push changes with
   `npx esbuild --log-level=error <file> > /dev/null`. Add the checks the changed areas name in AGENTS.md
   (for example `pnpm check:editor-ui` for editor UI).
2. **Code review:** review `origin/main..main` with [code-review](../code-review/SKILL.md), including the
   [public-content review](../../../docs/standards/pr-review.md#public-content-review): no internal or
   private material, creator media, private terms or local paths in code, docs, skills or assets.
3. **Secrets and private files:** `node scripts/check-private-files.mjs --base $(git rev-parse origin/main)`
   scans every outgoing commit, deleted files included, with Gitleaks and the private-path rules. The
   pre-push hook runs the same scan and a native review again; it does not replace steps 2 and 3.
4. **New-user install**, when the push changes setup, dependencies, model paths, `bin/`, `mcp/` start-up or
   a message that tells the creator to install something: [install-check](../install-check/SKILL.md).
5. **Windows**, when the push changes process spawning, file paths, native dependencies, media preparation,
   export or MCP start-up: [windows-compatibility](../windows-compatibility/SKILL.md).

A fix made during any step reruns the steps it can affect. Fix causes, never by loosening a check.

## Report

For each step: passed, failed (each failing check or finding by name, with its detail) or not run (why).
Then what a creator gets that the checks did not reach, and the single next decision for the owner (push,
fix first, or hold).
