# Proposal and review-control architecture

[Architecture overview](README.md) · Status: implemented proposal system with presentation contracts, reviewed 2026-09-28.

## Responsibility and design decision

The proposal system separates an agent's candidate edit from the creator's working cut. The same validated operations drive the candidate preview, the factual review description, and approved application. This keeps the agent's explanation from becoming a second, potentially inconsistent edit specification.

Human authority is the governing principle: recommendation, selection, playback, and tuning do not apply an edit. Approval is a distinct action. Bounded first-assembly grants are a separate [project-model](project-model.md) capability and never authorize self-approval.

## Data model and flow

A proposal carries an expected timeline revision and independently previewable options. Each option includes operations, a summary/rationale, and optionally an ordered `review_controls` plan. Persistent records retain review resolution and revision relationships; the active inbox is a projection of those records, not their deletion.

```text
agent intent → typed operations + control plan
  → proposal_create: validate exact draft → scoped spatial check (when it can move or cover anything)
  → persist proposal record with spatial_review (working cut unchanged)
  → derive selected option + temporary numeric overrides
  → combined preview + computed review rows
  → human approval under revision check and lock
  → before/after history + atomic application + review resolution
```

`deriveProposalTimeline` is the common semantic derivation. Preview is a read result. Approval revalidates against the working revision before writing. Stale proposals remain in the audit trail but are not actionable; explicit successor relationships replace previous drafts in the inbox while retaining them in internal history. Undo must restore both timeline state and the proposal states changed by approval.

## Agent procedure and software enforcement

The [overview diagram](README.md#proposal-flow-from-a-request-to-an-approved-change) starts with the creator's request and keeps preview, tuning, and the decision together. Under that experience, two kinds of responsibility cooperate:

| Responsibility | Owner and mechanism |
| --- | --- |
| Interpret the desired outcome and preserve its scope | The agent follows [open-edit-proposals](../../.agents/skills/open-edit-proposals/SKILL.md). For several commands, marks, or ambiguous grouping, it also uses [editorial-intent-planning](../../.agents/skills/editorial-intent-planning/SKILL.md). |
| Choose a method | The agent reads the relevant specialist skills and recipe. Examples include [spatial-composition](../../.agents/skills/spatial-composition/SKILL.md) for placement, or [mask-glitch](../../.agents/skills/mask-glitch/SKILL.md) plus [sound-design](../../.agents/skills/sound-design/SKILL.md) for the compound flash-and-click treatment. This is conditional task guidance, not a fixed list executed on every request. |
| Validate and inspect the candidate | `proposal_create` validates the draft and runs the scoped spatial assessment itself for every option that can move or cover something (`operationMayMoveVisuals` in `src/lib/agent/proposal-spatial-review.ts`; sound and geometry-preserving colour fields skip it), keeps the result on the record as `spatial_review`, and warns about introduced overlaps. `proposal_spatial_preflight` runs the same check as an optional dry run, with the full assessment and `control_inventory`, for layout-heavy iteration. The server chooses default `review_controls`; the agent overrides only when it wants a different selection. Decided 2026-10-10: the check no longer depends on the agent remembering a separate step. |
| Store and present the candidate | `proposal_create` validates and persists a proposal record without changing the working cut. Shared derivation, review-row computation, and supported overrides supply the review panel's preview and dials. |
| Apply the decision | The human approval route revalidates under the project lock and applies the selected option through the safe-write path. The MCP refuses agent approval. History and proposal resolution remain part of the same recoverable decision. |

Skills are agent-readable procedures. They are not backend execution modules, and reading a skill is not proof its checks ran. The code below enforces schemas, supported controls, derivation, revision checks, and write boundaries. Spatial evidence informs review; it is not an automatic aesthetic approval or a substitute for watching the candidate.

## Review granularity

A card represents a human decision. One independently reviewable beat is the default; alternative answers to one question become mutually exclusive options. Dependent operations stay together when separate approval would break or misrepresent the composition.

Decided 2026-10-13: every pending card stands alone. `assertCardStandsAlone`
(`proposal-standalone.ts`) runs in `proposal_create`: the new card's writes
(`proposalWrites`: patch fields, `props.*`, keyframe channels, whole clips, the caption
rail, output format and ripples) must not overlap any other pending card's, it must
validate on the live timeline and on top of each pending card (recommended option and
saved tuning), and each pending card must validate on top of it. Wave steps are an order
only; a step that needs a pending step is refused. Staleness (`evaluateProposalStaleness`)
therefore no longer retires a card because a clip it touches changed: after any edit or
approval, `refreshPendingProposals` and both approval routes move every pending card onto
the new revision when it still validates. A card is out of date only when a clip it
changes was deleted or re-validation fails. `touched_base_values` records the draft-time
value of every setting a card writes, and `proposalOverrides` reports those the creator has
since changed, so the card says it will replace them. The human's Apply, after the
preview, is the consent. `rebase_policy` and the effect-channel fingerprints remain only for
older records. Remaining limit: a ripple cut cannot share the queue, because placements are
absolute times; anchoring them to their clip or spoken word would remove it.

This is a tradeoff between small understandable decisions and whole-scene coherence. A coordinated layout should not become many individually approvable fragments, while unrelated edits should not be hidden in one large approval. The [presentation standard](../standards/proposal-presentation.md) owns the detailed user-facing rules.

## Parameter definitions and automatic wiring

The [editable parameter contract](../standards/editable-parameter-contract.md) is required
for new effects and composition builders. Numeric effect definitions in `EFFECT_CONTROLS`
now generate proposal slider metadata directly; the agent selects the useful controls
from the inventory. Existing non-effect parameters and typed composition adapters keep
their current owners. Legacy unsupported scalar and structured controls are explicitly
listed in `proposal-parameter-contract.ts`; there is no universal compound compiler.

## How dials are selected

Three layers have distinct roles:

1. **Capability definitions** describe supported fields, labels, units, ranges, and conversions.
2. **Draft inventory** describes which controls are actually configured for each actor, which values changed, and which were retained.
3. **`review_controls`** selects the ordered first-class controls for this decision, through `{operation_index, target, field}` references.

Selection is presentation priority, not access. The review projection returns factual
`rows` separately from the complete supported `adjustment_rows` inventory. The UI
shows the model's ordered `review_controls` first and every other applicable dial
under **Advanced adjustments**, replacing Technical details. Linked children appear
only through their group control; protected fields and bound timing children are
excluded. Both tiers use the same override, preview, reset and approval path.

Configured creation/patch fields use their authored baseline. Native transitions
also offer applicable implicit numeric defaults from `TRANSITION_CONTROLS`, even
when an older draft omitted them. Tuning can materialize only those registered
parameter paths; reset restores omission and its renderer default. A transition's
implicit audio fade duration follows its authored duration and delay. Materializing
a previously absent params object accounts for one bounded storage field without
changing actor or operation scope. Unsupported structured parameters remain named
capability gaps; this is not a universal arbitrary-property editor.

At most 15 numeric controls are first-class. The remaining supported controls stay
reachable in Advanced; disclosure is never a validation exemption. The default
first-class fallback remains compact for historical proposals. The model can use
an explicit empty plan to put all controls in Advanced, while the complete inventory
remains available. Source identity and internal metadata remain in the persisted
audit record, outside the editing UI.

Choose by editing intent: size and both positions for new placement, duration for an entrance, amount/color for treatment, level/fades for sound. Preserve accepted choices. These are useful candidates, not an automatic keyword-to-panel algorithm. Shared or linked controls must have actual contract support; a list of child position sliders is not a coherent group transform.

The human can tune exact positions even when the agent chose a semantic slot initially. Those paths must agree on the candidate's effective values and precedence. A dial that updates only a label, requires replay to show its paused-frame change, or diverges on approval violates the control contract.


### Endpoint controls for video speed ramps

A proposed speed ramp can expose `playback_ramp_start_rate` and `playback_ramp_end_rate` with its verified `playback_ramp_source_duration_seconds` and complete trim tuple. The proposal compiler samples a linear acceleration into 60 held intervals of the existing integrated speed-step clock. This approximates a ramp; it does not introduce a continuous interpolation engine.

Changing either endpoint recomputes the source tail while keeping the declared screen duration and downstream timing fixed. Preview and approval compile the same source-bound steps. Rates stay between 0.5× and 4×; an exhausted source window fails closed. The authoring parameters do not become a second timeline authority: approval retains the native source-bound speed keyframes, editable in the clip inspector.

## Implementation map and limits

- [timeline-editor-agent-apply.ts](../../src/lib/agent/timeline-editor-agent-apply.ts): typed operations, validation, derivation, preview, and approved application.
- [local-store/proposals.ts](../../src/lib/local-store/proposals.ts): proposal persistence and resolution relationships.
- [proposal-review.ts](../../src/lib/agent/proposal-review.ts): computed review rows.
- [proposal-controls.ts](../../src/lib/agent/proposal-controls.ts), [proposal-control-inventory.ts](../../src/lib/agent/proposal-control-inventory.ts): available controls and per-draft inventory.
- [proposal-overrides.ts](../../src/lib/agent/proposal-overrides.ts): review adjustments to supported option values.
- [proposal-spatial-preflight.ts](../../src/lib/agent/proposal-spatial-preflight.ts): relevant before/after spatial scope and differences.
- [ProposalsPanel.tsx](../../src/components/studio/timeline/ProposalsPanel.tsx): review and tuning UI.
- [MCP server](../../mcp/server.mjs): safe agent-facing entry points.

Spatial preflight is advisory evidence, not a universal collision prohibition or a stored approval-time certification. General group tuning is limited to supported contracts. Consult [control selection](../standards/inspector-information-architecture.md#proposal-control-selection) and the [operating contract](../../AGENTS.md#proposing-an-edit-instead-of-making-one) for exact invariants.


## Learning from tuning

Approval persists final `numeric_overrides`. Pending review tuning now lives separately
in `proposals/tuning/<proposal-id>.json`, saved through the validated tuning route and
restored when Review loads. Saving never applies a timeline or rewrites authored operations.
`proposal_get` exposes `tuning` and `tuned_baseline` for revision authoring. Revisions must
map effective controls by actor meaning if operation order changes; blindly carrying
operation-index overrides into a new draft is unsafe. This stores the latest values,
not a complete intermediate interaction history.

`proposal_preview` accepts a single proposal or ordered `selections` for a combined
preview. Omitted overrides use saved tuning; explicit empty overrides use authored values.
The final combined timeline is checked against every selected option's preservation
rules relative to the original timeline in both preview and approval. Individual validity
alone does not establish compatibility. These deterministic checks do not prove appearance.

### Animated entrance control example

A subject entrance proposal exposes glow strength/spread, flash intensity/duration,
entrance delay and glow fade before placement controls. In `create_visual`, the
three `subject_*_seconds` envelope values and flash/glow peaks compile through
`proposal-subject-entrance.ts` into native visibility, flash and glow keyframes.
The operation declares `transition_keyframes` so its mutation budget includes the
compiled animation. Compilation runs for overrides and timeline derivation;
reset removes overrides and returns to the authored envelope. Out-of-clip envelopes
are rejected. The current compact proposal dials bound delay to one second and
flash/fade to half a second each; the native keyframe editor supports further work.

For moving alpha cutouts, paper width and color address the decoded canvas outline,
not a baked replacement. `verify-alpha-preview.ts` exercises the subject, border
and background through playback and repeated seeks; native entrance compilation
has a separate override/reset test. These are synthetic examples, not creator media.

### Moving hold controls

A named hold may bind `create_visual.source_end_seconds` for an unbound video
clip. It adjusts the source window, retaining source-in, placement, playback rate
and editable tail handles. Validation checks the entire declared control range
against the source duration; a hold cannot manufacture frozen tail frames or
retime a speech-bound picture. Entrance envelopes recompile after a timing
adjustment through the same override path used by preview and approval. These
bindings reuse the existing timing rows in Proposals, including exact values and
Reset. Their labels should describe time on screen rather than a still-frame hold.

### Reusable reveal control authoring

The [prepared reveal compiler](reveal-sequence-controls.md) binds named actors and
linked audio to shared or independent gap controls without media processing. New
proposal admission enforces 15 first-class numeric sliders per option. The same document
describes private proposal-work phase markers and their measurement limits.

### Handled hold controls and display units

`timing_controls` entries with `kind: "hold"` can choose `display_unit: "frames"`
for frame-sensitive pacing; omitted units retain seconds. The shared control adapter
converts values and native ranges together. These controls contribute frame-quantized
independent deltas to declared bindings. The existing `source_tail` binding extends a
moving clip through its actual handles and recalculates tail trim without freezing
picture or changing source-in/rate. Duration-bound actors also extend the authored
review context when their beat grows. Later ripple start positions do not expand that
context to the entire project. The creator reviews and approves these coupled timings
atomically through the existing proposal contract.

### Shared hold presentation

A hold timing control may declare `member_control_ids` instead of field bindings. It owns a unique set of independent hold controls; nested or overlapping groups are rejected. Its seconds delta supplies each member's default while preserving unequal authored holds. Explicit individual overrides take priority, independent of request order. Groups stay within every member's declared handled range; underlying source-tail and cumulative timing derivation remain unchanged. Select the group in `review_controls` and omit its members to present one main dial with individual holds in Advanced. Review rows carry the group relationship so member values display the effective inherited duration; individual Reset falls back to that shared duration. Group Reset preserves explicit individual choices. Empty overrides restore the authored proposal.
## Revision history in review

Approval resolves the complete chain of explicitly superseded pending drafts,
including ancestors reached through an already-resolved revision. Independent
proposals remain pending. The approval snapshot includes the affected review
records, so Undo and Redo restore the chain with the edit.

For older approvals that only resolved their immediate predecessor, the list
presentation derives replacement from the approved revision's ancestry without
rewriting audit records. These drafts appear as **Replaced** in the collapsed
**Proposal history**, alongside Applied and Rejected decisions. They do not count
as pending reviews. Independent stale proposals stay in the inbox as **Needs
updating**. Explicit backward links determine ancestry; missing, cyclic and
forward links cannot retire an unrelated or newer proposal.
