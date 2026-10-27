# Row alignment and open-trigger UX audit case

Case: `row-alignment-open-trigger-v1`. Status: ready for a manual visual audit with a
measured check; no automated runner or independent model result. This is a product
UI case, not a timeline-editing benchmark. Do not approve, reject or apply anything
to run it; opening panels and selecting a card for review is viewing only.

## Input and task

Use a disposable editor fixture with at least one pending proposal card whose option
row shows a selection checkbox, a keyboard number, a label and a preview time range,
plus one label long enough to wrap at a narrow panel width.

Give an unfamiliar reviewer only the rendered editor and this task:
“Review the Proposals panel rows and the header buttons. Open Edit history and the
Proposals drawer. Report anything that looks misaligned or does not show what is open.”
Do not give the reviewer this rubric until their initial findings are recorded.

Capture the option row at 380px and 480px panel widths and the header with Edit
history open. Save screenshot references, panel sizes, revision, reviewer
independence, findings and untested states in the local receipt.

## Measured check

Measure every row that mixes a control, a chip and text of different sizes. In the
browser console, for each item in the row's first line, compare vertical centers:

```js
[...row.children].map(el => { const r = el.getBoundingClientRect(); return [el.textContent.trim().slice(0, 20), r.top + r.height / 2]; })
```

Controls and chips must center within 1px of the label's first line. Smaller
secondary text (a time, a count) shares the label's text baseline; compare baselines
for text and centers for boxes.

## Grader rubric

Fail the affected surface when any of these occurs:

- Items in one row sit at visibly different heights, for example a time range or
  count riding above the label, or a checkbox or key chip sitting high or low.
- Alignment depends on per-item `mt-*` nudges against `items-start`; it breaks as
  soon as a font size or line height changes. Use boxes one label line tall, or a
  shared baseline, instead.
- A wrapped label pulls the checkbox or chip to the middle of the block instead of
  its first line.
- A button that opens a menu, popover or panel looks the same open as closed. Its
  open state must use the same selected fill as an open drawer, and hover must not
  replace it while the menu is open.

Functional success does not excuse a failed layout criterion. Static checks do not
grade these visual criteria. Record pass/fail/unverified separately for each
criterion and width.

## Scope

This case covers proposal option rows and header menu triggers. Apply the same
criteria to other mixed-size rows and menu triggers found during a full audit, and
list each one checked.
