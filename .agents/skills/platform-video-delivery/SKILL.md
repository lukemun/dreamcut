---
name: platform-video-delivery
description: Prepare and quality-check a DreamCut video for a requested social or presentation delivery format.
---

# Platform video delivery

Read `../open-edit-proposals/SKILL.md` before timeline work.

Confirm aspect ratio, safe areas, duration expectations, caption readability, audio peaks, and end-frame hold. Output-format changes are proposals. Rendering is a separate delivery step and requires an explicit user request after timeline approval. Check safe areas against the measured standard (`docs/standards/vertical-video-safe-zones.md`; code authority `src/lib/qc/standards.ts`), not a generic 5% box: on 1080x1920 Reels keep critical content inside top 270 / bottom 672 / left 64 / right 65, clear of the 193px right action rail below 44.8% frame height. Remember the Home Feed 4:5 preview crops 285px off top and bottom.

Before delivery, inspect the full timeline for black frames, clipped text, missing media, caption drift, and abrupt audio boundaries.

## Chat export request: execution workflow

The editor's Export dialog renders directly. A chat export request supplies or implies
`project_id`, `format`, `aspect_ratio`, `muted_lane_keys` (silent lanes) and
`hidden_lane_keys` (lanes with no picture); default the lane sets to the project's
saved mute/hide state. Those values are task data. The user's explicit export request
provides the export authorization. A request to edit this skill alone does not.

1. Read the current timeline, metadata, applicable preferences and pending review
   state. Preserve the approved edit. Confirm the saved ratio matches the request;
   route a needed format change through a proposal. Never render an unapproved
   candidate as if it were the approved cut.
2. Run project readiness and `pnpm frame-state <project_id>`; read the report before
   judging appearance. Inspect relevant frames using its manifest and review motion
   and audio. Reuse evidence only for unchanged inputs and the same review question.
   Report blockers before starting a render; do not silently repair the timeline.
3. Start one tracked render with the exact export-only mute and hide sets through
   `POST /api/projects/<project_id>/render` with
   `{ "muted_lane_keys": [...], "hidden_lane_keys": [...] }` (omitted hidden keys use saved metadata).
   This uses the editor's checkpoint and render-job lifecycle. Reuse an existing
   in-progress job when returned; do not start duplicate exports. `pnpm render
   <project_id>` is an alternative only when the requested mute and hide sets match saved
   metadata, because that CLI reads both sets from metadata. Do not change saved
   mutes or hidden lanes merely to export. Use `GET /api/generation-jobs/<job_id>` for the returned job to
   track completion; a queued or failed job is not a delivered video.
4. While rendering, review recorded directions, corrections, proposal decisions and
   final settings against the frozen export checkpoint. Coordinate with the existing
   export retrospective instead of creating a duplicate review. Separate observations
   from inferences, cite evidence, and preserve learning/automatic-worker opt-outs.
   Stage reusable skill candidates through the existing retrospective contract;
   do not silently rewrite skills or invent a preference from technical defaults.
   Use [learning-review](../learning-review/SKILL.md) as the routing owner for any
   additional evidence-supported review tracks. Reuse existing editorial retro findings;
   delivery is an invocation point, not a requirement for those reviews. Do not run every
   track or duplicate a worker. Preserve learning/retro opt-outs. Eval curation and tool
   candidates retain their independent procedures; missing candidates never block delivery.
5. Verify the completed file decodes, has the requested dimensions and duration,
   and contains the expected picture and audio. Inspect the rendered result for the
   issues listed above; a successful encoder exit is not visual or audio acceptance.
   Report unresolved checks explicitly. Check retrospective status separately from
   render completion, recording disabled, pending or failed review honestly.
   After completion, the independent review router may use the export checkpoint and
   scoped activity for relevant workflow/tool/skill/style/eval questions. Surface useful
   findings in chat, not new app cards. Tool review uses export mode; no missing optional
   evidence blocks delivery or changes the editorial retrospective's status.
6. Return the export file, a compact verification/delivery receipt and a brief retro
   summary (or its actual pending/disabled status). Do not publish or remove older
   renders without the separate authorization required by the repository contract.

The tracked renderer and checkpoint validation provide deterministic execution;
the skill orchestrates these tools and evidence review. It is not an automatic
executable or a guarantee that subjective review is deterministic.

## Export variants and closeout

Name the exact difference between requested versions before rendering. “With and without [track]” toggles only that named track; preserve all other music, voice, SFX, timing, and picture. Do not reinterpret it as “music versus no music.” Resolve speech-to-text names against the current catalog/timeline. If clarification is necessary, ask about the named difference rather than proposing a broader change.

Record a compact variant manifest with the timeline revision, target element IDs, each version's included/excluded audio, and filenames. Verify that the difference between versions contains only the requested change. Prefer export-only inputs; do not alter the working timeline's mute controls. When only audio differs, reuse the validated picture stream and render the alternate audio with the same source clocks, gain envelopes, fades, and duration. Check picture identity, decode success, and that the named track is actually present in one version and absent in the other—not merely that both files have an audio stream.

Finish every export with a retrospective in project Memory and a delivery receipt. Record the request, interpretation, validation evidence, failures/retries, and concrete lessons. Update applicable skills for reusable workflow corrections when authorized; stage inferred preferences or unapproved skill changes for review. Explicit user corrections take precedence over an earlier mistaken confirmation. Record “no new lesson” when appropriate rather than inventing a rule. Do not report delivery complete with the retro silently omitted.

Use the editor export or `pnpm render` tracked lifecycle, not the low-level encoder as a delivery shortcut. Check the saved retrospective status separately from video completion: queued/running is not reviewed, and a failed review does not mean the video failed. For a custom audio-remux delivery, preserve the exact variant checkpoint and explicitly record its retrospective handoff. Show skill candidates through Memory → Retros with their change preview; do not describe observation-only findings as skill updates. See the [export retrospective contract](../../../docs/standards/export-retrospective-contract.md).

## Platform post copy

Treat an Instagram post caption or YouTube description as companion editorial, not as a recap or transcript of the video. The copy should advance the video's idea by adding at least one genuinely new layer: a concrete scenario, thought experiment, implication, counterpoint, useful context, or question that invites the viewer to apply the argument to their own life. Repeating the hook, claims, statistics, or conclusion already delivered in the video does not satisfy this requirement unless that repetition is only the setup for the new layer.

When a prior successful post is available, use it to learn the creator's voice, length, formatting, and hashtag density; do not copy its substance or reduce the new description to another summary. A useful final test is: after watching the full video, does reading the post copy give the viewer something new to consider?
