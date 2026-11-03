# split-into-pieces — evolution log

## Purpose
Lay any graphic out as separate timeline pieces the creator can tune one by one, with playback unchanged. Scope: deciding the pieces, routing each source type to the tool that splits it, and staging pieces as proposals or auditions. Good looks like: one piece per independently tunable part, native elements first, no links between siblings, and stacked pieces matching the whole.

## 2026-10-24 — created

- **Observation:** Splitting graphics into pieces had been done by hand several times (the Glass look as 55 layers; a sketch reference), each time rediscovering the same rules.
- **Decision:** One routing skill holds the shared rules; source-specific procedures stay with their owners (sketch-drawing, the Illustrated Explainer `layer` control).
- **Verification:** Routing walkthrough only; skill-purpose and catalog tests run. No practical trial yet.

## 2026-10-24 — Pieces were invisible to the spatial checks

- **Observation:** Native shape pieces were skipped by the spatial check (`not_applicable`), so split graphics could cover the speaker without a warning.
- **Decision:** Shapes and camera followers are now in the overlap check and speaker clearance; staging refuses face coverage. No procedure change beyond reading `spatial_review` and `pending_card_overlaps`.
- **Verification:** See the dreamcut-proposals and sketch-drawing entries of the same date.
