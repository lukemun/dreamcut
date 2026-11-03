---
name: proposal-dial-selection
description: Use when drafting or revising a proposal card, to choose which dials it shows up front and which wait in Advanced adjustments, for clip fields and motion-graphic controls alike. dreamcut-proposals owns the edit itself.
---

# Choose a card's main dials

A card's main dials are the few settings the creator is most likely to reach for to get
from this proposal to the result they want. Everything else the card can tune stays
reachable under Advanced adjustments. Choosing them is a judgment you make for each
card from the request and what the change actually does, not a rule applied to field names.

Read the [proposal control standard](../../../docs/standards/inspector-information-architecture.md#proposal-control-selection)
for the limit (15 first-class sliders, linked controls count once) and the control
inventory a preflight returns. The [editable parameter contract](../../../docs/standards/editable-parameter-contract.md)
says which settings exist; this skill only decides which lead.

## Decide what the change is about

Before staging, write down for yourself:

1. **What the creator asked for**, in their words, and the outcome it implies.
2. **What the operations change.** A swap that re-renders a graphic with the same values
   changes no setting; a fix in the graphic's code is about how it looks, not its settings.
3. **What they will most likely adjust next.** For a placement, size and X/Y together. For
   a reveal or hold, its timing. For a fix, the setting that governs the part that was
   wrong, so the creator can steer it if the fix alone is not what they wanted.

Lead with the dials that answer 1 and 3. A dial that cannot change the requested outcome
is not main, however prominent the setting is in the graphic.

## Clip fields and graphic controls

- **Clip and effect fields** go in `options[].review_controls` as
  `{operation_index, target, field}` references, as described in
  [dreamcut-proposals](../dreamcut-proposals/SKILL.md).
- **A placed motion graphic's own controls** go in `options[].motion_main_controls` as the
  control ids from its `dreamcut.controls.json`. A code fix that keeps every value still
  leads with the setting that governs what was fixed, when the graphic has one; send `[]`
  only when no setting bears on the change, and the dials then wait in Advanced. Omitting it leaves the card's fallback: settings
  that differ from the render being replaced lead, or every dial for a new graphic.
- **Graph and wheel dials** (colour wheels, curves, colour slice) are one dial each on the
  card and count once toward the limit. Lead with the one the request is about; see
  [color-grading](../color-grading/SKILL.md) for which tool owns which request.
- **Fixed controls** (`"fixed": true` in the manifest: which section a header announces,
  its length) never show. When you author a graphic, mark a control fixed when it is set by
  where the graphic is placed rather than by taste; see [motion-graphics](../motion-graphics/SKILL.md).

## One change across many clips: link it, never blank it

A card that makes the same change to many clips (every talk piece, every label, every
backdrop) gets one dial per change, not one per clip and not none. Reference the first
operation and list the others in `linked_operation_indices`; a linked group counts once
toward the limit. Never send `review_controls: []` to get under 15 sliders: that hides
every setting the creator would tune. `[]` is only for a card whose dials live elsewhere
(a motion graphic's own controls in `motion_main_controls`) or that truly changes nothing
tunable. When a setting the creator will want has no dial yet (a treatment strength that
needs re-processing), offer it as two or three options on the card and name the gap.
A revision that supersedes a card keeps that card's main dials unless the change removed what
they tuned; dropping them to get a resend accepted is the same failure as blanking them.

| Card | Main dials |
| --- | --- |
| Voice clean-up on a talk cut into pieces | One linked voice-level `volume` dial across the pieces; clean-up strength as Light / Standard / Strong options until a strength dial exists |
| Caption restyle or re-time across talk pieces | One linked set: size, then vertical position |
| Screenshot with highlight boxes and labels | Label size and position, linked across the card's labels; box timing when the contract offers it |
| Backdrop colour behind several images | One linked colour per look (dark charts, light pages) |
| Speed change | The factor |
| Clean-up cuts and pause trims | The cut boundaries the operation exposes; for a card of several pause trims, one linked set |
| Fades between sections or at cuts | The fade length, linked across the card |
| Motion graphic beat | Its cue timings tied to the spoken words, then the look, in `motion_main_controls`; clip fields only when one matters (never the presenter bubble's pieces) |

## Check before staging

Read the card as the creator would: could they reach the result they asked for using only
the main dials? Is anything up front unrelated to the request? Would a likely next tweak
force them into Advanced? Adjust, then stage. Record the choice in the option's summary or
assumptions only when it is not obvious from the request.

Run the regression suite after changing this skill:

```bash
pnpm eval:dial-selection list
pnpm eval:dial-selection:check
```

The suite ([evals](evals.md)) grades a chosen set against required and excluded dials for
real cases; each case says whether the creator's own choice backs it. It is a regression check, not a target: grow it from journal episodes where a
creator had to hunt for a dial or asked why one was shown.
