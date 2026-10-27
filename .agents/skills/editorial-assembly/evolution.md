# editorial-assembly — evolution log

## Purpose
Direct an end-to-end assembly from script or transcript, source media, visual directions, and delivery target through one coherent previewable edit. Scope: the parent workflow — it routes to specialist skills per stage, keeps one editor responsible for the integrated result, and chooses the assembly authority (fresh workspace for new builds, proposals once a human has touched the timeline). Good looks like: speech spine first, then captions, visuals, audio, finishing; no incompatible clocks or scene assumptions between stages; major rebuilds preserve the working cut.

## 2026-10-07 — Close direct authority at first layout handoff

- Observation: A delivered first layout retained direct authority until a human edit,
  allowing agent feedback corrections to bypass proposals.
- Decision: Require `assembly_handoff` before the first review handoff. Persist a
  permanent guard outside history; all subsequent changes require proposals.
- Verification: Store/MCP regression tests cover first handoff without human edits,
  retry, empty-layout refusal, stale grants, history restoration and dispatch races.
  Tool registry and typecheck are checked separately. Chat prose is not an automatic
  handoff signal; agents must call the explicit operation.
