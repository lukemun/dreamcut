# Memory — local learning and retrospective architecture

Status: first implementation shipped locally; longer-term design below
Date: 2026-09-12

September 20 reading note: the dated initial implementation below is historical. Current [export retrospective behavior](standards/export-retrospective-contract.md) includes tracked CLI delivery, recoverable review dispatch, request-level edit attribution and labeled inference with promote-first personal preferences. The [session learning hook pilot](wiki/session-learning-hooks.md) is installed but still has a separate trust/runtime gate. The [slice-based retro coordinator](wiki/retro-coordinator.md) is a new proposed design, not the current runner. Neither replaces the canonical history or authorizes a new export/retro run.

## Implemented boundary (2026-09-12)

The editor now includes the history/sequence drawer, structured personal defaults,
MCP preference context, export checkpoints, optional Codex retros, and grouped review
marks with notes/status. Existing snapshots are projected as legacy evidence with
unknown attribution rather than fabricated author/motive information.

Implementation deliberately differs from the initial proposal in these places:

- Immutable, individually hashed event files are the recovery source; JSONL is an
  export projection. This avoids cross-process append interleaving. Hashes detect
  accidental content corruption, not malicious deletion or a rewritten hash chain.
- Retros save durable checkpoints and run after successful editor/API exports.
  They use a bounded read-only Codex process, strict output schema and evidence-ID
  validation. Provider analysis is opt-in; local persistence is cross-platform.
  Interrupted jobs can be recovered explicitly in the drawer, not by an installed
  always-on worker. Direct CLI renders are outside this initial export hook.
- All inferred preferences require review. Two distinct citations and no reported
  counterevidence are required even to create a suggested preference; independence
  is additionally assessed by the retro and human review, not guaranteed by IDs.
- Skill findings now save frozen evidence as targeted improvement proposals. Memory
  alerts for pending proposals; approval updates the version-checked skill and appends
  its evolution log, while rejection preserves the evidence without changing behavior.
  Automated comparative evaluation, cross-project sequence lineage, profile import/delete
  UI, and comprehensive event coverage beyond existing safe-write snapshots/proposals/
  marks/exports are follow-on work, not claimed complete here.
- Active personal defaults are supplied through timeline MCP context. They never
  authorize bypassing previewable proposals or change shared skills on disk.

Retrospective inputs include changed field names and deletion state so privacy-projected diffs do not imply a no-op.

## Decision

Add a local, inspectable **Memory** system with two distinct layers:

1. **Core editing skills** ship with DreamCut and are upgraded with the app.
2. **My editing style** is a local overlay learned from this user's explicit directions and repeated editing behavior.

Every editing action emits an append-only event. Every successful export freezes a checkpoint and queues a non-blocking retrospective. The retrospective may add observations and tests automatically, but it does not silently rewrite core skills. Personal rules graduate through evidence thresholds and remain visible, reversible, and attributable.

This is an evidence-to-improvement loop, not model retraining.

## Why this shape

DreamCut already stores most of the evidence but not the story:

- project `history/` contains complete timeline and metadata snapshots around mutations;
- proposal files retain the agent's summary, rationale, options, and approval/rejection outcome;
- review marks retain the frame, active elements, and source anchor;
- render jobs identify export boundaries;
- `renders/AUDIT.md` records retained delivery artifacts;
- task metrics can record phases and corrections.

The missing layer is a stable event vocabulary linking those records. CloudEvents provides a good minimal event envelope, while OpenTelemetry's GenAI conventions provide useful trace identifiers and agent/tool vocabulary. Neither should dictate the product model: keep a small DreamCut schema and provide adapters later.

The learning gate follows a deliberate retro discipline: capture first, then separately decide whether a lesson is about this project or the user's enduring style. OpenAI's published self-improving-agent pattern makes the same separation: production creates evidence, reviewed differences become findings, and only repeated grouped findings become bounded improvement tasks.

## System flow

```text
UI edit / proposal / mark / import / export
                  │
                  ▼
        append-only edit ledger
                  │
      ┌───────────┴───────────┐
      ▼                       ▼
This edit / sequence map   successful export checkpoint
                                  │
                                  ▼
                         local retrospective job
                                  │
                   ┌──────────────┴──────────────┐
                   ▼                             ▼
          observations + examples         candidate preferences
                                                    │
                                     evidence and conflict gate
                                                    │
                                                    ▼
                                        My editing style overlay
```

Rendering and downloading never wait for the retrospective. A failed render may create an operational finding, but not an editing-style preference.

## 1. Canonical edit ledger

Store one append-only JSON object per line at:

```text
projects/<project-id>/memory/edit-events.jsonl
```

Use a CloudEvents-inspired envelope:

```json
{
  "specversion": "1.0",
  "id": "uuid",
  "type": "dreamcut.timeline.proposal.approved.v1",
  "source": "project/example-edit",
  "subject": "sequence/main",
  "time": "2026-09-12T14:41:03.172Z",
  "session_id": "uuid",
  "trace_id": "uuid",
  "actor": { "kind": "human", "id": "local-user" },
  "origin": "proposal_review",
  "context": {
    "prompt_ref": "local transcript pointer or null",
    "mark_ids": ["M1-id"],
    "proposal_id": "proposal-id",
    "option_id": "natural-marked-pause-cut"
  },
  "change": {
    "before_revision": "sha256",
    "after_revision": "sha256",
    "operation": "source_range_cut",
    "semantic_summary": "Removed 1.50 s pause between complete words",
    "touched_element_ids": ["element-id"],
    "history_before": "snapshot-id",
    "history_after": "snapshot-id"
  },
  "reason": {
    "user_words": null,
    "agent_rationale": "Word-aligned pause around M1",
    "confidence": 0.98
  },
  "outcome": {
    "decision": "approved",
    "numeric_overrides": [],
    "later_reverted": false
  }
}
```

Important distinctions:

- `user_words` and `agent_rationale` never share a field.
- Approval is weak positive evidence, not proof of a durable preference.
- A user-authored numeric override, direct correction, rejection reason, or repeated manual edit is stronger evidence.
- Reverts and later contradictory edits remain in the ledger and reduce confidence; events are never rewritten.
- Large before/after timelines stay in `history/`; the ledger points to them and stores only a semantic diff.
- Sensitive transcript text is opt-in and local. The default is a bounded excerpt or content hash, not the full conversation.

Core event families:

- `timeline.edit.committed`
- `timeline.proposal.created|approved|rejected`
- `timeline.mark.created|resolved|deleted`
- `sequence.created|forked|selected|archived`
- `media.imported|derived|placed|removed`
- `export.started|completed|failed`
- `retro.started|completed|failed`
- `preference.observed|suggested|activated|overridden|retired`
- `skill.candidate_created|validated|promoted|rejected`

## 2. Sequence and change map

Build the map from ledger events and existing snapshots; do not introduce a second mutable timeline database.

The UI has two coordinated views:

### Sequences

A lineage graph of the working sequence, auditions/forks, approved proposal checkpoints, and exports. Each node shows duration, aspect ratio, last edit time, and export state. Selecting a node opens its timeline state without changing the active sequence.

### This edit

A chronological index grouped into meaningful chapters rather than 175 raw snapshots:

- Sources and preparation
- Story and pacing
- Supporting visuals
- Captions and typography
- Audio and music
- Review decisions
- Exports and retros

Each row shows who initiated it, what changed, why, the affected time range, and before/after preview when available. Marks appear in the same index and can be filtered to Open, Addressed, or All.

This follows the useful part of Final Cut Pro's Timeline Index: clips, tags, and roles are searchable in one chronological surface, and selecting an item seeks the playhead.

## 3. Local editing profile

Store personal data outside the repository and outside project folders:

```text
macOS:   ~/Library/Application Support/DreamCut/profiles/<profile-id>/
Windows: %LOCALAPPDATA%\DreamCut\profiles\<profile-id>\
Linux:   $XDG_DATA_HOME/DreamCut/profiles/<profile-id>/

observations.jsonl
preferences.json
retros/<export-id>.json
skill-overlays/<skill-name>.md
evals/<skill-name>.jsonl
```

A profile left under an earlier product folder (`OpenEdit`, then `OpenSequence`) is moved to
the `DreamCut` folder on first use; `profileDir()` owns that migration.

`STYLE.md` is the authoritative active personal document. The User → My style
page presents its sections and an explicit Edit / Save / Cancel flow. Direct file
edits are read by the same runtime path. `## Vertical videos` scopes its content
and lower-level headings to 9:16; the next peer heading returns to all edits.
Unknown headings remain part of the instruction context. No model is needed to
parse or save style. Current instructions and project exceptions retain precedence.

`preferences.json` retains learning settings, original evidence, pending/retired
records and project exceptions. Its active personal rows are metadata only: they
cannot override the document. Existing preference commands apply deltas to Markdown
rather than replacing it. The old projection and preferences are backed up before
migration, and content-addressed revisions live in `style-history/`. Saves check the
expected document hash; profile writes also reject stale read state. App writers
serialize through a process lock. External editors do not participate in that lock,
so users should avoid saving the file and UI simultaneously; subsequent reads
observe external changes and the UI preserves conflicted drafts.

Named setting bundles remain under `personal-styles/` and appear in Properties → Templates.
They are optional reusable treatments, not automatically active personal defaults.

Precedence is explicit:

```text
current user request
  > project-specific decision
  > active personal preference with matching scope
  > core DreamCut skill
  > product default
```

## 4. Learning and promotion gate

Use four states:

1. **Observed** — one local event or retro finding; has no runtime effect.
2. **Suggested** — repeated consistent evidence or a strong explicit correction; shown to the user.
3. **Active** — applied as a scoped personal default; visible and reversible.
4. **Retired** — contradicted twice, explicitly disabled, or made obsolete; preserved for provenance.

Promotion policy:

- An explicit statement such as “always keep my captions to four words” may become Active immediately, with the exact quote and scope visible.
- A repeated correction in at least two independent edits may become Suggested.
- Merely approving an agent recommendation never auto-activates a preference.
- A one-project treatment remains project memory unless the user broadens it.
- Conflicting evidence narrows scope or lowers confidence instead of choosing whichever event happened last.
- Every active rule has Undo/Disable, provenance, and “applies when” controls.

Core skills are upgraded differently. A local retro may stage a targeted instruction with frozen evidence, but it cannot apply it. Memory requires explicit approval and records every approved revision in that skill's evolution log. The review surface compares the candidate's captured skill version with the current one. An unchanged skill receives the normal append; a changed skill preserves all newer content and additively merges only the bounded refinement after warning the reviewer; an already-incorporated lesson reconciles its evidence and evolution history without duplicating text. Missing or unassigned skills remain blocked. Repository review and broader evals remain appropriate before publishing the changed core skill. This prevents an unattended retro from turning one person's taste into everybody's default without stranding valid lessons whenever adjacent skill work lands first.

### Library consolidation

The Memory page exposes one **Review and consolidate skills** action for the whole core-skill library. It creates one version-pinned, read-only maintenance job rather than one job per skill. A manager pass must inspect every current skill exactly once and may select at most eight high-priority skills for deeper work. Selected skills receive bounded specialist passes, with primary-source research required when the manager classifies the skill as research-dependent. An independent evaluator reviews every proposed replacement before it can enter the bundle.

The result is one review bundle containing the complete inspection map, actual worker count, research sources, forward-evaluation cases, evaluator verdicts, and full before/after skill text. Only evaluator-approved, non-no-op replacements are actionable. Human approval applies every included `SKILL.md` and evolution entry as one rollback-capable operation. Any skill-library change after the job snapshot marks the entire bundle stale; partial approval is deliberately unsupported so accepting one change cannot strand the rest.

## 5. Export retrospective

Alongside editorial findings, review avoidable agent effort and delay under the
[current retrospective efficiency guidance](standards/export-retrospective-contract.md#review-agent-effort-and-time-to-a-reviewable-proposal).
Use available execution evidence to distinguish redundant work from justified
rechecks and propose measurable improvements to procedures or tooling. The
historical flow below does not imply that execution traces or latency metrics are
already included in automatic retro packets.

On `export.started`:

1. record the exact timeline revision, active elements, muted lanes, output format, app/skill versions, and event range since the previous export;
2. create a retro job record with status `waiting_for_render`;
3. render normally.

On `export.completed`, run the retro asynchronously against the frozen checkpoint:

1. reconstruct the change chapters from the ledger;
2. compare proposals with final approved states and later manual overrides;
3. find repeated corrections, rejected defaults, reverts, unresolved marks, and operational failures;
4. route each finding to project memory, personal preference, core-skill candidate, product bug, or no lesson;
5. add or update a local eval fixture for any proposed reusable behavior;
6. write a concise retro artifact and notify the UI when ready.

The agent receives read-only project evidence and writes only to the retro staging directory. A deterministic promoter validates schema, recurrence, conflicts, and scope before changing personal preference state. The agent never edits executable application code as part of export.

Retro output:

```json
{
  "export_id": "uuid",
  "timeline_revision": "sha256",
  "summary": "Seven review rounds produced a tighter dialogue-first social cut.",
  "findings": [
    {
      "owner": "caption-craft",
      "disposition": "suggest",
      "preference": "Use 3–4 word single-line captions in vertical social edits",
      "scope": { "format": "short_social", "aspect_ratio": "9:16" },
      "evidence": ["event-id-1", "event-id-2"],
      "counterevidence": [],
      "confidence": 0.93
    }
  ]
}
```

## 6. Product surface

Add **Memory** as a project tab. It covers both personal style and the history of how an edit evolved without implying that every visual style choice is global.

The drawer has three tabs:

- **My style** — active and suggested personal preferences, grouped by Pacing, Captions, Visuals, Audio, and Delivery. Core defaults are visible but read-only and visually separated.
- **This edit** — the chronological chapter/index view, sequence lineage, proposals, marks, and exports.
- **Retros** — one report per export with changes, lessons, confidence, and resulting preference updates.

The header button shows a quiet badge only when a new suggestion or retro needs attention. Learning stays unobtrusive during editing.

### Bottom transport cleanup

Use the full three-column grid that already exists:

```text
[Undo Redo] [Mark ▾ | Marks 1]       [Back Play Forward]       [00:33.9 / 01:15.3]
```

- Keep editing/review actions left.
- Keep playback geometrically centered.
- Move timecode into its own right-aligned grid area.
- Combine Mark and Marks into one compact review group; move Clear all into the list.
- Replace the fixed far-right marks panel with a left-anchored **Review index** above the transport. Keep it open while seeking between marks.
- Give marks optional short notes and state: Open or Addressed. A proposal referencing a mark links back to it; approval can offer to mark it Addressed.

This avoids the current cross-screen interaction where a left-side control opens a panel on the far right.

## 7. Reliability, privacy, and recovery

- Local by default; no sync or model upload without an explicit setting.
- Redact absolute paths, credentials, signed URLs, and raw private transcripts from agent inputs.
- Hash every ledger line with the previous line's hash to make accidental corruption detectable.
- Rotate indexes, not evidence. JSONL remains the recovery source; SQLite/FTS may be a disposable read model.
- Bind retros to the exported revision so later edits cannot change their evidence.
- Version profile schemas, core skills, personal overlays, prompts, model, and reasoning settings.
- Run targeted and regression evals before activating a qualitative skill overlay.
- Never block export on retro failure. Show “Retro needs attention” and allow retry.
- Support Export profile, Delete local memory, Disable learning, and Reset preference while retaining an optional audit tombstone.

## 8. Delivery plan

### Phase 1 — understandable history

- Add event schema, append writer, hash chain, and backfill adapter over existing history/proposals/marks.
- Add Memory → This edit and the sequence map.
- Reorganize the transport and replace the marks popover with Review index.
- No learning yet.

### Phase 2 — export retros

- Add durable retro jobs and the export checkpoint hook.
- Add Retros UI and deterministic finding categories.
- Record observations only; no active preferences.

### Phase 3 — personal style

- Add profile paths, preference schema, scope resolution, precedence, and My style UI.
- Promote explicit persistent directives and surface repeated inferred preferences for approval.
- Load the bounded active overlay into proposal generation.

### Phase 4 — reviewed skill evolution

- Shipped: generate targeted skill-improvement proposals with frozen cases, alert in Memory, require explicit approve/reject, version-gate approval, update the skill, and append its evolution log.
- Follow-on: run comparative offline evals against frozen cases and a no-change baseline before repository publication.

## References

- [OpenAI: building self-improving agents from structured production evidence](https://openai.com/index/building-self-improving-tax-agents-with-codex/)
- [OpenAI: evals as Specify → Measure → Improve](https://openai.com/index/evals-drive-next-chapter-of-ai/)
- [OpenAI: step-level traces, human classifiers, and interactions that improve the next run](https://openai.com/index/openai-support-model/)
- [OpenTelemetry GenAI agent span conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md)
- [CloudEvents JSON event envelope](https://github.com/cloudevents/spec/blob/main/cloudevents/formats/json-format.md)
- [Apple Final Cut Pro Timeline Index](https://support.apple.com/en-au/guide/final-cut-pro/ver4e30596/mac)
- [Apple Final Cut Pro marker model](https://support.apple.com/en-euro/guide/final-cut-pro/ver397279dd/mac)
- [Adobe Premiere pause detection and removal](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/detect-and-delete-pauses-in-transcripts.html)
- [Experience Replay for Continual Learning](https://arxiv.org/abs/1811.11682)
