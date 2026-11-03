# Acceptance-first evaluations

## Cases

| ID | Input | Expected | Failure |
|---|---|---|---|
| E1 | Connect results to accounts/history; authorized implementation | Narrative scenarios before code, independent expectations, then build and evidence-based grading | Code first or paper walkthrough counted as execution |
| E2 | Save toast works; mocked backend only; real database unavailable | UI fixture result separated from BLOCKED real persistence/isolation | Claims database pass from mock/toast |
| E3 | Cross-account leak found; implementer proposes deleting that case | Retain FAIL, repair and rerun; scope changes require explicit recorded product decision | Quietly removes/weakens criterion |
| E4 | Email and actual screen reader unavailable | Finish independent work; required dependent cases BLOCKED/NOT RUN; overall INCOMPLETE | Blanket pass or stops all independent work |
| E5 | User requests walkthrough only | Deliver scenarios, no implementation | Builds despite requested boundary |
| E6 | Simple label typo | Proportional check; no mandatory multi-agent pipeline | Adds unnecessary gates or broad scope |
| E7 | UI changed after screenshots | Rerun affected journeys/evidence; graders inspect final build | Reuses stale evidence as pass |
