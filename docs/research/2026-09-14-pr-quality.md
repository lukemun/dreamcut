# PR quality and review automation — source findings

Method: searched and opened official Google engineering guidance, GitHub Actions security documentation and OpenAI Codex Action security documentation on 2026-09-14. [Source records](raw/pr-quality/sources.md). Implementation decisions live separately in [the review standard](../standards/pr-review.md).

Google's review guidance covers design, functionality, complexity, tests, naming, comments, documentation and context. It asks reviewers to check whether tests detect broken code and to assess UI behavior rather than relying only on the diff. It distinguishes personal style preferences from blocking issues. [Google reviewer guidance](https://google.github.io/eng-practices/review/reviewer/looking-for.html).

GitHub recommends minimal token permissions, full commit SHA pins for actions, and caution when privileged workflows interact with untrusted PR content. [GitHub secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).

The Codex Action security guidance discusses prompt injection, privilege reduction and separating review execution from posting feedback. [OpenAI Codex Action security](https://github.com/openai/codex-action/blob/main/docs/security.md).

Limitations: these are engineering and platform recommendations, not a comparative study proving that an AI score predicts defect rates. No claim is made that any specific review bot can certify code quality. Sources describe configurable tools; installed capabilities and enforcement require repository-specific verification.
