# Control affordance case

Use this case in every UX audit and for any change to tabs, switchers, section headings or
buttons styled as text. A creator must tell at a glance what can be clicked, what is a heading,
and which option is selected. A switcher that looks like a row of headings fails even when every
tab works.

## Check

Open the panel at its docked width in the real editor, in dark and light themes. For each row of
text-like items, record what a person would take it to be before hovering or clicking:

- **Tabs and switchers** sit in one contained track (`SegmentedControl`), with the selected item
  raised. Unselected items are inside the track, never loose text on the panel background.
- **Headings** are not clickable and do not share a look with tabs: different size or weight, and no
  track or pill.
- **Wrapped switchers** form even rows of equal cells (for example 3 × 2), never a ragged second
  line that looks like a new heading.
- **Selected state** reads without colour alone: raised surface or outline, not only brighter text.

## Fail when

- Unselected tabs are plain text on the panel background, so they read as labels or headings.
- A tab row wraps into uneven lines, or its second line lines up with section headings.
- A heading and a tab use the same type style with nothing else to tell them apart.
- A switcher is built from local buttons instead of `SegmentedControl`.

## Example (2026-10-24, Properties section tabs)

The creator reported that Layout · Color · Mask · Effects · Animation · Timing "blend in" and "don't
look like they're headers", although each one opens a section. Before: bare text on the panel with
only the open tab filled, wrapping 4 + 2. After: one `SegmentedControl` track, equal cells in a
3 × 2 grid, selected tab raised. `InspectorPanelTabs` owns this for every Properties and caption
panel, and a contract test guards that it uses the track.
