# timeline-auditions — evolution log

## Purpose
Cut and show multiple playable versions for comparison without changing the working timeline. Scope: triggered by intent ("show me a few versions"), not the word "audition" — comparisons inside an existing edit use mutually exclusive proposal options; audition_create only for dedicated source/take comparisons. Good looks like: each candidate labeled with comparable scope and explicit source handles; a recommendation never treated as a selection; the working timeline untouched; placing a chosen winner is a separate edit.

## 2026-10-07 — Close direct authority at first layout handoff

- Observation: A delivered first layout retained direct authority until a human edit,
  allowing agent feedback corrections to bypass proposals.
- Decision: Require `assembly_handoff` before the first review handoff. Persist a
  permanent guard outside history; all subsequent changes require proposals.
- Verification: Store/MCP regression tests cover first handoff without human edits,
  retry, empty-layout refusal, stale grants, history restoration and dispatch races.
  Tool registry and typecheck are checked separately. Chat prose is not an automatic
  handoff signal; agents must call the explicit operation.
