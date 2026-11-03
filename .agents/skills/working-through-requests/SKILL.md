---
name: working-through-requests
description: The default routine when the creator asks for several changes to an existing edit at once (a list of notes, several marks, "and also…"): record each ask, draft one to three small cards at a time, and keep working down the queue as each pass settles. Use whenever more than one change is requested, or the creator asks for batches. For one isolated change go straight to dreamcut-proposals; for a first assembly use editorial-assembly.
---

# Working through requests

The creator often names many changes in one breath and wants to settle them a few at a
time. The outcome: every ask is captured and visible to them, the Proposals panel holds
one small pass of cards rather than a pile, and each next pass is drafted from the edit as
it stands after their last decisions. Nothing is dropped, and nothing waits unseen.

This skill paces and routes the work. How to build each card lives in
[dreamcut-proposals](../dreamcut-proposals/SKILL.md) and the craft skill for the change
([sound-design](../sound-design/SKILL.md), [caption-craft](../caption-craft/SKILL.md),
[cut-pacing](../cut-pacing/SKILL.md), …).

## 1. Capture every ask

Record each separate ask with `editing_feedback_record`, quoting only the creator's words
for that ask. Split compound sentences: "sounds as things are drawn, as the water fills in,
and as we turn corners" is three asks. When asks span several marks or their grouping is
unclear, plan them with [editorial-intent-planning](../editorial-intent-planning/SKILL.md)
first.

A recorded ask with no card yet shows in the Proposals panel under **Up next** as
"Not drafted yet". That list is the queue the creator sees, and they can open any row to ask
for it next. Leave a queued ask open (no `editing_feedback_disposition`) until a card
answers it or the creator drops it; a disposition removes it from Up next.

## 2. Order the queue

Work in the order the creator gave unless something must come first:

- corrections to cards already on screen come before new work;
- changes to timing or structure before what sits on that timing: clean the source
  (cuts, pacing), then captions, then visuals, then sound;
- an ask that only makes sense with another belongs in the same card.

Say the order in one line so the creator can reorder it.

## 3. Draft one pass

Draft one to three cards from the front of the queue, following
[dreamcut-proposals](../dreamcut-proposals/SKILL.md). Each card applies on its own, in
any order. Alternatives for one decision (three candidate sounds, two caption looks) are
options of one card, not separate cards. Leave the rest of the queue undrafted.

Size the pass by what the creator can judge in one sitting: one card for a large or
uncertain change, up to three for small independent ones. Draft more only when the
creator asks for everything at once.

Get each card right before staging it; a superseded draft is a miss, not progress:

- When the direction is open (a new layout, look or kind of visual), stage one card and
  ask before drafting the others, so a correction costs one card instead of a batch.
- Render the card and look at its frames (`proposal_preview`, then frame evidence) before
  presenting it. Check what the validators would refuse yourself: the schema, the
  15-dial limit, cut edges against word timings, overlap and contrast.
- Use only the creator's words and real facts on screen; never invent a headline or
  figure to fill a slot.

## 4. Hand the pass over

Open the editor at the project, link it, and tell the creator in plain words what is in
this pass and what is still queued. Then stop: the next pass waits for their decisions.

## 5. Settle, then continue

When the creator comes back, read where the pass landed before drafting more:

- `timeline_get` for the current revision, and `proposal_list` for what was applied,
  rejected, tuned or left pending;
- treat their picks as direction for the rest of the queue (a chosen sound or look sets
  the style for related asks), and say so on the next cards;
- revise from their comments with a card that names what it replaces
  (`supersedes_proposal_ids`) and keeps that card's dials;
- a correction to a direction (layout, look) changes the queue too: redraft the next
  cards from it, never resend cards built on the old direction;
- new asks join the queue where they fit (step 2).

Then draft the next pass from the current timeline. Repeat until the queue is empty.

## 6. Close each turn

Run `editing_feedback_check`. Asks answered this turn link to their cards. Asks still
queued are expected to show as not yet accounted for: report them as queued for a later
pass, not as missed.

## Done

The routine is working when every ask the creator made appears either on a card or under
Up next, no pass holds more than three new cards unless the creator asked for more, and
each pass is built on the timeline as the creator left it.
