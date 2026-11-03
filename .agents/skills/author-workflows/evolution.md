# author-workflows — evolution log

## Purpose

Make multi-step agent work inspectable and repeatable: each stage has a named input, output, owner, acceptance check and retry rule. Good looks like expensive evidence gathered once and cached by real input identity, interpretation kept apart from measurement, and a reviewer able to tell which stage introduced an error.

## 2026-10-31 — adopted

- **Observation:** DreamCut had no procedure for this beyond its own prompt- and skill-authoring skills.
- **Decision:** Adopted a portable version from the maintainer's shared authoring set; the correction route became "Where lessons go" in AGENTS.md. Earlier history stays with that set.
- **Verification:** Links and structure checked after adoption; behaviour in DreamCut is not yet evaluated.
