---
name: caption-craft
description: Create or refine accurate, readable, timed captions for a DreamCut video.
---

# Caption craft

Read `../open-edit-proposals/SKILL.md` before timeline work.
Read `../visual-timing/SKILL.md` for accumulating spoken-text builds and `../spatial-composition/SKILL.md` before placing captions among visual actors.

Use forced word alignment when available. Preserve exact spoken wording, punctuation, and word timing. Caption grouping must be deterministic and pause-first; do not pack the transcript into fixed three-word chunks.

Caption text is literal: the player and export display exactly the capitalization and punctuation stored in the text field. Do not add a separate upper/lowercase presentation override. A caption element appears as a complete phrase at its timeline start; use separate elements when independently timed entrances are wanted. Word-timed modes are reserved for the explicit active-word and single-word treatments, not for silently building an ordinary phrase word by word.

Every `replace_captions` cue must carry its timing authority: the active speech element id, the alignment SHA-256, absolute aligned source-word start/end, and the speech element's observed playback rate. Derive timeline time from that source mapping. Never rescale orphaned timeline timestamps. Proposal validation must fail if the speech clip's trim, placement, playback rate, alignment hash, or spoken words no longer match.

When visible talking-head derivatives accompany that speech, bind them with `sync_speech_visual` to the same active speech element and absolute source clock. A speed or trim change is incomplete unless audible speech, visible mouth movement, and captions all resolve from that shared authority.

For presenter assembly, follow the **Presenter-first standard and review gate** in `../editorial-assembly/SKILL.md`. Caption the selected speech edit, not provisional takes or a separately timed cutout. If voice is detached or enhanced, preserve its source-clock mapping and source-bound caption ownership. Verify picture/voice first, then captions in presenter-only playback; never compensate for a lagging video decoder by offsetting correctly aligned captions.

Before proposing caption timing changes for apparent playback drift, verify every cue against its bound speech clip, trim, rate, alignment hash, and absolute source-word interval. Decoder starvation must pause and re-gate preview playback; it is not evidence for a caption offset. Repair missing or stale bindings atomically with `replace_captions`, even when only one cue is visibly wrong, so the speech-owned rail cannot become partially linked.

For aligned speech, use `groupAlignedWordsByNaturalBoundaries` from `src/lib/timeline/caption-grouping.ts`. Its default boundary order is:

1. End at sentence punctuation or an inter-word pause of at least 320 ms.
2. Prefer a boundary at an inter-word pause of at least 140 ms, or at clause punctuation when the recorded delivery supports it.
3. Prefer three-word captions and permit four words to avoid an orphaned or choppy fragment.
4. Use one or two words only for a genuinely short utterance or where a hard acoustic or sentence boundary requires it.

The measured word gap is the timing authority. Punctuation supplies semantic evidence but must not invent a pause; a tightly spoken comma does not force a cut.

Spoken captions are single-line by default. Every generated or replacement audio-linked cue carries `caption_single_line_contract: true`; preview, export, and QC collapse authored hard breaks for display and fit the font size down within the semantic caption rail. Do not disable the contract to preserve a large authored font size. Shorten pause-aware grouping first when a fitted line would become uncomfortably small. This rule does not apply to intentional graphic text cards, benchmark tables, or title treatments that merely share the `caption_text` element type.

Keep captions inside safe areas, away from faces and important visuals, with legible contrast and no decorative highlight unless requested. On 1080x1920 Reels that means the caption box inside x 65..1015, y 270..1248, and x <= 887 below 44.8% frame height (the action rail); see `docs/standards/vertical-video-safe-zones.md`.

Caption placement is semantic. Supply a named `position_preset` such as `bottom_center`; never author `absX`, `absY`, `offsetX`, `offsetY`, `abs_x`, or `abs_y`. The proposal contract rejects raw caption coordinates. Preview and export resolve the preset through the shared caption-layout function, and spatial assessment consumes that same resolved anchor. A human may create a manual placement through the editor UI, but an agent must express a direction and let deterministic code calculate geometry.

Use the caption replacement or caption patch proposal operations. Preview timing at normal speed and around every cut.

## Learned refinements

- Generate captions with explicit source-clock bindings (`caption_follow_audio: true` plus `caption_audio_binding`). Provenance metadata alone does not link old captions. Linked captions follow trims, splits, and rate changes through the shared caption-follower derivation; do not retranscribe merely to change speed. The UI offers only **Unlink from audio**, reversible with Undo. Regenerate when the transcript or alignment authority changes.
- Do not combine a placement preset with authored coordinates. Dual placement authority let an agent-provided `0.5` be interpreted as a box edge rather than its centre; semantic placement must have one deterministic authority.
