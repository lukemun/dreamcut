# Shared video and effect reference record

The readable breakdown, analysis and recreation consume one `reference-analysis.json`
record, validated by `referenceAnalysisSchema` in
`src/lib/media-analysis/reference-analysis.ts`. Store it beside the local reference
catalog and keep playable source examples linked there.

Use **video scope** for a whole video or multi-section reference, routed through
`video-reference-analysis`. Sections partition the entire source without gaps, including
ordinary footage and explicitly uninspected spans. Use **effect scope** for one bounded
interval, routed through `recreate-effect`. Its sections partition that interval only.
Both routes share the same measurements; a multi-effect video is not flattened into
one giant effect or reduced to a list that omits the story between effects.

## Data ownership

- `source`: original file/hash, dimensions, FPS, actual frame/PTS convention, frame
  manifest, frame count and duration. FPS alone cannot establish variable-rate PTS.
- `coverage`: inspected intervals, continuous playback, listening and limitations.
- `sections`: ordered complete partition, narrative purpose, shot order, pacing,
  text/audio observations, inspected/partial/uninspected status and evidence.
- `shots`: ordered source shot intervals and observations, referenced by section shot order.
  Global `text_presence`/`typography` also capture titles outside effects.
- `effects`: reusable constructions with generalized names and component steps.
  Each records its evidence interval, layers and ordered states: normalized visible
  bounds, geometry, crop/mask, opacity/color, motion, blur and easing. Record numeric
  measurements with their units in the observation value; bounds have typed ratios.
  Cues carry actual frame and PTS, including entrance/settled/exit relationships.
  Transition records describe direction, overlap and treatment. Sound records retain
  isolation confidence. Text uses the complete [typography schema](reference-typography.md).
- `occurrences`: source interval, reusable effect ID, relevant layers and editorial role.
  Repeated or overlapping effects are allowed and retain separate examples.
- `adaptation`: revision, direction references, current decisions, intentional
  differences and unresolved questions. It is not a source observation or timeline.

Every observation distinguishes measured, observed, inferred and unknown values.
Unknown means null plus a reason. Do not fill unknowns with guessed plugin settings.
An uninspected section may point to its source window as evidence of scope; that link
is not proof of visual inspection. Empty effect arrays are valid for plain footage.

## Validation and reuse

Run `pnpm check:effects --reference <record-path>` before construction. This validates
structure, intervals, references and typography identity. It does not inspect pixels,
verify source bytes or establish complete motion/audio review. Record those separately.
Existing typography-only records remain usable inside the shared record; older catalogs
are not automatically upgraded or certified. This is an offline authoring contract,
not automatic full-video extraction by the visual-analysis sampling model.
