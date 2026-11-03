# Catalog card UX audit case

Case: `catalog-card-footer-v1`. Status: ready for a manual visual audit; no automated
runner or independent model result. This is a product UI case, not a timeline-editing
benchmark. Do not create a project or mutate a timeline to run it.

## Input and task

Use a disposable editor fixture with a catalog containing portrait and landscape
previews, short and two-line titles, and at least one family. Use generic built-in
content for shared evidence; keep personal media and screenshots private.

Give an unfamiliar reviewer only the rendered catalog and this task:
“Review this catalog for visual clarity at narrow and wide widths. Browse an item,
select it, open its information, and return. Report confusing layout or changes.”
Do not give the reviewer this rubric until their initial findings are recorded.

Capture unselected and selected states at 380px and 480px panel widths, plus the
Guide page. Include a keyboard pass. Save screenshot references, viewport/panel sizes,
revision, reviewer independence, findings and untested states in the local receipt.

## Grader rubric

Fail the affected surface when any of these occurs:

- Details occupies a separate action-only row with unused space beside it, while
  title and action could share a compact footer. Allocate enough caption width
  without forcing portrait previews into wide containers or adding an empty action row.
- Ownership metadata repeats browsing context without helping distinguish items.
  A compact type label beside the title is allowed under the subsequent request
  to distinguish Looks, Motion graphics and Video effects. It must not recreate
  a tall subtitle-only footer or crowd the title.
- Selection inserts a checkmark before the title, shifts its origin, changes its
  wrapping, or moves the footer. Use the existing colored surface and outline,
  with an accessible pressed state.
- The preview is cropped or stretched. Since 2026-10-26 (owner direction) template cards are
  `CatalogTile`s the size of Captions → Looks, so the picture well is uniform and the example
  sits contained in it; a card larger than that tile fails.
- Preview content touches the card’s top while other edges have padding. Compare
  top and side insets and distinguish the compact caption from unused space.
- Details overlays preview content, collides with the title, or becomes hard to
  reach by keyboard. Both short and long titles must retain usable space.
  Since 2026-10-26 the tile action sits at the right end of the name row; a long
  name wraps to a second line rather than being cut off. Details uses a blue circled information icon
  beside the name at every tile size, with an accessible label and tooltip;
  Add and Apply retain their words.
- A selected card looks heavier than other selected things in the editor (an outer glow
  or thick ring). Use the shared selected fill and a thin ring, as on an open drawer button.
- In the editor panel, previews sit inset inside the card so a narrow drawer shows a small
  picture. Let the preview run edge to edge; keep the caption padded.
- In the editor panel, more than two rows of controls sit above the first card, or a
  control takes a full-width row of its own for a minor choice (a labelled "Columns 1 2"
  row). Search comes first; size and drawer actions share its row as icons.
- A filter repeats what the list already shows, such as All / Yours / Catalog pills
  above "Your templates" and "Catalog templates" headings. Keep the pills, drop the headings.
- The first card's selection ring is clipped, or the search field blends into the
  panel so strongly that its input boundary is unclear.

Compare title bounds before and after selection. Verify Details opens the correct
item, Back preserves selection, and selection never edits the timeline. Functional
success does not excuse a failed layout criterion. Static checks do not grade these
visual criteria. Record pass/fail/unverified separately for each criterion and width.

## Scope

The metadata and checkmark criteria apply to this catalog, not a universal prohibition
on metadata or selection indicators. Record human acceptance separately from automated checks.
