# dreamcut-rendering — evolution log

## Purpose
Repository-owned guidance for the Remotion preview/render integration: frame-derived animation only (useCurrentFrame and interpolate), with timeline.json as the timing authority. Scope: the integration contract only — broader Remotion API guidance lives in the publisher's own skill, installed separately and never redistributed here. Good looks like: preview and export share one derivation; no CSS transitions or wall-clock timers; animation state is a pure function of the current frame.

## 2026-09-28 — Owned renderer migration

The creator requested removal of Remotion and an enforced contract for future effects.
Updated integration guidance to the owned frame session/browser/FFmpeg implementation;
retained the skill identifier for existing routing links. The executable renderer
contract passed 25 controls, preview/export parity, resets, 3D repeated seeks and
75 encoded frames. Evidence: `testing/results/renderer-contract/latest.json`.
Full migration readiness additionally depends on the project comparisons and review
receipt; this skill update alone does not establish release readiness.

## 2026-10-25 — Renamed from open-edit-remotion

- **Observation:** The name carried both the product's old name (OpenEdit) and Remotion, which DreamCut no longer uses for preview or export; the description had to say the name was kept only for existing links.
- **Decision:** Updated. Renamed to `dreamcut-rendering` at the creator's request; earlier entries in this log were written under the old name. The frontmatter keeps `aliases: [open-edit-remotion]` so older prompts and links still resolve, and the description no longer apologises for the name. The `src/lib/remotion/` folder name is unchanged.
- **Verification:** A catalog test gets and searches the skill by its former name; skill-discovery tests and the agent-parity check pass.
