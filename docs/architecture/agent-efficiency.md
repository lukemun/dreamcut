# Agent efficiency and regression protection

Optimize repeated verification without weakening evidence or human review. The [renderer contract](../standards/renderer-contract.md) owns cache and capture invariants; the [proposal standard](../standards/proposal-presentation.md) owns accepted-field protection and first-draft controls.

## Recorded benchmark scope

These are historical local synthetic-fixture results from 2026-09-29, not measurements rerun during documentation cleanup or guarantees for every project.

| Workload | Baseline | Reuse result |
| --- | --- | --- |
| 15-frame 320×180 fresh versus batched capture | 37.84 s, 15 captures | 11.47 s, 15 captures |
| Same fixture with warm persistent cache | 15 captures | 3 captures; 12 eligible hits, pixel-identical outputs |
| Three sampled frames after a local clip change | 3 captures | 1 capture, 2 hits; all equal fresh output |
| 20 repeated dependency traversals, seven alternating trials | 113.98 ms median | 65.86 ms median |
| Five caption-ink measurements, seven alternating trials | 166.57 ms median | 0.367 ms median; identical bounds |
| Separate two-frame CLI processes, five alternating trials | 2.209 s | 0.625 s with opt-in warm worker |
| Synthetic 100-sample report, one changed sample | 52,879 bytes | 1,212-byte change index |

These gains cover the stated repeated workloads, not overall agent latency. Cold computation still costs work. CI checks equivalent output, invalidation and work counts rather than noisy time thresholds. Interrupted retrospective synthesis also reuses validated completed passes instead of repeating them; identity includes checkpoint, prompt, schema and worker, and cached output must pass current validation.

## Reproduce

Start an isolated editor with fresh `TIMELINE_PROJECTS_DIR` and `DREAMCUT_PROFILE_DIR`, and point `TIMELINE_EDITOR_BASE_URL` at it. Use the same storage environment for each command:

```sh
pnpm verify:still-session
pnpm exec tsx scripts/benchmark-agent-efficiency.ts
pnpm exec tsx scripts/benchmark-warm-stills.ts
node --import tsx --test src/lib/instruments/*.test.ts src/lib/render/*.test.ts
pnpm typecheck
```

Run timing comparisons without competing render work. Generated receipts live under ignored `testing/results/agent-efficiency/` and `testing/results/still-session/`. The benchmark fixtures do not authorize exporting a creator’s project.

## Required protections

- Rendering always receives the complete composition. Temporal cache scoping requires supported independent rows, explicit lane order and the supported clock; coupled or unknown effects retain full dependencies.
- Media, code, font and renderer changes invalidate reuse. Missing identity, corruption and failures must fail closed. Same-path or same-size replacement must be detected.
- Caption measurement reuse binds image bytes and calculation dependencies. Real font layout, overlays and spatial expectations remain required.
- Warm workers are opt-in, scoped to checkout/server/code identity, reset on media changes and bounded by permissions, serialization, timeouts and idle expiry.
- Compact change reports retain warnings and coverage loss. An unchanged frame does not answer a new review question.
- Accepted-field and review-control tests verify enforceable behavior; they do not measure fewer human correction rounds. Retrospective reuse does not waive adoption or approval rules.

Focused correctness and pixel comparisons accompanied the recorded measurements. They do not establish a green whole-repository suite or certify all projects.
