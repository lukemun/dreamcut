---
name: beat-aligned-cuts
description: Align visual cuts, sprite poses, or graphic state changes to selected musical hits in DreamCut. Use for drum drops, melody runs, marked rhythm hits, or beat-synced edits; music selection and spoken-word timing use their own skills.
---

# Beat-aligned cuts

Read [open-edit-proposals](../open-edit-proposals/SKILL.md) before timeline work. Use [editorial-intent-planning](../editorial-intent-planning/SKILL.md) for multi-group edits and [video-compositing](../video-compositing/SKILL.md) when several layers change together.

## Establish the chosen hits

- Read the current timeline, music clip identity, trim, speed, source hash, and applicable preferences. Do not infer saved state from visible checkmarks.
- Read the instrument payload through `GET /api/projects/<id>/library/instruments?source_url=<encoded URL>`. Its `settings.marked_hits` is the applied whitelist; `presets` contains separately named snapshots. Report these separately: applied choices can be saved without a named snapshot. Unsaved viewer drafts are not an authority.
- Use the user-specified snapshot when named; otherwise use the current applied choices. Preserve its settings, source/recipe identity, snapshot range, and hit positions in the edit evidence. An empty marked list means no chosen hits, not permission to use all detections. An absent list is a legacy filter-based set, not an explicit selection.
- Resolve keys with the canonical helpers in `src/lib/timeline/instrument-analysis.ts`. Match instrument plus source time, not rounded display labels. The `other` lane is melody/other; do not treat detector labels as proof of a specific instrument. If a key no longer resolves, report it rather than substituting another attack.
- Sort by source time: marks may have been clicked out of order. Keep simultaneous attacks from different instruments distinct until the edit's grouping rule is established. Do not replace chosen attacks with a regular BPM grid or run fresh analysis unnecessarily.

## Build a hit-to-state map

Project source times through the actual music clip clock. For constant speed:

`timeline time = clip start + (source hit time - source trim-in) / playback rate`

For speed steps, holds, or split clips, use the canonical projection helpers in `src/lib/timeline/beat-annotations.ts` and media timing resolution instead of that shortcut. Ignore hits outside the playable source window. Quantize each absolute target to the composition frame rate; record the timing error. Do not accumulate rounded durations.

Persist `analysis/beat-cut-map.json` (or a named sibling for independent edits) with the timeline revision, music clip/source identity, selected snapshot or applied settings, and ordered rows containing instrument, source time, timeline time, target frame, timing error, group/role, visual source frame, and affected element IDs. Keep mapping choices and unresolved ambiguities explicit.

Choose the rule from the request: one cut per chosen hit, strong-hit jumps with detail runs, selective accents, or another specified rhythm. Detection alone does not authorize cutting on every hit.

### Optional pattern: drop jump followed by consecutive frames

When requested, a drum/drop jumps to a later source pose `k`; the next three marked melody hits show exactly `k+1`, `k+2`, `k+3`. Hold each pose until the next mapped hit. “Next frame” means the next source sprite frame, not the next entry in a sparse subset already on the timeline. Verify those assets exist; derive missing frames from the approved original video without inventing motion or generating replacements.

Group using the selected chronological events. Do not silently invent a fourth hit, discard an extra melody attack, or move a hit across the next drop. Flag incomplete/ambiguous groups and same-frame collisions. Choose jump sizes across the available sequence, preserve increasing source order unless directed otherwise, and finish at the requested final pose. A jump should skip source poses when that is the intended accent. The number of groups and three-hit pattern are user choices, not universal defaults.

## Propose and verify

- Preserve music trim/speed, body size, contour style, and overall duration unless the user requested changes. Align associated pose and contour replacements atomically; do not turn a timing request into a new visual treatment.
- Hold to the next target and explicitly define the final hold. Respect minimum clip lengths; if two hits cannot support legal separate cuts, surface the conflict rather than silently shifting them or dropping one.
- Use the existing proposal contract, including spatial preflight for visual changes. Extend a missing structural capability rather than writing timeline files directly. Never approve or export as a side effect.
- Verify every mapped cut against the derived proposal: intended source frame, target frame, no missing/overlapping state, synchronized companion layers, unchanged unrelated tracks. Inspect before/at/after each cut and play the complete groups at normal speed with music.
- Separate numerical alignment, visual inspection, and listening evidence. A waveform or successful playback clock does not prove that the cuts feel musical. Report any unlistened or unpreviewed interval. Current-timeline frame-state reports do not validate a pending proposal.

Hand off the proposal with group count, source-frame mapping, and any quantization/collision caveats. Marked hits remain intact; this workflow does not delete candidates or rewrite the user's saved selection.
