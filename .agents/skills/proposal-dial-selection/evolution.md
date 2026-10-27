# proposal-dial-selection — evolution log

## Purpose
Put the dials a creator needs for this specific change in front of them, and keep every
other supported dial one step away in Advanced adjustments. Scope: choosing and ordering
main dials on proposal cards (clip fields and motion-graphic controls). It does not decide
which settings exist (editable parameter contract) or what the edit is (dreamcut-proposals).
Good looks like: the creator reaches the result they asked for without opening Advanced or
asking for a dial, and never asks why an unrelated dial is on the card.

## 2026-10-13 — Created after a fix card showed every header setting three times

**Observation:** a card that re-rendered three section headers only to remove a one-frame
flash showed each header's full control list: a Section dropdown (switching which point a
header announces), Duration (repeating the clip length), four point names, colour, writing
time and backdrop opacity. The creator asked why those were on the card and how they were
chosen. None related to the fix; only Entrance affects how the page first covers the speaker.
The creator then asked that the choice be an agent judgment per card, owned by a skill with
an evolution log and evals, rather than a fixed rule.

**Change:** new skill; proposal options accept `motion_main_controls`; composition controls
accept `"fixed": true`, and the section header marks Section and Duration fixed. Without a
choice, the card leads with settings that differ from the render being replaced.

**Verification:** `pnpm eval:dial-selection:check` (reference answers pass, known-bad answers
fail); unit tests for the split and the manifest flag; the card UI checked on a disposable
project copy. No model trial has been run against the suite yet.

## 2026-10-13 — Fix rule and eval agree; cases carry readiness

**Observation:** the learning review (skill and eval-curation tracks) found the skill said to
send `[]` for a code fix that keeps every value, while the header-flash case required
`["entrance"]` and graded `[]` as wrong. It also found the article case's reference answer
included Opacity, which the real card never offered, and that the header case encodes the
agent's own offer rather than a dial the creator picked.

**Change:** a fix that keeps every value now leads with the setting that governs what was
fixed (`[]` only when none does), matching the creator's "do both" agreement. The procedure's
example is generalised rather than naming Entrance. Cases carry `readiness`; header-flash-fix
is `needs-evidence` until a card with that choice is approved. The article reference is the
three dials the creator tuned.

**Verification:** `pnpm eval:dial-selection:check` passes; still no model trial.

## 2026-10-23: graph and wheel dials

**Observation:** proposal cards can now carry colour wheels, curves and colour slices as
single dials (list values), counted once toward the 15-dial limit.

**Decision:** one bullet saying they count once and pointing to color-grading for which
tool owns which request; no eval case yet, since no creator has tuned one on a card.

**Verification:** `pnpm check:parameter-contract` covers the list controls; the eval was
rerun unchanged.

## 2026-10-25: link repeated changes; never blank the dials

**Observation:** on a weekly market recap, most cards an agent staged in one session
(pause cuts, screenshot highlights, backdrop colours, a voice clean-up on 63 talk pieces)
sent `review_controls: []` to get under the 15-slider limit, so the creator got cards with no
useful dials and asked for volume and sensitivity controls. The explainer-visuals skill
recommended the same shortcut.

**Decision:** a section on linking one change across many clips into one dial
(`linked_operation_indices`), with `[]` reserved for cards whose dials live in
`motion_main_controls` or that change nothing tunable; settings without a dial (a treatment
strength that needs re-processing) go out as two or three options. A table of main dials per
card type covers the card types from that session. explainer-visuals now points here instead
of recommending `[]`. The linked-index limit was raised to 500 the same day, so a caption
track on a cut-up talk can link all its pieces.

**Verification:** `pnpm eval:dial-selection:check`; no model trial yet.

## 2026-10-26 — Revisions keep their dials; cuts and fades in the table

**Observation:** in the same weekly-recap session, 37 of 57 applied cards had no main dials. These included 8 clean-up cuts, 10 pause-trim cards and 2 fade cards. One capex card went from 12 dials to none when its revision was resent.

**Decision:** a superseding card keeps the replaced card's main dials unless the change removed what they tuned. The table gains rows for clean-up cuts and pause trims (cut boundaries, linked), and for fades (fade length, linked).

**Verification:** `pnpm eval:dial-selection:check`.
