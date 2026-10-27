---
name: media-intake
description: Default router for supplied media and for choosing preparation, sampling and analysis of existing footage. Inventory mixed inputs, establish the destination, import unchanged sources, route preparation and annotations by media role, and report per-file readiness. Use for first-time imports and later additions; not for selecting edits or exporting.
---

# Media intake

Use this entry point whenever the user points at local files, a Downloads batch,
or a folder to bring into DreamCut, or asks which preparation/annotation workflow
to use for existing footage. Existing-media analysis does not require another import. This skill orchestrates existing tools
and craft skills; it does not replace their preparation or verification contracts.

## Resolve intent and destination first

Inventory the supplied scope, including nested files when a folder was supplied.
Classify by actual media type and intended role, not filenames alone. Account for
duplicates, sidecar transcripts/annotations, unsupported files, and unreadable files.
Do not scan unrelated Downloads content or silently choose among ambiguous batches.

- **Add to an existing project:** use that project; read `timeline_get` and its
  editing context. Importing does not change its timeline.
- **Make a new edit from these files:** use `editorial-assembly` to establish the
  brief and create the workspace BEFORE importing. Do not first create an empty
  ordinary project under the same ID; `assembly_create` refuses overwrite.
- **Import/organize only:** `media_import` may create an empty project. Do not infer
  permission to assemble, enhance voice, cut out people, render, or publish.
- **Reusable library import:** route to the matching catalog workflow rather than
  manufacturing a video project. If destination changes the requested scope, clarify.
- **Whole video or multi-effect reference:** route to `video-reference-analysis` for
  the full sequence map and reusable effect occurrences.
- **One bounded effect or effect tutorial:** route to `recreate-effect` for its
  construction analysis and recreation-input inventory. Both routes share the
  reference record and stay in analysis unless construction was requested.
- **Pre-edit visual collection:** use `media-annotation` to describe and index the
  collection without creating a timeline or treating it as a project import.
- **Files for a template** ("use this one on the hiker" with a template selected, or
  "Use the Mask Glitch template with my footage", plus files dropped into the chat or
  named by path): a selected template is an item of kind `Template` in the editor
  selection (`editor_context_get` `selection.items`, `timeline_get` `library_selection`);
  `get` its `template:` id from `capability_catalog` for the construction brief. A template
  named only in words: search `capability_catalog` with its title, including the
  creator's own ("Use my …" template), then `get` the match. Use the project the
  request names; otherwise the in-editor agent's own project, or for a coding agent
  the open project from `editor_context_get` when its status is `current`, else ask.
  Import the files into that project with `media_import` (managed copy), and match
  each file to the template's inputs by its role and content. Ask only when a match
  is ambiguous or an input is missing. An image pasted into the chat without a file
  path cannot be imported; ask for the file. Then build the template on that footage
  as a proposal. Importing never authorizes generation or approval.

Apply the agent guide's personal-style lookup for editorial choices. Style does
not change source preservation, rights, or technical readiness requirements.

## Choose the evidence workflow

Read [analysis routing](references/analysis-routing.md) before selecting sampling density
or VLM work. Route by the purpose of the inspection, not just the file type: a talking
head, an effect reference and a mask review need different evidence. Keep deterministic
readiness, semantic observations and edit-specific acceptance separate. A workflow
coordinates existing tools; reading this skill does not itself execute preprocessing.

## Import once, then route each asset

For project media use `media_import` with managed copies by default, following
AGENTS.md's media-ingestion contract. Reuse verified source identities and existing
receipts instead of duplicating imports or launching jobs already running.
Read each selected specialist skill completely before executing its route.

| Input / role | Preparation and analysis route |
| --- | --- |
| Video, screen recording, animated visual | `editor-media-preprocessing` for the ready preview/render package; `media-pull` for source provenance and visual annotations. Speech additionally follows the speech route below. Animation must remain moving media, not a replacement still. |
| Recorded speech, including video audio | `voice-file` for source audio checks; `caption-craft` / `cut-pacing` when transcription, alignment, or spoken-boundary decisions are needed. Transcript review and forced alignment remain their own gates; import does not authorize speech cuts or automatic enhancement. |
| Still, screenshot, logo, transparent graphic | `media-pull` for inspection, provenance, descriptive annotation, and available image catalog registration. Requested masks/compositing go to `video-compositing`; requested subject removal to `talking-head-cutout`. Do not apply these treatments merely because a file was imported. |
| Music | `music-catalog-ingestion` for a library/bundle; `music-audition` only if choosing music for an edit. `editor-media-preprocessing` owns source waveform preparation. Preserve rights and cue annotations. |
| Sound effect / ambience | `sound-design` for catalog metadata and cue interpretation, and `editor-media-preprocessing` for waveform preparation. Import does not authorize placement or a mix change. |
| Transcript, captions, script, annotation sidecar | Preserve as supporting evidence attached to its source; route caption/transcript interpretation to `caption-craft` and script intake to `editorial-assembly` when assembly was requested. Do not treat supplied timings as force-alignment proof. |
| Document, archive, editor-project file, unknown format | Identify its intended use and consult the available format-specific reader/importer. Never execute imported scripts or silently flatten a project/document into imagery. If no supported route exists, retain its place in the inventory and report the missing capability. |

The route may branch (a talking-head video needs both picture and speech checks).
Load only applicable specialists, not the entire table.

## Track preparation separately from annotations

Preview preparation is automatically queued for supported imported videos; consume
its actual ready/failed receipt through `editor-media-preprocessing`. This does NOT
mean scene descriptions, transcripts, actions, or catalog annotations are complete.

Inspect the installed analysis capabilities before running them. The current project
analysis surface is under `/api/projects/<id>/analysis/`: assets, jobs, tracks, and
annotations are readable; enqueue is separate and respects the project's analysis
setting. Read the route schema before a call. Do not silently enable disabled analysis
or upload private sources to an external service. If blocked, record the reason and
continue preparing unaffected files.

Require source-linked descriptive annotations appropriate to the intended use:
what a visual contains, what happens in useful video intervals, what speech/music/SFX
contains, and known rights/reuse restrictions. Route interpretation to the specialist;
record observed evidence separately from inferred or unreviewed labels. Use canonical
annotation/catalog storage when supported. Do not claim catalog registration from a
project import, or annotation completion from a successful transcode.

Every visual intake also needs a user-readable display name and a concise observed
description in canonical annotation/catalog metadata. Inspect the image or prepared
video before naming it; filenames such as `pose-08.png` are provenance, not useful
Library titles. Prefer subject + visible action/state, with sequence position or
variant only when needed to distinguish similar assets (for example, “Alex — arms
crossed, final hold”). Keep original filenames, source bytes, paths and hashes
unchanged. Do not invent a pose, identity, or usage claim from a filename or prompt.
Library selection should show the display name and description, while retaining the
original filename for search/provenance. If inspection or annotation is unavailable,
mark naming/description pending in the intake receipt rather than declaring the asset
fully ready. Apply this to generated assets entering Library as well as supplied files.

## Per-file handoff and resumption

Persist an intake receipt under `analysis/media-intake/` with a unique batch ID.
Reference canonical artifacts rather than copying their contents. Each input records:
original path, source hash/asset ID when available, managed path, intended role,
specialist routes, preparation receipt, annotation/catalog references, and the next
action. Track import, preparation, and annotation statuses separately as pending,
running, ready, failed, or not-applicable (with a reason). Record unsupported inputs.

On resume, reconcile the receipt with actual jobs and source hashes. Changed bytes
invalidate dependent readiness; failed jobs are not ready and running jobs are not
restarted blindly. This receipt is a workflow artifact, not a new app job queue.

Report counts and exceptions concisely. Call a file ready for its intended use only
when all applicable preparation and annotation checks have evidence. Name narrower
states such as "preview ready; transcript review pending" when appropriate. Hand
ready packages to assembly or proposals only when the user requested editing.

## Requested cutout preparation

When the authorized edit needs subject separation, route to
[rotoscope](../rotoscope/SKILL.md) and use `cutout_prepare` / `cutout_status`.
Reuse matching verified preparation rather than re-running SAM. Existing person-location
annotations can guide point selection after inspecting source samples; they are not a
verified matte. Import-only requests still do not authorize segmentation. A completed
mask job and a ready preview are separate from visual acceptance and timeline placement.

## Learned refinements

- Record creator identity corrections as authoritative canonical metadata and check that corrected identity before any later placement naming the subject.
