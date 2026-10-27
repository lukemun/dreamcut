# Review action row UX audit case

Case: `review-action-row-v1`. Status: ready for a manual visual audit with a measured
check; no automated runner or independent model result. This is a product UI case, not
a timeline-editing benchmark. Do not approve, reject or apply anything to run it;
previewing a card and showing the original are viewing only.

## Input and task

Use a disposable editor fixture with at least one pending single-option proposal card.
Preview it, so its action row shows every button at once (Preview/Replay, Original,
Apply, Reject), and catch the row while a preview is still loading, for example on a
heavy scene or right after changing renderer.

Give an unfamiliar reviewer only the rendered editor and this task:
“Preview a proposal card, then look at its buttons, including while the preview loads.
Report anything that looks broken, out of place or unclear.”
Do not give the reviewer this rubric until their initial findings are recorded.

Capture the action row at the Proposals panel's docked width, at its narrowest
supported width and at 480px, each idle and previewing, and once mid-load. Save
screenshot references, panel sizes, revision, reviewer independence, findings and
untested states in the local receipt.

## Measured check

For each card's action row, in the browser console:

```js
[...row.children].map(el => { const r = el.getBoundingClientRect(); return [el.getAttribute("aria-label"), Math.round(r.top), Math.round(r.width)]; })
```

Every button must share one `top` value at every captured width and state. Compare the
row's `scrollWidth` with its `clientWidth`: overflow fails, as does a word clipped by
truncation. Record which words show at each width.

## Grader rubric

Every action keeps its icon and its key hint at any width, because the keys are how a
reviewer works fast. When the row runs short of room the words give way, in this
order: the secondary words first (Preview/Replay, Original, Reject), then Apply's. A
hidden word stays in the button's tooltip and accessible name.

Fail the affected surface when any of these occurs:

- One button, or any subset, wraps onto a second line. A row that fits only while
  idle, and breaks when previewing adds Original, fails.
- An icon or key hint is hidden, or a word drops out of order: Apply loses its word
  while a secondary action keeps one, or a word disappears while the row still has
  room for it.
- A word is clipped or truncated mid-word. Words show whole or not at all.
- A button whose word is hidden has no tooltip or accessible name giving it.
- A loading button reads as blank or disabled: dimmed, or showing dots with neither
  its key hint nor its word beside them. Loading replaces only the icon and never
  changes the button's width.
- A loading state never resolves. A preview that cannot be prepared ends in a visible
  failure and the button returns to Preview; it does not load indefinitely.

Functional success does not excuse a failed layout criterion. Static checks do not
grade these visual criteria. Record pass/fail/unverified separately for each
criterion, width and state.

## Scope

This case covers proposal card action rows (single and multi-option) and the batch
Preview/Apply row. Apply the same criteria to other button rows whose set of buttons
changes with state, and list each one checked.
