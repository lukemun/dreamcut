---
name: media-annotation
description: Build source-linked, searchable descriptions of a local photo or video collection before an edit exists. Use for shoot inventories and visual catalogs; use media-intake for importing into a DreamCut project.
metadata:
  version: "1.0.0"
---

# Media annotation

Use this for a local visual collection that needs an inventory or catalog before editing. Keep project imports under `media-intake`; it coordinates `media-pull`, preparation, and readiness inside DreamCut. Store personal collections under ignored `social-content/` or `library/`, not in tracked source folders.

## Freeze sources and inspect

Inventory the authorized files before processing: stable ID, relative path, media type, byte count, and SHA-256. Preserve unchanged sources, existing annotations, and user-supplied identity or location metadata. Write inspection derivatives separately from originals.

Inspect photos in display orientation. Describe visible subjects, surroundings, actions, spatial relationships, framing, and readable text. Keep inferred identity, location, date, relationship, and unseen events out of visual observations. Mark uncertainty; leave unreadable text unreadable.

For video, record duration, rotation, color metadata, and audio streams. Choose a bounded sampling plan using [intake analysis routing](../media-intake/references/analysis-routing.md), based on the question and visible scene/action changes. Use sparse representative samples for an overview and denser samples in relevant short intervals; an explicit user request for exhaustive coverage takes precedence. Record actual sample times and gaps. Denser sampling may be needed for fast action. Do not claim a continuous event, precise cut boundary, camera motion, or speech from still samples alone. Only transcribe processed audio. Treat color from an unmanaged HDR preview as provisional.

## Save a reusable catalog

Put structured `annotations.json` and readable `CATALOG.md` beside the collection. Each asset entry should carry source ID/path/hash, observed description and tags, evidence paths or sampled timestamps, inspection coverage, and uncertainties. Keep favorites, proposed uses, and editorial selections in a separate brief. A catalog should remain useful for another project.

Before completion, confirm each authorized asset has an entry; all evidence paths exist; source hashes still match; video sample times are within duration; and the readable catalog links to the right files. A thumbnail browser is optional. Cataloging does not import into a project, place media, or publish it.

## Configured model observations

For already-imported project sources, use `visual_analyze` with the source-description
preset, explicit sample times (or kind=image) and a scoped question. Its saved observations
are reusable evidence for the catalog, not automatic catalog registration or human review.
Link the job/artifact, source hash, timestamps, model revision and uncertainties. The tool
also supports effect/mask/caption review; route those to the applicable craft skill instead
of treating them as general source descriptions. See [the tool contract](../../../docs/architecture/visual-analysis.md).

For a pre-edit collection outside a project, retain the direct inspection/catalog workflow.
Do not invent a project merely to call a project-scoped tool; report the adapter gap if the
host cannot inspect those images. Never infer sound, transcript or continuous action from
sampled image descriptions.
