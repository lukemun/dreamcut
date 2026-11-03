# author-agents — evolution log

## Purpose

Give a runtime agent, such as DreamCut's in-editor agent, a behaviour contract that holds up in use: what it may do, what evidence it works from, when it stops and how it hands back. Good looks like permissions enforced in code rather than prose, failures diagnosed from a reproducible trace, and changes compared against a fixed baseline before they become the default.

## 2026-10-31 — adopted

- **Observation:** DreamCut had no procedure for this beyond its own prompt- and skill-authoring skills.
- **Decision:** Adopted a portable version from the maintainer's shared authoring set; prompting-best-practices became [prompt-authoring](../prompt-authoring/SKILL.md), and the general-lesson route became "Where lessons go" in AGENTS.md. Earlier history stays with that set.
- **Verification:** Links and structure checked after adoption; behaviour in DreamCut is not yet evaluated.
