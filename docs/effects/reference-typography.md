# Reference typography record

Store source-specific observations beside the reference as
`typography.json`, with `schema_version: 1`. Link it from the reference catalog.
This record describes flattened source pixels; it is not a timeline or an exact
recovery of the original font settings. Keep reconstruction choices separately.

## Required fields

- `source`: file, SHA-256, dimensions, frame manifest, indexing and time convention.
- `coverage`: inspected frame intervals, evidence images, continuous-playback status,
  uninspected intervals and limitations.
- `elements`: one track per title, subtitle, label or independently styled word.
  Each has an ID, role, literal text, alignment, layer/occlusion relationship and
  an ordered list of `states`.
- Every state records its half-open source frame interval and PTS; case; font class,
  weight and width description; glyph treatment; exact-family identity or explicit
  unknown; fill separately from stroke/glow/shadow; tight normalized glyph bounds;
  visible glyph height and ink area when measurable; tracking, line spacing and
  rotation (explicit unknown is allowed); evidence paths, method and confidence.
- `relationships`: entrances relative to other visible actors, including the
  other actor's measured geometry at the cue. An observed coincidence is not proof
  that the original editor used an expression or a threshold controller.
- `reconstruction`: source state → editable actor/font/size/position/timing mapping,
  substitutions, intentional adaptations and unresolved differences.

## Measurement and completeness

Record every font/case/layout change, even a one-frame state. Inspect boundaries
and handles; do not reduce a changing title to one representative font. Preserve
the state list so future revisions reuse it instead of rediscovering the sequence.

Measure visible letterforms, not their CSS text box or guessed point size. Normalize
to the source canvas and retain pixel dimensions. Keep glyph height, ink area and
block bounds separate. An occluded title cannot supply complete ink area: record
null with the reason. Distinguish measured values from visually estimated regions.
Color samples come from the element's own crop, not the whole frame's palette.
Font family guesses remain candidates until identified; a substitute is never a
source fact. Test readability in a declared phone-size view separately from scale.

Before proposing a recreation, account for each source state and each text role.
Verify first appearance, every font switch, final hold and exit, as well as the
largest/longest concurrent lockup. A still establishes geometry, not motion.

The executable validator is `referenceTypographySchema` in
`src/lib/media-analysis/reference-typography.ts`. Validate authored records against
it before reuse. It checks required evidence fields, bounds and state ordering.
It is not yet automatically invoked by media ingestion; validation does not prove
that the observations match the pixels or that all source states were inspected.
