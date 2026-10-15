# Slice retrospective pilot

Implemented locally September 20, 2026. Explicit dry review only. No real project retrospective or export was run during implementation. No creator preferences, learned skills or timelines were changed.

## Entry points and authority

Use the existing project Memory endpoint, `POST /api/projects/<project>/memory`, with `{"action":"retro","workflow":"slices-v1"}`. This freezes the current checkpoint and queues the new runner under the existing exclusive retrospective lock. Learning and agent-retros settings must already allow execution; this endpoint does not enable them. Jobs remain queued when paused. Existing UI requests and automatic export checkpoints still use the previous runner.

Read progress without resuming workers using `GET /api/projects/<project>/memory?coordinator=<retro-id>`. The normal Memory GET retains its existing queue-resume behavior. Retry with `{"action":"retro","id":"<retro-id>"}`; retry cannot change the frozen workflow or limits. A finished dry job is not rerun. Start a new checkpoint for changed inputs.

Dry findings are stored, never sent to adoption. The old adoption function explicitly rejects slice checkpoints. A successful review with unresolved gaps is `complete_with_gaps` in coordinator state; the parent retro is complete with the gap count in its summary. This means review finished, not lessons applied or all evidence sufficient.

## Actual flow

Frozen checkpoint → deterministic inventory → relevant slice reviewers → one requested-routing supplement → independent per-case verification against original evidence → exact finding accounting/consolidation → saved dry results.

Six initial slices: captions/text, music/audio, timing/pacing, composition/motion, editorial structure, workflow/delivery. Multiple slices may review the same case; they are not independent examples of a human preference. Explicit event aliases share an item. Other similar snapshots are not automatically collapsed. Shared element IDs and overlapping timeline intervals connect cases, including reversals. Unclassified evidence goes to workflow instead of disappearing.

Each reviewer must assess every assigned item; no lesson is valid. Findings require real packet citations and labeled explicit/inferred/unknown reasoning with alternatives. A separate verifier rechecks all original case evidence, including no-lesson decisions, and accounts for every candidate. Consolidation accounts for every verified finding; it cannot invent new findings or raise confidence when merging. Skill candidates require supplied skill content. Missing skills and privacy/perceptual limitations are visible in state and packets.

## Durable state and bounds

Files are under the project's existing `memoryDir()/coordinators/<retro-id>/`: `inventory.json`, `state.json`, `packets/`, and `attempts/`. Packets preserve assigned IDs, selected skill contents, schema and hashes. Attempts retain rejected model outputs too. These are local records, not an immutable audit database or a replacement for edit history. Configured model inference may still use a remote provider; local records do not mean offline inference.

Optional `limits` on creation: concurrency 1–3 (default 3); calls 1–120 (default 36); per-request prompt+schema character bound (default 180,000); total input-character bound (default 2,000,000); timeout default 180 seconds per worker. Limits are validated and frozen. These are character/call bounds, not measured token billing limits. Each packet permits at most two attempts across retries. Counters are saved before dispatch. Successful outputs are validated and reused on restart; failed output is preserved. Concurrent completion order does not affect packet identity.

Connected cases and final-timeline context are not silently truncated. An oversized indivisible case fails with an explicit error and retained partial work. Budget exhaustion likewise fails rather than claiming coverage. This can block large, heavily connected projects; finer case packaging is a future improvement. One supplement wave is allowed; unresolved routes are reported by verification. Worker schema caps findings at 100 with an overflow flag; final results do not use the legacy 20-finding cap. Citation limits still apply to merged findings and fail explicitly if exceeded.

## Verification and remaining gates

Tests live in `src/lib/local-store/retro-coordinator.test.ts`, alongside existing attribution, editing-memory, retro, inference, render and proposal-gate tests. Fixtures check routing/aliases, linked cases, exact coverage, concurrency, resumability, budget retention, oversized cases, supplement expansion, consolidation confidence, dry-adoption rejection, parent lifecycle and Memory API entry points. Test projects are disposable and worker responses are mocked. TypeScript validation is also required.

September 20 implementation verification: the targeted regression run passed **67 tests**, including 10 coordinator tests; `tsc --noEmit` passed. Targeted `git diff --check` passed. This is not a full repository suite, native PR review, or real-model qualification.

Not yet verified: real-model quality/omissions against a human checklist, real large-project packet fit, live process-kill recovery, or live UI presentation. No dedicated coordinator UI or main-chat notification integration is added. Hooks were not changed or newly trusted. They still capture/check closeout rather than run retros.

Next rollout gate: an explicitly requested real dry review, compared against the existing review and human expectations. Only after that should a separate change add transactional adoption, approval UX and opt-in export routing. The proposed architecture remains in `docs/wiki/retro-coordinator.md`.
