# Flash effect

Template `FX-FLASH-EFFECT` (Properties → Templates). On one locked-off
take the subject's poses replace each other every few frames, each landing as a white
silhouette with a glow for one frame, with a camera shutter click on every flash, over the empty
set; then the take plays live for the creator's line. Nothing moves between poses: no streaks,
no blur, and earlier poses do not stay on screen. Reference: the opening of "The Flash Effect"
by futurist__ (instagram.com/reel/DUn3xkSiATH), one-frame pulses every 3 frames at 24 fps.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| One locked-off take | Yes | Empty frames first, then the subject walking toward the camera through several places. |
| Marks | Optional | Where a pose should flash. Without marks, pick 6–8 poses spread evenly along the walk, ending close to the camera. |
| A line to camera | Optional | When the creator speaks at the end, the take goes live from the last pose to the end of the line. |

## Build (one card)

1. Read the take's clock and the marks (`storyboard_get` or the creator's frame tags).
2. For each pose, `cutout_prepare` a 0.5 s window starting 0.1 s before the pose
   (SAM 2 points on head and torso), then `cutout_status` for its receipt. Every pose length
   up to 8 frames must fit inside the window.
3. Choose each pose's footage time (`at_seconds`): the mark, or a frame inside its window where
   the subject is clear of the frame edge. A pose on the frame edge or moving sideways reads
   as a sideways jump, not a flash toward the camera: leave it out (creator, 2026-10-29).
4. The empty set is the start of the same take before the subject enters (a video window;
   the block slows it to cover the poses).
5. Find the shutter in the Library: `sfx_search "camera shutter click"` (Camera 02 Shutter Click,
   a members sound fetched from DreamCut Cloud) and take its `peak_time_seconds` (0.075 s).
6. Send one `proposal_create` card with one `flash_sequence` block: `poses` in order (each label
   names a place the creator can see), `empty_set`, `source`, `line_end_seconds` when there is a
   line (the end of its last word from `speech_prepare`), `sound` with the click, `lanes`, and
   `lane_order_keys` when the lanes are new. Pass `remove_element_ids` for the raw walk it replaces.
   Leave out titles, captions, colour grading and music.

The card's dials: Time per pose (frames, default 4 = the reference's 0.133 s), White flash,
Glow, Click volume; Flash length under Advanced. Clicks follow their poses, so the timing dial
carries them.

## Check

- `pnpm frame-state <project> --proposal-file <card> --at` each flash frame, the frame after it
  and the first live frame: the flash is on the subject only, the pose shows in colour on the
  next frame, and the live take joins with no jump.
- Each click's loudest moment lands on its flash frame (render-preview audio, or the compiled
  `follows_visual` offsets). Say the clicks have not been heard.
- A cut-out the frame edge crops shows its cropped edge on the white frame; drop or move that pose.

## Evidence

Built in project `clone-glitch-tutorial` (2026-10-28/29) by hand-written cards, then compiled by
`flash_sequence` on disposable copy `flash-effect-check-20261029`: seven poses (swings, path bend,
past the bend, toward the grass, the grass, near the camera, the camera), 4 frames apart, then the
line. Frames checked at each flash, the frame after and the live join; clicks measured in the
render-preview audio within 10 ms of each flash. Not heard by ear. Teaching media in
`public/recipe-previews/flash-effect/` (silent: the click is a members sound). One-click eval:
`EFFECT_EVALS["FX-FLASH-EFFECT"]`, reference and known-bad cards in `effect-eval.test.ts`, private case
`flash-effect-one-click-v1` (no model trial yet).
