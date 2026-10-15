# Slice-based edit retrospective coordinator

Status: **explicit dry-review runner implemented locally, 2026-09-20; automatic adoption/export rollout pending**. The existing export runner is unchanged. See the [implemented pilot contract](../architecture/slice-retro-pilot.md) for entry points, limits, tests and remaining gates. The design below includes future capabilities; it is not a claim that every stage is enabled. [retrospective contract](../standards/export-retrospective-contract.md).

## Decision

Review the edit through focused **editorial slices**, then reconcile their findings. A slice is an area of the edit—text/captions, music/audio, timing/pacing—not a skill and not an arbitrary chronological chunk. Each slice can use several relevant skills. Preserve the entire decision sequence within that area, including proposals, human changes, rejected alternatives, reversals and the delivered state.

Use the existing frozen checkpoint and Editing Memory ledger. Add orchestration and coverage receipts, not another history database. Keep the existing export/manual triggers and separate evidence capture from learning. Hooks continue to check capture/closeout; they do not start an export or a retrospective.

```text
Frozen edit checkpoint
        ↓
Evidence inventory + slice routing
        ↓
Focused slice reviewers (bounded parallel work)
        ↓
Coverage check + cross-slice/contradiction review
        ↓
Coordinator consolidates cited findings
        ↓
Existing personal-style policy / human-approved skill changes
```

## Initial slices

| Slice | Main questions | Example skill references | Cross-slice dependencies |
| --- | --- | --- | --- |
| Text & captions | Wording density, line grouping, typography, placement, highlighting, readability; what did the human change? | caption-craft, video-typography, embedded workflow contracts | Speech timing, subject clearance, pacing |
| Music & audio | Track choice, voice/music balance, fades, envelopes, SFX, energy, transitions and masking | music-direction, music-audition, audio-balance, sound-design | Cuts, hook timing, narration, silence |
| Timing & pacing | Starts/ends, gaps, holds, source boundaries, cut rhythm, caption/speech synchronization | cut-pacing, visual-timing, talking-video-editing | Captions, music beats and voice cadence |
| Visual composition & motion | Layout, scale, hierarchy, overlaps, motion, effects, picture treatment | spatial-composition, motion-graphics, video-compositing | Caption clearance, timing, story emphasis |
| Editorial structure | Hook, beat order, emphasis, supporting shots, story clarity and retained alternatives | editorial-assembly, editorial-intent-planning, planned-shot-craft | All creative slices |
| Workflow & delivery | Proposal friction, approval/override patterns, preparation failures, output settings and delivery checks | open-edit-proposals, editor-media-preprocessing, platform-video-delivery | Technical bugs versus taste across all slices |

These are seed mappings, not a permanent exhaustive list. Resolve names against the **frozen skill catalog**, supply the full relevant skill instructions and evolution history, and explicitly report a missing skill. Do not load or run all skills merely because they exist. A quiet slice gets a recorded `not_applicable` result, not an invented lesson or unnecessary worker.

Music/timing is a particularly important joint view. For example, a user shortening a caption hold and shifting a music accent creates one linked case reviewed by captions, timing and audio—not three independent confirmations of a preference.

## 1. Build an inventory before inference

Create stable review-item IDs tied to canonical evidence IDs. An item describes a decision/change, not every duplicate snapshot. Preserve child evidence references instead of replacing the originals with an agent summary.

Each item records:

- checkpoint ID and hash; original chapter/event/proposal IDs;
- timestamp/order, affected element IDs and timeline interval when available;
- actor, initiating actor, attribution source and explicit attribution gaps;
- before/after fields, proposal option/selection, recorded reason if present;
- related items: predecessor, revision, reversal, chosen alternative, resulting final state;
- primary slice, additional slices, route basis and unresolved routing flags.

Use deterministic field/type rules for initial routing: typography → captions, gain → audio, timing fields → pacing, etc. Then a routing pass may add relationships from semantic evidence. Never let the model discard IDs. Every inventory item must have a destination or an explicit `unclassified` entry. Repeated snapshots/events of one action share a case ID and cannot inflate evidence strength.

First release uses the full frozen history. Later incremental reviews may skip previously assessed unchanged cases only when the prior checkpoint, item hashes, skills and question are unchanged. A new correction or new review question reopens related earlier cases. Do not reduce an edit's reasoning to changes since the last export without its antecedents.

## 2. Assemble slice packets

Each packet contains the complete relevant decision chain, final effective state, explicit human directions, scoped personal style, all applicable full skill texts, and neighboring context needed to interpret it. It lists exact review-item/evidence IDs and what private data was omitted.

Examples:

- Captions receive all caption revisions plus the relevant speech timing and subject-placement facts—not the entire unrelated music history.
- Audio receives track choices, gain/envelope changes, proposal alternatives, affected speech windows and cut locations.
- Timing receives the relevant cut/caption/audio histories together where they share an interval or dependency.

Packet size is bounded. Split an oversized slice by **linked decision cases**, retaining required antecedents and final state in each packet. Record boundaries and cross-packet links. If an indivisible case exceeds the limit, mark it blocked; do not truncate it silently. The coverage budget counts payload plus skills/instructions, not rows alone.

History is not perceptual proof. Reviewers may reason from logged edits but cannot claim to have watched or listened. Attach existing frames, measurements or listening notes with their coverage/version. Missing perceptual evidence limits a claim. New rendering, paid analysis or media processing needs its normal authorization; the coordinator does not gain those powers from a retro request alone.

## 3. Run focused reviews

Start with at most three concurrent slice workers, configurable per job. Reuse the existing bounded, read-only worker adapter. Each worker returns structured data and cannot write preferences, skills, history or timeline state.

Required worker output:

- `assessments`: one outcome per assigned review-item ID—finding, no lesson, insufficient evidence or needs another slice;
- `findings`: observation, personal preference, skill candidate, project-specific experiment or technical bug;
- `reasoning`: explicit/inferred/unknown basis, rationale, uncertainty and plausible alternative explanations;
- evidence and counterevidence IDs, relevant skill, exact proposed instruction if applicable;
- final-state check, cross-slice dependencies and coverage gaps.

An unexplained human change is still useful evidence. Infer its likely purpose, label the inference and compare alternatives. One clear human choice may support a personal preference. A technical correction must not automatically become taste; a broad taste choice must not automatically become a universal skill rule. Unknown legacy actors remain unknown.

No mandatory lesson count. If a result budget is exceeded, split the review or emit an explicit overflow/blocker; do not silently keep only 20 findings. Existing result-size limits must be redesigned before this runner replaces the old one.

## 4. Check coverage and relationships

Two different checks are required:

**Deterministic accounting:** every assigned item returned a valid assessment; IDs belong to the frozen checkpoint; all required slice assignments completed; duplicates and missing results are visible. This proves accounting, not that the reviewer noticed everything.

**Independent evidence review:** a separate review pass receives the candidate findings **and their original evidence packets**, not just summaries. It checks weak inferences, abandoned variants, duplicate evidence and missed relationships. It also samples no-lesson assessments and revisits all flagged/unclassified or cross-slice cases. Sampling scope remains explicit—it is not proof every interpretation was checked.

Examples requiring joint review:

- Quieter music may reflect voice intelligibility, not a permanent preference for low-energy tracks.
- A longer caption hold may be needed for reading, even if pacing alone favors a faster cut.
- A caption moved upward may avoid a face or platform overlay rather than establish a global placement rule.
- A timeline trim may remove a technical glitch rather than establish a preference for faster speech.

Cross-slice reviewers can request reassignment or one bounded clarification pass. Unresolved disagreements remain recorded and cannot become conflicting active defaults. Avoid endless “review the reviewer” recursion.

## 5. Consolidate and adopt once

The coordinator merges equivalent findings using shared case/evidence IDs, retaining every contributing review and rejected interpretation. It checks proposed instructions against current applicable guidance before adoption. A changed skill/profile since the checkpoint is a reconciliation condition, not permission to overwrite the newer version.

Reuse existing policy:

- clearly supported personal style can become active, with inference provenance retained;
- uncertain or contradictory personal findings stay suggested;
- skill improvements remain pending human approval and keep their evidence/evolution trail;
- technical bugs become diagnostic findings, not automatic code changes;
- project-specific experiments remain project-specific;
- no lesson remains a successful result.

Adoption is idempotent per checkpoint + coordinator version + canonical finding ID. A failed/incomplete run must not partially promote some slices while implying the whole review completed. Collect/verify first, then apply the validated result through the existing writer. Retry failed slices without rerunning successful unchanged ones or duplicating preferences.

## Durable job and failure model

Extend the existing retrospective record rather than creating another top-level store. Keep stage receipts under its existing memory area:

`inventory → routed → reviewing → verifying → consolidated → complete`

Any stage may be `paused`, `failed` or `needs_attention`. “Complete with documented gaps” must be distinct from evidence-complete. Capture checkpoint hash, coordinator/router version, packet hashes, assigned skills/versions, worker attempts, timings and outputs. Persist before scheduling the next phase. A crash resumes from validated receipts; changed inputs invalidate dependent stages.

Set per-worker timeout, total concurrency, bounded retries and a per-job call/token budget before dispatch. When exhausted, stop with durable partial coverage and zero implied success. Do not run a fresh model job on every hook or every tool call. Existing export completion and explicitly requested manual retros are the entry points; canceled/failed exports remain excluded.

## Visibility in the main conversation

The agent should be able to read one job summary showing:

- which slices were selected and why;
- assessed/total items, skipped slices and unresolved items;
- which workers completed, failed or need attention;
- candidate lessons, inferred reasons, supporting edits and counterexamples;
- what was activated, what awaits approval and what was rejected.

The main agent presents this in the active conversation when it runs or checks the retro. Background export completion does not magically inject a message into an unrelated Codex conversation: that requires a separate supported notification integration. The durable job summary and existing Memory surface are the source of truth either way. No new chat per slice.

## Minimal rollout

1. Ship attribution/inference plumbing independently (implemented in the accompanying change; tests are in the source audit).
2. Add a pure inventory/router and coverage validator; prove case deduplication and multi-slice routing on fixtures before adding model calls.
3. Run the slice coordinator in explicit **dry-review mode** against a frozen checkpoint; save outputs, adopt nothing. Compare findings and omissions against the existing retro and a human checklist.
4. Add bounded parallel workers, restart/resume and independent cross-slice review.
5. Enable the coordinator for manual review, then opt it into the existing export path after acceptance. Preserve one adoption owner; never run two auto-adopting retro pipelines on the same export.

## Acceptance cases

- Caption-only project: text review runs; audio is explicitly not applicable.
- Music/caption timing correction: all necessary slices receive the same linked case; no duplicate learning.
- User overwrites an agent suggestion: author and approver/initiator remain distinct.
- Unexplained but clear human correction: labeled inference can produce a supported style lesson.
- Technical sync repair: no invented taste rule.
- Reverted experiment: final state prevents promotion of the abandoned treatment.
- Legacy actor unknown: remains unknown; uncertainty is carried forward.
- Missing media evidence: no claimed listening/viewing.
- Over-budget packet, malformed worker result, invented citation or omitted item: explicit failure/gap, not silent coverage.
- Worker crash/retry: unchanged completed slices reused; no duplicate adoption.
- Changed skill or preference during review: reconciliation before application.
- All slices find no new lessons: complete, zero changes.

The goal is focused review depth plus auditable coverage—not a promise that more agents make every inference correct.
