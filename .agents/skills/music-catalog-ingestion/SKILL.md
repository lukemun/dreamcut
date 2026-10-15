---
name: music-catalog-ingestion
description: Import, reconcile, annotate, and validate reusable music recordings and cue windows in the DreamCut catalog before an edit or from an assembled bundle. Use for catalog preparation or provenance audits; not for choosing music for a current edit.
metadata:
  version: "1.0.0"
---

# Music catalog ingestion

Use this for catalog preparation. Use `../music-audition/SKILL.md` when the task is selecting or comparing music in an edit.

Catalog work may begin without a project. Keep exploratory cue annotations under ignored `social-content/` or `library/` until rights, source identity, and review status meet the managed catalog contract below. Historical source-linked cues remain in `social-content/legacy-social-content/`. Do not promote a downloaded reference into the reusable catalog merely because it has an excerpt or a playable browser.

Separate measured audio properties and algorithmic estimates from mood or use-case hypotheses and from listening-confirmed judgments. Energy, tempo, section, and downbeat estimates do not prove emotion, vocal status, narration fit, or a clean musical cut. Retain exact source windows, handles, reviewer or method, and listening coverage; label unreviewed suggestions as provisional. Preserve the full recording independently of excerpts.

Preserve one unchanged full recording as media authority. Treat rendered snippets as derivative evidence: convert their reviewed source bounds into cue windows instead of cataloging duplicate media. Never infer source bounds from excerpt duration alone.

Before writing:

- Inventory the incoming folder recursively and identify full recordings, annotations, indexes, and derived excerpts.
- Read `src/lib/music-catalog/schema.ts`, the configured `music-catalog/catalog.json`, and existing media paths.
- Reconcile by source hash and stable catalog ID. Refuse same-ID/different-source and same-source/different-ID collisions.
- Require an explicit rights status. Preserve source URL, license, attribution obligation, acquisition date, file hash, and import receipt; do not convert “royalty-free” into “owned.”
- Verify every full recording with ffprobe and reject cue windows beyond the source duration. Unreliable tempo remains analysis evidence and must not populate authoritative `tempo_bpm`.
- A local catalog file is a managed DreamCut copy under `music-catalog/audio/<rights-status>/`. A catalog entry may not depend on Downloads, another checkout, or a project folder. Use `pnpm music-catalog-storage --source <older-catalog-root>` to audit or recover exact missing files before importing new entries.

For a reviewed local bundle shaped as `tracks/`, `annotations/`, plus optional `index.json`, run `pnpm music-import-bundle`. Start with `--dry-run`; inspect counts and collisions, then apply. The importer copies full recordings into the rights-status folder, stores the original annotations under `music-catalog/imports/<import-id>/`, converts excerpts to source-backed cues, validates the complete catalog, and writes a manifest. It never places music on a timeline.

After writing, validate the catalog schema, verify every newly referenced file exists and matches its recorded SHA-256, and report tracks, cues, rights classes, attribution requirements, unreliable tempo count, deduplicated excerpts, and any gaps. Do not claim listening review unless someone actually listened.
