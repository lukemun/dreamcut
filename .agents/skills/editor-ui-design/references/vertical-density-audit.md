# Vertical density case

Use this case for any panel or card a creator scrolls: proposal cards, Properties sections, drawers.
Vertical space is the scarcest thing in a docked panel, and every row a person scrolls past before
reaching a control is a cost.

## Measure

Open the panel at its docked width in the real editor, with realistic content. Record:

- **Pixels to the first control** from the top of the card or section.
- **Height of each repeated item** (a wheel box, a slice, a keyframe row).
- **How many items fit** in the panel without scrolling.

Take screenshots before and after, and keep the numbers in the audit record.

## Fail when

- A row holds only a short chip or label that could sit inline with its neighbour (a kind chip such as "Edit" on its own line above a title).
- The same thing is named twice in a row, for example the clip's name as a header over dials when the option row already names that one clip.
- A readout or status takes its own row beside a row with room for it (a wheel's "Cool 41%" under the ring when the "Exact values" line is half empty).
- Decorative labels add height when they could add width (direction words above and below a wheel when the sides are free).
- Padding or gaps differ from neighbouring sections without a reason.

## Example (2026-10-23, proposal card with two wheels and a curve)

| | Before | After |
| --- | --- | --- |
| Card top to first dial | about 180px | 128px |
| One wheel box | about 330px | 250px |
| Wheels visible at once | about 1 | 2 |

The fixes were:
- the kind chip inline with the title;
- the single clip's name on the option row;
- the readout on the Exact values line;
- direction words beside the ring.

Keep these limits when the card changes. A regression is a fail even when every control still works.
