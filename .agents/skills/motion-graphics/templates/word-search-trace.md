# Word Search Trace

Template `FX-WORD-SEARCH-TRACE` (Properties → Templates). A white letter grid sits over
the footage. On each cut a hand-drawn rounded outline draws around one hidden word,
and every outline stays on screen. Recreated from a "connect the letters" tutorial
by Camila Tunoni (instagram.com/reel/DbI9OQqMqw8); no reference pixels are reused.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Shots | 2–4 short clips | One shot per word, already cut on the working timeline or placed by an assembly. |
| Words | One per shot | A–Z only, 2–12 letters. Ask for them when the creator has not named them. |
| Directions | Optional | Across, down or diagonal per word. Default: vary them so the grid reads as a puzzle. |

The agent prepares the overlay. Nothing else is generated.

## Build

1. Read the cut times of the shots the words belong to (`timeline_get`).
2. Call `motion_graphic_prepare` with `composition_id: "word-search"`, the files
   [`word-search-trace/index.html`](word-search-trace/index.html) and
   [`word-search-trace/dreamcut.controls.json`](word-search-trace/dreamcut.controls.json),
   and `values`:
   - `word_1`…`word_4` and `direction_1`…`direction_4`. Leave unused words empty.
   - Timing: for even cuts use `first_trace` (cut + 0.2 s) and `trace_spacing`
     (shot length). For uneven cuts set `trace_times`, for example `"0.2, 1.9, 3.1"`.
   - `length`: the total length of the shots the overlay covers. The render runs for this long
     and extends on its own to fit the last outline, so the grid stays on screen to the end. With
     `trace_times`, set `length` past the last trace time plus Trace draw time.
   Use the CLI `pnpm hyperframes-overlay prepare` only to iterate on code. The proposal
   needs the editor's prepared preview, and only `motion_graphic_prepare` creates it.
3. Poll `motion_graphic_status` until `ready`. Propose it with `proposal_create`:
   `create_visual` (`video_clip`, `has_alpha: true`, source window 0 to `duration_seconds`)
   on its own visual lane. Add `set_lane_order` with the overlay lane **first**:
   `lane_order_keys` is top-first.
4. Check it with the card's **Replay** in the editor. The grid and outlines must draw
   over the footage, and each outline must start just after its cut.

## Controls on the proposal card

Words and directions; First trace starts, Time between traces, Trace start times,
Trace draw time, Overlay length; Letters per row, Letter size, Letter opacity,
Letter color; Trace color, Trace width, Hand-drawn wobble, Soft shadow; Letter
shuffle (seed). A changed value re-renders in the background before Apply.

## Reference timing (measured)

The reference is 30 fps. Each outline draws in about 0.6 s, starting close to its cut;
the grid is present from the first frame. The template defaults to 0.6 s draws,
0.2 s after each cut. The grid fades in over 0.15 s because the renderer check
needs visible motion.

## Limits

- The canvas is portrait 9:16 (1080×1920). A 16:9 version needs its own canvas size.
- After approval, the overlay is a baked clip. The inspector cannot retune composition
  controls yet; revise it through a new proposal.
- Up to four words. Words that cannot fit the grid in the chosen direction are skipped,
  so check the rendered frames.

## Evidence

Demo project `word-search-stock-demo` uses four Pexels shots (8680224, 35811255, 34736308,
9130084; Pexels License) with the words FOG, HILL, DUSK and TRAIL. Teaching media lives in
`public/recipe-previews/word-search/`, with hashes in its `manifest.json`. Public teaching
media must never show the creator's own people, pets or home.

Verified in the editor's GPU preview. A second set of inputs was also checked: three words,
13 columns, a yellow outline and uneven trace times.
