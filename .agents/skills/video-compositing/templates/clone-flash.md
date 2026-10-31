# Clone Flash

Template `FX-CLONE-FLASH` (Properties → Templates). On a locked-off shot, cut-out copies
of the person from later in the same take appear beside them one at a time. Each copy
arrives as a white silhouette and settles into colour. Recreated from a breakdown reel
by @willrvail of a video by @nvision.media (instagram.com/reel/Deb-VcJRpxp); no
reference pixels are reused.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Locked-off shot of a person | Yes | Camera still, room beside the person, a few extra seconds of the same take to supply the copies. A plain background hides cutout edges best. |
| Number and side of copies | Optional | Default two, on the open side of the frame. |

The agent prepares one moving cutout covering the later moments the copies use.

## Build

1. Read the shot on the working timeline: its start `T`, end `E` and source in-point.
2. `cutout_prepare` a window of the same source from later in the take (after the part
   on screen) with points on head, body and feet; poll `cutout_status` and check frames
   at the start, middle and end for missing head or feet. Cutout seconds start at the
   window start.
3. Propose one `create_visual` video clip of the cutout per copy, each on its own lane
   above the shot, ending at `E`:
   - `has_alpha: true`, `subject_flash: 1` and
     `transition_keyframes.subject_flash: [{t:0,v:1,ease:"hold"},{t:0.1,v:1,ease:"linear"},{t:0.2,v:0}]`;
   - `media_offset_x` (half-canvas units) to place the copy beside the person;
   - staggered starts (demo: `T + 1.0 s` and `T + 2.4 s`).
   Add `set_lane_order` with the copy lanes above the shot.
4. Include a camera shutter on every clone arrival in the same proposal option.
   Use `sfx_search` to resolve **Camera 02 Shutter Click** from the shared Library,
   then `sfx_audition_prepare` at each arrival for its measured peak and source window.
   This is the template's sound, not a pop/tap audition or a later sound pass.
   Follow the sound-design skill for level and alignment checks. Start at volume 0.5
   (−6 dB), with 0 available to mute. Keep the catalog title and source URL.
   Each `create_audio` uses `follows_visual.element_id` for its clone and
   `offset_seconds = -(peak_time_seconds - source_start_seconds) / playback_rate`.
   At the timeline start, trim unavailable pre-roll without moving the audible peak.
   Put overlapping shutter tails on separate SFX lanes and include their lane order.
   If the named Library sound is unavailable, report that missing dependency rather
   than substituting a pop or silently omitting it. Do not bake audio into the cutout.
5. Replay the combined card. Check each arrival (white), 0.2 s later (colour) and
   the settled frame; verify each shutter's measured peak lands on the flash frame.
   Move a clone in a disposable trial and confirm its linked shutter follows.
   Report numerical timing evidence separately from listening review.

## Controls on the proposal card

Horizontal position, Source in and shutter Volume (including mute) for each copy. White flash timing and copy start
times stay in the proposal and timeline.

## Timing (recreation)

Each copy is white for 0.1 s, fades to colour by 0.2 s and stays to the end of the shot.
The recreation spaced copies 2 s apart; the teaching demo uses 1.0 s and 2.4 s so both arrive within 6 s.

## Limits

- This is an agent-built template, not a dedicated compiled block. The agent assembles
  the pictures and linked shutters in one card; fresh-input execution still needs review.
- The visual teaching demo is silent. Its silence does not opt an applied effect out
  of its shutter sounds. The named shutter is supplied by the members' sound Library,
  not redistributed in the repository's demo media.
- The camera must stay still; a moving camera makes the copies slide against the scene.
- Only the person is cut out: a seated subject's seat is not copied (set B), so copies of
  seated people float.
- Copies use the same lighting as the original; a strong shadow or reflection is not copied.

## Evidence

Demo project `tpl-clone-flash-bobblehead-demo` (16:9, 24 fps), card `20261027T162404-3fc08d0c`:
the bobblehead's run (source 0–5 s) with two copies from 1.4 s and 2.8 s of the same take at
`media_offset_x` −0.62 and +0.62. A subject that runs in place gives copies of different
moments without new footage; end each copy before a wide move (the cartwheel) so it never
swings into the original. Teaching media in `public/recipe-previews/clone-flash/`.

Earlier demo project `tpl-clone-flash-demo` (16:9, 30 fps):
- Set A, man in orange fog (Pexels 8680224, source 14–24 s). A first cutout can miss the
  head and boots; re-prompt with points on head, coat, legs and boots.
- Set B, man seated on rocks (Pexels 5977487), copies either side.
