---
name: timeline-auditions
description: Cut and show multiple playable DreamCut versions for comparison without changing the working timeline. Use when the user asks to compare takes, audition options, try alternate openings, explore different cuts, or "show me a few versions."
---

# Timeline auditions

Read `../dreamcut-proposals/SKILL.md` before timeline work.

An edit proposes a specific change for approval. An audition presents two or more alternatives to the same editorial question for the user to choose. Route by that decision, not by asset novelty or adjustment size. Give each candidate explicit source handles where applicable, a clear label, and a comparable scope. Never infer that the user selected a winner; recommending an option does not select it.

Trigger this skill from the user's intent, not only the word “audition.” Requests such as “cut these and show me,” “let me compare the takes,” “try a few versions,” or “show alternate openings” call for an audition when the result should be playable and the working edit should remain untouched.

For comparisons within an existing edit (including music, SFX, text treatments, or grades), use mutually exclusive proposal options on the original project. Preserve its picture, speech speed, captions, and effects. This is still an audition in editorial terms. Use `audition_create` for a dedicated source/take comparison when that is the intended comparison context; it currently repeats source candidates in a separate project. New music alone does not justify replacing the assembled scene with raw footage.

Multiple unrelated proposed changes are separate edits, not audition alternatives. Placing a chosen winner is an edit. Selection and application are distinct unless a human action explicitly offers both. Same-timeline audition groups with temporary, group-scoped mute switching require a new contract; ordinary persisted global Solo is not equivalent. Approval remains human-only.

Before presenting the first audition layout, call `assembly_handoff` and verify `proposal_required`. Later agent changes use proposals even if no human has edited.
