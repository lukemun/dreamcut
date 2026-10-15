# skill-authoring — evolution log

## Purpose

Enable contributors using different agents to create and maintain useful DreamCut
skills from the repository alone. Success is a discoverable, correctly scoped procedure
with real execution references, observable verification, and portable dependencies.
It does not replace capability implementation or establish behavior through prose alone.

## 2026-09-26

- **Observation:** Authoring recreate-effect used a globally installed Codex helper;
  the creator asked why DreamCut lacked its own prompting and skill-authoring skills.
- **Decision:** Added a repository-native authoring workflow linked to existing
  architecture and evolution policy, with portable checks and explicit validation scope.
- **Verification:** Frontmatter/link checks, repository discovery and purpose tests,
  and written routing walkthroughs. No downstream media workflow was executed.

## 2026-09-26 — Portfolio OS reconciliation

- **Observation:** The creator identified existing portfolio authoring guidance. The
  initial local draft had not been compared with that family.
- **Decision:** Reviewed Portfolio OS prompting/governance and a sibling project's author
  routing, skill construction, and evolution guidance. Added contract versus invocation
  ownership and explicit separation of instructions, logs, and optional evaluations.
  Source revisions and local conventions are recorded in the skill evolution standard.
- **Verification:** Reviewed routing for a new reusable effect procedure (this skill),
  an existing effect execution (recreate-effect), and an undefined capability (inspect
  implementation before promising execution). These are written walkthroughs; no
  agent or workflow authoring system was ported or executed.

## 2026-09-26 — contributor layout and evolution filenames

- **Observation:** The creator found repeating the skill name inside its own folder
  confusing and asked how standards and skills should be organized for open source.
  A sibling project's named logs accompany named skill documents in a shared docs directory.
- **Decision:** Keep DreamCut skills as self-contained folders and use `evolution.md`
  consistently. Document standards as shared contracts whose history lives in Git and
  linked decisions. Update discovery, candidate approval, and maintenance to use the
  new log name; maintenance reads DreamCut's local authoring skill.
- **Verification:** All 39 existing log bodies were hash-verified unchanged after
  renaming, before appending this record. Local documentation links resolve. Targeted
  discovery, purpose, approval, and maintenance tests exercise the updated paths.
  Filename assertions use directory entries to work on case-insensitive filesystems.
