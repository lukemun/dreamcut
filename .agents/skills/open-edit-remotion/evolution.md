# open-edit-remotion — evolution log

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
