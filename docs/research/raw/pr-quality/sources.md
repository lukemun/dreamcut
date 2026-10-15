# PR quality source records

Retrieved 2026-09-14 via web search and opened primary pages. These are brief excerpts, not full captures.

- Google, [What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html), Tests: “Will the tests actually fail when the code is broken?” Scope: reviewer guidance on functionality, complexity, tests, UI and context.
- GitHub, [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use), third-party actions: “Pin actions to a full-length commit SHA”. Scope: least privilege, untrusted code and action pinning.
- OpenAI, [Codex Action security](https://github.com/openai/codex-action/blob/main/docs/security.md). Scope: review/posting isolation, untrusted inputs and sandbox privilege reduction. No full source reproduced.

Repository observations: main was unprotected (GitHub API returned 404, Branch not protected); `.github/workflows` contained no files. `codex review --help` exposed `--base`, `--commit` and `--uncommitted`. These are local observations, not claims from the sources above. The preceding application snapshot was commit 80524f1.
