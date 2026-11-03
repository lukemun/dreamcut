# Prepared reveal sequences and proposal latency

`proposal_reveal_sequence` is a read-only compiler over existing proposal operations.
It accepts a base option, ordered actor IDs/labels, optional presence ranges and
linked audio IDs/offsets. It returns an ordinary option for normal preflight and
`proposal_create`. It does not prepare masks, import sources, approve or export.

The initial default is one **Time between entrances** control. `gap_mode: independent`
replaces it with adjacent-gap controls only when requested. Presence controls are
optional per actor. Actors remain separate editable clips. Timing bindings are
generated internally; callers do not calculate operation indices or multipliers.
Caller-supplied appearance controls remain in the returned option.

## Input and limits

The base option must already contain schema-valid prepared `create_visual` video
operations and optional `create_audio` operations. Actor IDs resolve these operations;
additional operations remain unchanged. Retain a base option without timing controls
for later compilation. This first adapter supports normal-speed, non-speech-bound
video, 2–16 actors, 30 fps timing, presence up to 3 seconds and gap ranges within
0.2–1.2 seconds. It rejects invalid source ranges, ambiguous ownership and direct
timing controls that conflict with generated controls. It does not implement an
arbitrary recipe language, a clean-plate end constraint or scene-handoff scheduling.
Use the appropriate existing workflow for those dependencies.

Retain source hashes/readiness receipts in the existing media system. A control-only
revision reuses supplied assets; the compiler cannot invoke segmentation or encoding.
`compile_ms` measures only compilation, not time to a verified proposal. Recompute
the proposal-level mutation caps from the returned option before submitting it.

## Review size

New options are admitted with at most 15 visible numeric sliders. Linked controls
count once; fallback controls are counted when no explicit plan is supplied.
Preflight and central `saveProposal` enforce the same budget. Historical records
remain readable and tunable; the cap is not a schema migration or automatic rewrite.
See the [control standard](../standards/inspector-information-architecture.md#first-proposal-control-coverage)
for smaller independent pieces versus dependent stages. The system rejects oversized
drafts with guidance; it does not guess editorial boundaries or silently hide controls.

## Private timing evidence

`proposal_work_record` writes separate local profile evidence under `proposal-work/`:

1. `start` creates an attempt and optionally links recorded feedback IDs.
2. `begin` opens a preparation, composition, validation, engineering, verification
   or waiting span; `end` records completed, failed or reused work.
3. `saved` links an actual saved proposal; `handoff` ends the attempt after spans close.
4. `report` returns capture-to-save, capture-to-handoff and individual spans.

The editing skill owns these markers. They are not automatic inference about every
tool call, original user-message timestamps, token attribution or creator acceptance.
Spans may overlap and must not be summed as wall time. Open spans and missing handoffs
remain unknown. Each revision gets a new attempt. Events have a 500-record limit per
attempt; no periodic cleanup or UI is added. Existing native usage/activity capture
remains separate. A failed telemetry call should be reported as a measurement gap,
not a reason to mutate or approve a timeline.

## Verification and evals

`pnpm exec tsx --test src/lib/agent/proposal-reveal-sequence.test.ts src/lib/observability/proposal-work.test.ts`
checks compiler behavior, shared versus independent timing, source preservation,
control admission and private attempt lifecycle. Existing timing/override tests cover
the common preview/approval derivation machinery.

`pnpm eval:reveals list`, `packet <case>` and `grade <case> <option.json>` expose
two synthetic component cases. They have no playable media or model runner. The
private footage candidate still needs a frozen isolated project and human review.
Neither component tests nor compilation duration establish an end-to-end speedup.
