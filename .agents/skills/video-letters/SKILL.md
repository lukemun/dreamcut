---
name: video-letters
description: Build the Video Letters effect, also asked for as "video through the letters", "the video plays inside the text", "fill the title with the footage" or "watch the clip through the word". A big, thick native title whose letters show a project video playing inside them, on a black frame or over the edit. Use for the Video Letters template (Templates → Effects). Not for still images inside text (image fill with pictures), handwriting that reveals footage as it writes (video-typography), or footage inside a person's silhouette (Silhouette Window).
---

# Video Letters

The look is **one native title in heavy block letters with a project video as its fill**.
The letters are a window: only the pixels under the glyphs show the video; everything else
stays what is behind the title. The word stays editable text and the video keeps its own
source and clock.

Read [dreamcut-proposals](../dreamcut-proposals/SKILL.md) before proposing on a working
timeline, and [video-typography](../video-typography/SKILL.md) for placement and readability.

## Inputs

| Role | Required | When missing |
| --- | --- | --- |
| The word | Yes | Use the creator's words; ask only if there is no word at all. One short word reads best: fewer letters means bigger letters and more video. |
| The video | Yes | A video already in the project. Import supplied files with `media_import` first ([media-intake](../media-intake/SKILL.md)). |
| Where and when | No | Centre of the frame for about five seconds from the start; move it to open space from `open_space_find` when other text or a speaker shares the frame. |

The video needs a ready preview: call `media_readiness` (action `status`) and read
`preparation.preview`; with `media_readiness` the preview URL is that path under the project's media, the same form as the video's source URL. Re-read it just
before proposing, because re-preparation can move the preview to a new folder.

## Build

Propose one `create_text` on its own `captions_N` lane (caption lanes draw above picture lanes):

| Field | Value |
| --- | --- |
| `text` | The word, in capitals |
| `fontPreset` | `anton` (or another heavy block font such as `bebas_neue`, `archivo_black`, `oswald`) |
| `fontSizePx` | `300` (the maximum at 1080 wide) |
| `positionPreset`, `maxWidth`, `singleLine`, `textAlign` | `center`, `1`, `true`, `center` |
| `styleVariant` | `image_fill` |
| `mediaFillVideoUrl` | The video's source URL |
| `mediaFillVideoPreviewUrl` | Its prepared preview URL |
| `mediaFillVideoPlaybackRate` | `1` |
| `animationIn` / `animationOut` | `fade` 0.2 s / `fade` 0.3 s (0 for an instant title, as My Style prefers for informational text) |
| `timeline_start`, `duration_seconds` | Where the title belongs; 5 s by default |

Never use `write_on` or `handwriting` entrances here: they route the fill through the
handwriting renderer, whose pen strokes are too thin to watch a video through. Thin or script
fonts fail for the same reason; the creator rejected both for this effect.

Add an **Extra time on screen** hold so the length is tunable: a `timing_controls` entry
with `kind: "hold"`, `reference_seconds: 0`, `spacing_seconds: 0`, `min_spacing_seconds: 0`,
`max_spacing_seconds` up to 3, bound to `create_text.duration_seconds` with `offset_seconds`
equal to the drafted duration and `spacing_multiplier: 1`. Declare `review_questions: ["hold"]`.

## Controls on the proposal card

In this order: Size (`fontSizePx`), Extra time on screen (the hold), Animation in, Fill speed
(`mediaFillVideoPlaybackRate`), Animation out.

## Verify

1. `proposal_spatial_preflight`, then `proposal_create` with the same body. A refusal naming
   `caption-fill-source` means the preview URL is stale or the preview is not ready.
2. Stills after the fade and in the hold: `pnpm frame-state <project> --proposal-file <card.json>
   --at <times>`. Zoom in: at small sizes, black gaps between condensed letters can read as
   black letters on a video box. Check that the video is inside the glyphs.
3. Motion: replay the card in the editor, or render the preview with
   `pnpm exec tsx scripts/render-preview.ts <project> --out <file.mp4> --proposal-file <card.json>`.
   Two stills a second apart should show the footage moving inside the letters.
4. Report what was not checked (for example a full export).

## Limits

- Which part of the video shows inside the letters is not a dial: the video covers the
  word's box, centred.
- Letter spacing is not a dial; Size sets the word's width (300 px tops out near half the frame
  width for a four-letter word in Anton).
- Busy figures behind the title show through the letters' gaps; put the title over a quiet area
  or black when legibility matters.

## Template and evidence

Template `FX-VIDEO-LETTERS` (Properties → Templates → Effects). Teaching media:
`public/recipe-previews/video-letters/`, from demo project `tpl-video-letters-bobblehead-demo`
(16:9, 24 fps, landscape like every template demo), card `20261027T084826-bfb59fa8`: RUN over the bobblehead's run on a plain grey
studio, with the fill zoomed to 1.6 (`mediaFillScale`, which has no dial on the card yet) so the
figure fills the middle letter. A plain background makes the letters read weaker than busy,
colourful footage. Earlier Pexels demo project `tpl-video-letters-demo` (9:16, 30 fps),
both cards pending and never approved: set A, WILD over a flower-meadow clip (Pexels 8148429);
set B, COLD over a snowy boardwalk clip (Pexels 10989548). A live web version with extra dials
is in the effects catalog (`dreamcut-cloud/effects`, entry "Video letters").
