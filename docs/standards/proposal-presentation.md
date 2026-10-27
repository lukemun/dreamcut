# Proposal presentation and review

The [proposal architecture](../architecture/proposals.md) explains the components and state flow. This standard defines how an agent edit becomes a comprehensible user decision. It consolidates the review requirements in [AGENTS.md](../../AGENTS.md#proposing-an-edit-instead-of-making-one) and the [proposal procedure](../../.agents/skills/dreamcut-proposals/SKILL.md). It does not change approval authority or imply that every existing card already meets the presentation standard.

## Shape the review around a decision

Default to one card per independently reviewable beat, with a short title naming the intended visible or audible change. Explain the target, affected time/scope, and reason in creator language. Preserve previously accepted choices and unrelated content.

### Write cards in plain words

The card title, option labels and option summaries are what the creator reads. They name the change the viewer will see or hear, in the words a creator would use:

| Instead of | Write |
| --- | --- |
| Scrambled DREAMCUT word on its own transparent clip, replacing the baked decode clip | The DREAMCUT word becomes its own clip you can edit |
| First line as its own native text | The first line becomes editable text |
| Add the logo as its own editable element on visual_3 | Add the logo as its own clip, above the video |

Name clips by what they show, quote on-screen words, and keep build terms (baked, native, transparent clip, element, alpha, composite, props), field names and ids in the brief and audit record. `proposal_create` refuses new card text containing known build vocabulary outside quotes and names each word to rewrite ([card-wording.ts](../../src/lib/agent/card-wording.ts)); a passing check does not make text clear, so still read it as the creator would.

Use one proposed result for an ordinary edit. Use mutually exclusive options when comparing alternatives to the same question, with one recommendation clearly distinguished from the user's selection. Do not put independent edits into an alternatives picker. Combine dependent operations when separate approval would misrepresent or break the result; disjoint sibling edits may use the supported independent-rebase contract.

A large edit that needs several separate decisions is sent as a wave: an ordered queue of small proposals the creator settles one at a time. The panel shows one step as the full card, other open steps as "Up next" rows the creator can open, and approved steps as Done.

**Every card stands alone.** Each pending card applies on its own, in any order, whatever the creator does with the others: approve, tune or reject one, and the next is still ready. `proposal_create` enforces this when a card is drafted: a card that changes something another pending card changes (the same setting of a clip, a whole clip, the caption rail, or a cut that moves everything after it), that only works on top of another, or that would stop another applying is refused, and the agent combines the two into one card or replaces the earlier one. Wave steps are an order, not dependencies. After any decision or edit, each remaining card re-validates onto the new timeline. If the creator has since changed a setting a card also sets, the card stays and says so ("You changed Length on Section: Thesis since this was drafted. Apply replaces it."); applying it is their call. A card goes out of date only when it truly cannot apply, for example a clip it changes was deleted. One limit remains: a cut that shifts everything after it cannot share the queue with other cards until placements follow the words they belong to.

A request the creator made that was recorded but not yet drafted, linked to a proposal or set aside (the set `editing_feedback_check` reports as unaccounted) appears after the queue as a quiet "Up next · <their words, one line> · Not drafted yet" row with a **Draft** action. It is never counted as reviewable, and leaves once a proposal links it or the agent records a disposition.

Draft every recorded request as soon as it is understood, not after earlier cards are settled, under the stand-alone rule above. Repair is a backup, not the route: a card that still cannot apply stays in the inbox as **No longer applies**, with the reason and a **Repair** action; it is never applicable as drafted and never silently dropped.

Repair and Draft hand the work to an agent in a chat the creator can see, never a hidden background session. Pressing it shows the exact request under "Paste this into your Claude Code or Codex chat:" with a **Copy** action, so the creator sees what is asked; with the editor's Chat beside the panel, **Send to chat** posts it there and Chat opens. Either way it is recorded as the card's `agent_request` (`proposal_list`), so any agent can find it. The answer is a replacement card that names the old one in `supersedes_proposal_ids`, keeps its intent and the creator's tuning, and is reviewed like any other; asking is never approval.

The pending review shows the latest revision only; previous drafts remain in internal history without a disclosure on the card. Option labels, the proposal brief and derived controls describe the choice. Raw option notes, source credits and acquisition links stay in the audit record. Preview/apply guidance lives in review help rather than a repeated card banner. Stale cards must not look actionable. Show useful source and operation detail in a disclosure rather than leading with paths, IDs, hashes, or an implementation log.

For revisions, declare accepted choices outside the requested change in each option's
`preserve_fields`, for example `{element_id, fields: ["source_url", "props.media_offset_x", "props.media_offset_y"]}`.
Use current timeline values as the baseline. Supported paths are source, timeline start,
duration, trims, rate, lane, and individual `props` fields. Validation compares the fully
derived result, including follower changes; preview overrides and approval enforce the
same protection. Removing a protected actor fails. Preflight reports `passed` or
`not_declared`; absence is not proof of preservation. This protects declared fields,
not inferred intent, semantic asset identity, or source bytes replaced outside a proposal.
Do not protect a field the creator wants to change or adjust in review.

## Show the result and its consequence

Preview the combined candidate in context, including other active layers and sound, through the same derivation approval uses. Keep the working cut recoverable and clearly distinguish temporary preview from an applied edit. Playback or selecting an option is not approval.

Compute the target, verb, and before/after from validated operations; agent prose supplies rationale, not an alternative account of what the edit does. A cut in speech shows its words: the line as said with the removed words struck through, and the line as it will read; a tightened pause shows the words either side and the time it removes (`speech_edits`, from the speech-bound captions). Present relevant preflight findings within the proposal's changed actors and intervals, including unresolved uncertainty. Whole-project warnings belong to a whole-project audit unless a global change makes them relevant.

A preview is only ever live with the Proposals panel open: starting one (from a card, a key,
or the next card after a decision) opens the panel, and closing the panel ends the preview
(creator decision, 2026-10-27, replacing the earlier rule that a preview stayed on after
close). While it runs, a Preview pill with ✕ at the viewer's bottom-right edge, off the
picture, also ends it. Agents posting a card open Proposals for the creator. Card decisions are single keys with their hints always visible: A applies, X
rejects, R replays, B plays the original stretch (again to replay the edit), and Shift+A
applies every selected card. A mistaken decision is undone, so do not add modifiers or hide
key hints to save space (creator decisions, 2026-10-23 and 2026-10-25).

Approval applies one chosen result atomically against the expected timeline revision. Reject leaves the working cut unchanged. Undo/redo restores both editorial state and review state. Preserve existing source and proposal history contracts.

## Offer enough control to make the decision

Choose dials from the user's intent before staging, using the draft's actual `control_inventory` and an ordered `review_controls` selection. The canonical rules and examples are in [proposal control selection](inspector-information-architecture.md#proposal-control-selection). That standard owns field selection; this standard owns the surrounding review experience.

Declare applicable `review_questions` (`speed`, `hold`, `reveal`) on the first option
draft. These require explicit supported controls: playback rate, a bound hold timing
control, or entrance/exit duration respectively. Missing controls fail validation before
staging, avoiding a second proposal just to add a dial. No mutations or timing bindings
are invented automatically. For other reveal techniques, omit this generic declaration
and choose the technique's actual control; report unavailable controls as a capability gap.

Main controls must be directly accessible; every remaining supported dial belongs in Advanced adjustments under the [control coverage contract](inspector-information-architecture.md#first-proposal-control-coverage). The model selects priority, not access. All controls must use familiar labels and shared units/ranges, update the paused preview, reset to the proposed baseline, and carry the same values through approval. Keep internal audit detail in the proposal record; Advanced adjustments contains working controls. Avoid nested cards, duplicate setup fields, controls that do nothing, and large inventories of unrelated settings.

For coordinated sequences, expose the user's timing choice as one shared control. A spacing adjustment must rederive dependent entrances, mask holds, scene handoffs and associated SFX together. Keep accepted phase durations and source clocks fixed unless they are part of the requested adjustment. Independent start-time sliders do not represent sequence spacing.

The option's `timing_controls` contract supports a **Spacing** dial (0.2–1.2 seconds), with explicit bindings to already-declared timing fields. When a fixed neighboring cut or an audio tail limits useful adjustment, declare `min_spacing_seconds` and `max_spacing_seconds` within that range; validation, the slider, exact input and override enforcement use the same bounds. Start times are quantized to output frames; durations can be derived as the difference of two quantized endpoints, preventing gaps or overlapping frames. Preview and approval use the same override derivation. Bindings cannot change undeclared fields, source windows or playback rates, or expose a child field independently under a second timing authority. Check the slowest and fastest supported settings and verify click registration as well as picture.

When several clips on one card use the same motion graphic (four section cards, two lower thirds), the card shows its dials once, not once per clip. Settings whose authored values match across the copies appear under "All N cards" and re-render every copy. Only the settings that differ (a card's number and title) appear per clip, under that clip's own timeline name. The editor renders one graphic at a time, so copies queue and render in turn. A render swap on an existing clip (`patch.source_url`) gets the same dials as a newly created graphic. Never show a dial set titled with the composition id, or the same dial twice.

Human position dials are compatible with semantic agent placement; see [spatial authoring](spatial-authoring.md). A missing group transform or unavailable dial is a capability gap, not permission to offer a misleading approximation.

For separate scene holds on a shared story clock, use named `timing_controls`
with `kind: "hold"` and a fixed `reference_seconds`. Each hold contributes its
own frame-quantized delta to declared durations and downstream starts; shared
starts sum these deltas, independent of slider order. Bind the relevant clicks
with the same delta. A scalar-speed source-tail binding may derive `trim_end`
from the declared full source duration, unchanged source-in, and playback rate;
it requires the complete trim tuple and valid source bounds throughout the
control range. Do not use this binding for a clip with speed keyframes. Keep
the source and speed fixed, hide child timing sliders claimed by the hold, and
show each hold with its own familiar label, useful bounds and exact input.

A hold can also time a keyframed move. `keyframe_span_seconds` on a `create_visual` is
the time of its last transition keyframe: the hold rescales every key with it, so a
longer move keeps its shape and still ends on the clip's last frame. Bind it with the
clip's `source_end_seconds` (more frames for the move). `source_start_seconds` slides a
following clip's source in with the move, so its frames stay continuous; bind its
`source_end_seconds` too and its length holds. Validation bounds each source window by
how far its in and out move apart under every hold, not by the two ends' extremes.
Speed hops use this as **Hop length** (the speed-entrance-exit skill). Two related
dials are not timing controls: a clip whose sideways move starts off frame gets a
**Comes in from** choice (Left/Right) that mirrors that move, and a static
`directional_blur_x` beside its blur envelope is the envelope's peak, so one linked
**Horizontal blur** dial scales every hop.

A card that runs through a sequence (stops, hops, sections, beats) presents its dials in
time order, one section per beat: everything that tunes the move into a stop and the stop
itself sits together, then the next beat. Give each review control the beat's `section`
("To the pole"), list `review_controls` in time order, and put dials that tune every beat
at once (Streak length) first under their own section. Name sections and dials by what the
viewer sees there, never by mark numbers, which the creator may have cleared or renumbered.
Without `section`, timing dials share a "Time on screen" heading.

## Contributor verification and ownership

Inspect an actual proposal's preview, relevant controls, reset, exit-to-working-cut behavior, and stale/error state. Follow the existing approval-authority rules while testing; agents must not self-approve a user's proposal. Use appropriate automated contract tests for approval, override, and undo behavior.

The principal implementation owners are [ProposalsPanel.tsx](../../src/components/studio/timeline/ProposalsPanel.tsx), [proposal-review.ts](../../src/lib/agent/proposal-review.ts), [proposal-controls.ts](../../src/lib/agent/proposal-controls.ts), [proposal-control-inventory.ts](../../src/lib/agent/proposal-control-inventory.ts), [proposal-overrides.ts](../../src/lib/agent/proposal-overrides.ts), and [local-store/proposals.ts](../../src/lib/local-store/proposals.ts). A contributor must inspect current code before treating a documented behavior as mechanically enforced.
