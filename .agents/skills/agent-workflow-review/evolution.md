# agent-workflow-review — evolution log

## Purpose

Provide a focused, independently invokable review for agent workflow review.
Success is evidence-backed findings with explicit uncertainty, correct ownership and
no implied adoption, export, session closeout or app-facing review surface.

## 2026-09-30 — Updated: independent review entry point

- **Observation:** Creator requested that outcomes, efficiency, tools, skills and personal
  style reviews be independent; delivery is a useful occasion rather than their owner.
- **Decision:** Add this agent-facing skill under the independent review contract. Preserve
  existing authority and opt-outs for delivery-triggered work; standalone requests are
  read-only review authorization, not automatic adoption.
- **Verification:** Discovery/purpose and app-catalog exclusion tests plus link checks and
  written routing walkthroughs. No actual project review, model benchmark, export or
  preference/skill adoption was run to validate this setup.

## 2026-10-09 — Updated: desktop chat evidence

- **Observation:** The desktop app's in-app chat runs agents without hooks or a shell. Its
  tool journals and transcripts live in the app's user data and the agents' own stores,
  which this skill never named, so a workflow review would miss the call trace and tokens.
- **Decision:** Start desktop reviews from `pnpm learning:evidence <project-id>`, which
  indexes project records, every current and archived conversation journal, and linked
  transcript token totals without copying text.
- **Verification:** Unit tests for the evidence index, plus a run against a real project
  with one Codex and one Claude desktop conversation. No full workflow review has been
  run on a substantive desktop session yet.
