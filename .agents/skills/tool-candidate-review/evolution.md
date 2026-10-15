# tool-candidate-review — evolution log

## Purpose

Identify evidence-backed reusable tool needs from actual editing-agent work, so a
future tool-only agent can perform supported edits without bespoke coding. Review
standalone tasks or delivery evidence, distinguish existing capabilities from real gaps,
and present actionable candidates in chat without changing the edit or app state.

## 2026-09-30 — Updated: independent review owner

- **Observation:** The creator clarified that tool-candidate review must be independently
  invokable without video delivery.
- **Decision:** Extract the procedure and shared contract from delivery; add explicit
  standalone task mode to the evidence helper while retaining export/opt-out gates for
  delivery. Register in the agent skill index, not the app's public Guide catalog.
- **Verification:** Standalone and export-mode fixtures, CLI persistence tests and skill
  discovery checks. Written routing walkthrough: an explicit task review uses standalone;
  enabled delivery uses export; disabled delivery does not switch modes. No actual export
  or candidate-generating model review is required or performed for this extraction.
