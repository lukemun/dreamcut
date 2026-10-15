---
name: talking-head-cutout
description: "Create, refine, and audit source-synchronized moving cutouts of presenters or other people, especially Scratchpad-style talking heads. Use when removing a real-room background, preserving a full visible person, diagnosing hair or skin matte failures, or preparing a cutout for a DreamCut proposal. Do not use chroma key for ordinary rooms or use this skill for simple crops and trims."
---

# Talking Head Cutout

Produce a reversible alpha-video derivative whose entire visible subject survives the full requested interval. Treat hair, hands, and internal silhouette continuity as acceptance criteria, not polish.

## Required companion guidance

Before changing media or proposing adoption, read:

- `../editor-media-preprocessing/SKILL.md`
- `../video-compositing/SKILL.md`
- `../open-edit-proposals/SKILL.md`

This skill governs the person matte and its evidence. The companion skills govern provenance, compositing, and proposal-safe timeline adoption.

For an assembly, follow the **Presenter-first standard and review gate** in `../editorial-assembly/SKILL.md`. Select and verify speech before finalizing cutout processing. Treat bounded mask/encoding chunks as derived views of the same presenter edit, not independently timed B-roll. Before advancing to supporting visuals, verify styled picture against the audible voice during normal playback, chunk transitions, seeking, and pause/resume; per-second screenshots prove appearance coverage, not lip sync. A new derivative reopens the presenter appearance and playback checks.

## Workflow

1. Inspect the source at the interval start, middle, end, and every major pose or framing change. State what “full person” means from the pixels actually present; never invent body parts outside the camera frame.
2. Keep the camera original unchanged. Record its project-relative path, fingerprint, source interval, prompt frame, cadence, and output path in the normal custom-cutout receipt.
3. Prefer the local SAM 2 custom-cutout path for a person shot in a real room. Use chroma key only when the source was genuinely shot against an even, separable solid colour.
4. Prompt the whole visible silhouette. Positive points should cover the hair crown, both side hair masses or temples, face, both shoulders, torso, each visible arm, and each visible hand. Put negative points only on confirmed background. Avoid negative points near wispy hair, skin edges, shadows that belong to the subject, or gaps between hair and face.
5. When supported, add a loose full-subject box. The box must include hair tips and hands with margin; it is guidance, not a crop.
6. Split long sources into bounded intervals at meaningful pose, scale, lighting, or occlusion changes. Preserve source-clock continuity and generate audio-free alpha media. Never flatten the original or borrow timing from a proxy.
7. Review the matte on black, white, and checkerboard. Black reveals pale fringes; white reveals dark contamination; checkerboard makes holes and semi-transparent edge chatter visible.
8. Run the per-second audit with `scripts/cutout-contact-sheet.mjs`. Also inspect the exact interval boundaries and any known motion extremes, because integer-second samples do not replace boundary review.
9. New SAM 2 presenter cutouts fill small enclosed alpha holes by default. This cleanup must remain area-bounded and must never fill edge-connected background or large legitimate openings. If subject pixels are still missing or the defect reaches the exterior silhouette, fix prompts or interval boundaries and propagate again. Do not erode a matte with missing hair: erosion can remove more subject. Use erosion only for a proven bright outer fringe after silhouette completeness passes.
10. For a Scratchpad border, derive the white outline from the alpha contour rather than stacking directional drop shadows. Clean the alpha edge before expansion, dilate it to the requested outline width, add only a narrow outer feather, then composite the subject over the outline. Keep the subject's interior RGB sharp. In the Remotion renderer, use this order: blur `SourceAlpha` slightly, restore alpha contrast, apply `feMorphology` dilation, feather the expanded alpha, flood it white, remask `SourceGraphic` with the cleaned alpha, and composite it over the outline.
11. Inspect the styled result at full resolution around the hair crown, temples, ears, shoulders, hands, and frame edges. A smooth border may suppress single-pixel stair steps, but it must not conceal detached background islands, missing hair, or temporal chatter. Fix those defects in the matte instead of increasing the blur until they disappear.
    Scratchpad wraps the **entire visible cutout perimeter by default**, including camera-cropped arms, torso, both sides, and the bottom edge—not just the head. Reserve transparent overscan before dilation so the border cannot be clipped by the source rectangle. The preparation utility uniformly insets the complete subject into its original-size transparent canvas, preserving all source pixels and aspect ratio to rounding precision. Do not crop more body away or invent missing anatomy. A naturally straight camera cutoff may remain straight, but it must receive the same continuous white border with joined corners. Verify all four sides on black at the start, middle, and end, and disclose any slight size change introduced by overscan.
12. Adopt a speech-derived cutout through a proposal using `sync_speech_visual`. Keep the visual bound to the active speech element and absolute source window. Never approve the proposal on the user's behalf.

For moving alpha video, the current renderer deliberately skips live SVG outlines because accelerated video filtering can obscure lower layers. An enabled `sticker_outline` flag therefore does not prove a visible border. Use `pnpm exec tsx scripts/scratchpad-cutout.ts <projectId> <unstyled-cutout-id> <width>` to prepare a cataloged transparent derivative, then propose it with `sync_speech_visual`. This utility cleans every saved mask before outlining, records per-frame hole statistics, and stops for review if enclosed holes remain. It reconstructs the subject from the original RGB source—not an already outlined video—so repaired holes recover real hair/skin rather than retaining white pixels. It records parent/output hashes and verifies dimensions, frame count, and alpha. Verify the actual editor preview after adoption; a styled still alone does not prove the moving-video path.

## Failure conditions

The cutout is not ready if any reviewed frame has:

- a hole between hair and skin or missing hair mass;
- missing face, neck, shoulder, arm, hand, or clothing that is visible in the source;
- a background island attached to or floating near the subject;
- temporal edge chatter, popping, or a silhouette jump;
- a blocky, stair-stepped, or halo-like Scratchpad border at delivery resolution;
- an opaque plate where alpha should be present;
- a source-time gap, overlap, frozen interval, or mismatched duration.

Record the exact failing timestamps and the visible defect. Do not call the result “ready” merely because most frames pass.

## Per-second audit

Create a JSON manifest with ordered, gap-free timeline segments:

```json
{
  "name": "presenter-cutout-v1",
  "segments": [
    {
      "timeline_start": 0,
      "duration": 4,
      "source": "media/cutouts/presenter-a.webm"
    }
  ]
}
```

Then run:

```bash
node .agents/skills/talking-head-cutout/scripts/cutout-contact-sheet.mjs \
  --manifest projects/<projectId>/analysis/cutout-qa/manifest.json \
  --output projects/<projectId>/analysis/cutout-qa/run-001
```

The script produces one black-background, white-outline PNG for every integer timeline second, readable contact sheets, and `qa-receipt.json`. The diagnostic white outline is deliberately derived from the alpha channel: internal white marks expose holes instead of concealing them. Do not apply production Scratchpad smoothing to this diagnostic evidence—the audit must reveal raw matte defects. The generated receipt proves sampling coverage and remains `pending_human_review`; visual acceptance requires inspection.

## Acceptance record

For each run, retain:

- the manifest and generated `qa-receipt.json`;
- the contact sheets and any enlarged failure frames;
- pass/fail/pending status;
- timestamped findings;
- the prompt or interval change used for each retry;
- the final derivative receipt used by any proposal.

If any sampled second fails, keep the derivative available for comparison but do not recommend timeline adoption.

## Demonstration

The Talking-Head Background Removal template's teaching media (`public/recipe-previews/talking-head-cutout/`) come from demo project `tpl-talking-head-cutout-demo`, proposal `20261015T054111-a16f8127`: Pexels 8814086 with SAM 2 cutout 820bff72 over a plain backdrop. The first cutout (faabcba4) lost the pendant in some frames and a re-prompt with chain points (f5d575a5) tore the hair tips; adding one pendant point and one point on each hair-tip mass fixed both.
