# editorial-intent-planning — evolution log

## Purpose
Decompose multi-command or multi-mark requests into coherent, independently testable editorial tasks and persist the interpretation as a durable plan before any proposal or assembly. Scope: planning is evidence and coordination, never timeline authority — it authorizes no approval, rendering, delivery, or direct mutation. Good looks like: no dropped instructions; atoms grouped or split by shared outcome with the reasons recorded; each independently reviewable beat becoming its own proposal the human can accept or reject alone.

## 2026-10-24 — Place from the one screen read

- **Observation:** Placement and the spatial checks used different pictures of the screen, so a planned placement could land on the speaker or another graphic and only be caught afterwards.
- **Decision:** Placing, moving or replacing a visual starts from `open_space_find` over its time on screen, excluding what it replaces; it is the same occupancy the proposal checks use. Overlaps happen only when the creator asks.
- **Verification:** Code paths share `readScreenSpace`; instruction change not yet measured on fresh runs.
