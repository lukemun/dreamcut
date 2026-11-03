---
name: music-audition
description: Find cataloged music passages and prepare playable comparisons for a video, scene, mood, or narrative turn. Use when choosing music or auditioning alternative cues; catalog building without a current edit is a separate preparation step.
metadata:
  version: "1.2.0"
---

# Music audition

Read `../music-direction/SKILL.md` and `../timeline-auditions/SKILL.md` before editor work, including their proposal guidance. Search existing music before fetching new tracks.
Use `../music-catalog-ingestion/SKILL.md` instead when the task is importing or reconciling an assembled reusable library.

## Find passages

Read the configured DreamCut music catalog (`TIMELINE_MUSIC_CATALOG_DIR`, otherwise `catalogs/music/catalog.json`) and the creator's personal music library (`<profile>/library/music/catalog.json`, files under its `files/`). Also search locally retained cue annotations under ignored `social-content/` when present. The retired workspace is preserved at `social-content/legacy-social-content/`; its `CATALOG.md`, `catalog.csv`, and `shoots/*/annotations/annotations.json` retain full-source hashes, review status, cue windows, and provisional tags. Resolve paths relative to the containing catalog, never from a filename alone. If local social content is unavailable, report the missing search scope and use the available catalog.

Match the actual request against cue-level mood tags, energy trajectory, turn/peak offsets, available duration, and narration needs. A matching track title alone is insufficient. For provisional tags, state the uncertainty and listen/review before treating mood, phrase boundaries, vocals, or tempo as confirmed. Do not automatically rerun extraction when only the search brief changes.

If no scene or plan exists, browse a few relevant passages with source timings; do not invent a production brief or select a winner. Catalog preparation belongs to `music-catalog-ingestion` and can finish without a timeline.

## Grow the catalog from a real edit

When the available catalog has no credible fit, use the current edit as a narrow acquisition brief rather than starting a broad music search. Add only exact recordings that can be reused: verify the composition and the recording separately, preserve the performer or recording authority, source page, license, file hash, full duration, and any attribution or delivery obligation. A public-domain composition does not make an arbitrary recording public domain.

Create one cue window for the passage actually auditioned, including its source-in/out, intended role, measured comparison gain or loudness note, and the picture/dialogue boundary it was designed around. Keep mood, tempo, phrase, and speech-compatibility judgments explicitly provisional until a human hears the cue both solo and against the edit. The first project's choice is evidence for that use case, not universal proof; broaden `good_for` or promote additional cue windows only after later edits demonstrate them.

Prefer a low-obligation recording when two options are editorially equivalent. Never hide attribution, share-alike, platform-only, territory, or reference-only constraints merely to make an option easier to ship.

## Make the comparison useful

For multi-section edits, consume the section map from `music-direction` first.
Keep section IDs and its spoken anchors on each audition card.
Group sections that share a musical purpose; do not equate section count with track
count or overcorrect a fragmented score into a mandatory single bed. A score option
may contain a few coordinated cues with reviewable joins. Offer different
editorial readings (for example understated versus playful), not just several
similar filenames. Preserve enough source context to assess the phrase; an
extended catalog excerpt is a new provisional window, not automatically reviewed.
Measure the actual compared windows, not only whole-track loudness. Record source
windows, measured loudness/peak, gain, and intended musical anchor before proposing.

Use a small shortlist (usually 3–5 materially different cues). Label each option with track/version, source-in/out, duration, proposed emotional role, and why it matches. Preserve reference-only status; do not relabel it licensed or invent a platform sound mapping.

For a scene audition, compare the same picture and dialogue window with each music option. Align the relevant musical turn or peak to the same scene beat; record the cue's source offset and resulting timeline offset. Match perceived playback loudness with a documented per-option gain, retaining each cue's internal dynamics. Avoid judging fit from a louder option. Keep narration intelligible and allow hearing each cue alone as well as in context.

For a working passage, use mutually exclusive proposal options on the original project, including when the music sources are new. This is an audition (user choice), even though the current transport is `proposal_create`. Preserve the full assembled picture and its actual speech speed. `audition_create` currently creates a separate source/take comparison; use it only when that source comparison is the intended context. Never substitute raw talking-head footage at a different speed for the working edit to fit that schema. Placing the chosen music is an edit (approval). Read capabilities before assembling. Keep music as editable audio. If the current schema cannot represent a source status or comparison, preserve a standalone playable shortlist and report the editor limitation rather than coercing fields.

For a standalone audition, a local cue browser under `social-content/` may provide full-track context and separate excerpts without requiring a project. Verify media loads, playback advances, windows stop at their ends, and source mappings are correct before calling a comparison playable. A script or waveform alone is not a listening review.

## Record the choice

Leave all options unselected until the user chooses. Record the chosen track/version/cue IDs, original source hash and interval, comparison gain, alignment anchor, and the user's reason when supplied. Keep this decision with that project's brief; a choice for one scene is not a global taste preference. Carry the selected source window into a reviewable placement proposal. Selection does not itself authorize publishing or deleting alternatives.
