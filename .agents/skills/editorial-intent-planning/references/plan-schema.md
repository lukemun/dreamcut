# Editorial intent plan schema

Store one JSON object per interpretation plan. This is an analysis artifact, not timeline state.

```json
{
  "schema_version": 1,
  "plan_id": "intent-<stable-id>",
  "project_id": "project-id",
  "route": "existing_timeline_proposal",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "request_text": "Verbatim user request",
  "timeline_revision": "revision read before planning",
  "marks": [],
  "intent_atoms": [],
  "grouping_decisions": [],
  "tasks": [],
  "unresolved_questions": [],
  "revisions": [],
  "execution": {}
}
```

## Required values

`route` is one of:

- `existing_timeline_proposal`
- `first_assembly`
- `agent_workspace_continuation`

Each entry in `marks` preserves evidence rather than only a timestamp:

```json
{
  "id": "mark-id",
  "label": "M1",
  "timeline_seconds": 12.4,
  "anchor": {
    "element_id": "element-id",
    "element_local_seconds": 2.1,
    "source_seconds": 48.7
  },
  "active_element_ids": ["element-id"],
  "points": [],
  "note": "User note, if any",
  "evidence_summary": "What is visibly or audibly happening near the mark",
  "evidence_refs": ["project-relative artifact or source reference"]
}
```

Each entry in `intent_atoms` contains:

- `id`
- `request_fragment`: the user's words, without reinterpretation
- `interpretation`: the smallest testable requested outcome
- `mark_ids`: zero or more referenced marks
- `scope`: `local`, `spanning`, or `global`

Each entry in `grouping_decisions` contains `atom_ids`, `decision` (`group` or `split`), and `rationale`.

Each entry in `tasks` contains:

- `id`, `title`, and `objective`
- `atom_ids` and `mark_ids`
- `affected_ranges` and `affected_element_ids`
- `evidence`
- `assumptions`
- `dependencies`
- `specialist_skills`
- `intended_changes`
- `acceptance_checks`
- `status`: `planned`, `ready`, `deferred`, `blocked`, `implemented`, or `declined`
- `disposition_reason` when the task is not implemented

`unresolved_questions` contains only questions whose answers could materially alter an outcome. Safe assumptions belong on their tasks.

`revisions` is append-only. Each entry records `at`, `trigger`, `previous_interpretation`, and `replacement_interpretation` when the user or new evidence corrects the plan.

`execution` is populated after work is prepared:

```json
{
  "proposal_sequence": [
    {
      "stage": 1,
      "task_ids": ["task-1"],
      "status": "pending_review",
      "proposal_id": "optional",
      "option_id": "optional",
      "timeline_revision": "revision used when this beat was proposed",
      "rebase_policy": "independent or strict"
    }
  ],
  "assembly_project_id": "optional",
  "task_operation_map": [
    {
      "task_id": "task-1",
      "operation_refs": ["proposal operation index, beat ID, or scene-state ID"]
    }
  ]
}
```

For an existing timeline, `proposal_sequence` is ordered by narrative position and dependency. Status is `planned`, `ready_for_proposal`, `pending_review`, `approved`, `rejected`, `stale`, `deferred`, or `blocked`. Disjoint beats may be pending together with `rebase_policy: "independent"`; dependent or overlapping beats use `strict` and are created only after their prerequisite resolves.

## Grouping example

The user marks two moments where the same lower third persists too long, then marks a third moment with noisy dialogue. Create one visual-cleanup proposal spanning the first two marks and one audio proposal for the third. If they touch disjoint elements, create both with independent rebasing. If the dialogue change moves the shared speech clock or retimes the lower third, keep the audio proposal strict and create it only after the visual proposal resolves.

## First-assembly example

For a new narrated piece, atoms may describe an opening claim, an explanatory comparison, a reveal, and a call to action. Group them into narrative beats, record spoken anchors and intended scene states, then map those tasks to the assembly beat map. Do not invent exact timings before the speech authority is established.
