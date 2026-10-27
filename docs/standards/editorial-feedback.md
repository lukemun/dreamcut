# Editorial feedback and response evidence

The local feedback ledger records direction, reasons and response links. It does not upload data,
authorize timeline edits or prove that every conversation turn was captured.

## Capture

Use MCP `editing_feedback_record` with the existing project, stable session/turn identifiers, direction,
optional stated reason, provenance and optional targets. `user_words` means supplied wording, not a
verified quote merely because an agent supplied it. `agent_paraphrase` and `inferred_reasoning` remain
explicitly labelled. The event actor identifies the recorder. Do not mix an invented reason into a
user-word record; inferred reasoning should be a separately labelled record.

Record one record per separate ask, each with its own ordinal, quoting the words for that ask. A
message such as "quote it here, use image 5005 instead, and blur my background" is three records.
A request counts as handled once any proposal links to it, so a bundled record hides its undrafted
parts from the creator's queue ("Up next · … · Not drafted yet" in Proposals).

Retries with identical content/session/turn/ordinal return the same receipt. Different content requires
a new ordinal or turn. Correcting a direction supplies `supersedes_event_id`; the old immutable event
and its proposal links remain intact. Legacy summary-only bridge calls remain supported and labelled
as agent interpretations. The profile is never modified by capture.

## Respond and account

Put event IDs in proposal `responds_to_feedback_ids`. The store rejects missing, damaged or foreign-project
feedback. Human approval carries links and a transaction ID into history and memory events, including
batch approvals. Granted workspace mutation tools accept the same optional IDs. The proposal gate is
unchanged. Undo/Redo history records which snapshot was restored and preserves its response links.

Call `editing_feedback_check` at editorial turn closeout. It is read-only and never dispatches retros.
Unaccounted records have neither linked work, a correction, nor a declared disposition. Use
`editing_feedback_disposition` for addressed/deferred/unresolved explanations. This is an agent report,
not human satisfaction. Approval, rejection and supersession remain separately visible; current proposal
state follows Undo/Redo. A linked proposal can still be pending or unsuccessful.

Human-entered review-mark notes and explicit proposal rejection reasons are captured through the same recorder. Saving a note is not a response to that note; no motive is invented for other manual property changes.

Project history (Edit history → Full history) shows each recorded direction in the creator's words with the
cards that answer it and their outcome, interleaved with timeline changes. It does not show provenance, reasons,
coverage counts or raw snapshots, and offers no direction editing; those stay in the recorded evidence and the ledger download API.
Export checkpoints freeze this coverage with the existing events and proposals. Retrospective projection
retains direction/reason provenance and response links. Older checkpoints without these fields stay readable.

## Limits

No hook can prove unrecorded conversation coverage. The existing hook trust/runtime verification remains
separate. No default reason is inferred for manual property edits. External clients that omit response IDs
remain unlinked. A declaration of addressed is not independently verified. Multiple corrections can branch
from one original record; the UI retains every branch rather than choosing a winner.

## Verification — 2026-09-26

- Typecheck passed. The affected feedback, attribution, memory, retro, proposal, frame-mark and MCP
  suites passed all 57 tests. Integration fixtures cover single/batch approval, Undo/Redo, frozen
  checkpoints, large response histories, retry conflicts, foreign/damaged references, GUI notes and
  rejection reasons. No real project, export or retrospective was run.
- A full repository test run during implementation reported 1,511 passes, four failures and one skip.
  The failures are existing source-string assertions in `inspector-ui-contract.test.ts` about proposal
  cards, batch action layout, option shortcuts and preview controls. They inspect other pending UI work;
  this change does not repair or claim to validate that work.
- Isolated browser verification used a temporary project/profile: correction and original retained,
  new direction with no reason, human attribution, persistence after reload, help content, Escape/focus
  restoration, and direction cards/forms at 1280px and 390px. No browser console errors after the
  working page loaded. The existing page header navigation clips at the narrow width; direction cards
  and forms fit. No animation or playback behavior was changed.
- The normal Turbopack test server could not load Google Fonts. Verification used the alternate
  development build with fallback fonts. Both temporary servers were stopped and their generated
  TypeScript configuration entries removed. Production font fidelity was not tested.
- Native PR review, publication and remote upload are outside this implementation verification.
