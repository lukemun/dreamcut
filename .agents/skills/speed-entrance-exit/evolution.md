# speed-entrance-exit — evolution log

## Purpose

Let a creator ask for the Speed Entrance & Exit template, or for "the speed effect"
between marked stops, and get the effect the reference tutorial teaches: a cut-out
keyframed between two places over a few frames with blur, over a still empty set.
Success means each move reads as the subject shooting to its next place (not walking
fast), the landing frame matches the live footage, and the creator can tune the
holds without AI. Cut-out preparation and proposal mechanics stay with
[object cutouts](../video-compositing/references/object-cutouts.md) and
[dreamcut-proposals](../dreamcut-proposals/SKILL.md).

## 2026-10-27 — Split out of video-compositing after two wrong builds

- **Observation:** Asked to apply the speed effect to a walk toward camera with six
  storyboard marks, an agent first built the template's one-page recipe (every
  stop's cut-out streaking in from the left and out to the right). The creator called
  it completely wrong. The agent then played the walk between marks at 4× with short
  live holds; the creator said it only looked like walking fast. On review, the
  tutorial's actual rule (cut at takeoff, keep about 6 frames, two position
  keyframes, ease, motion blur) was in the private reference brief and missing from
  the template. The template also had no variant for marked stops.
- **Decision:** Gave the effect its own skill with both variants, the measured
  reference timing, the transform arithmetic for DreamCut's offset and scale units, a
  continuous-source plan so landings match, and hold dials. The video-compositing
  template entry now points here.
- **Verification:** Reference timing measured at full frame rate from the tutorial's
  finished opening. The Mark-to-mark build was drafted on the creator's footage as a
  proposal following these steps; see the entry below for what was checked.

## 2026-10-27 — First Mark-to-mark build on real footage

- **Observation:** Following the steps produced a card that stages and previews. Three
  lessons from the creator's review and frame checks: `zoom_blur` blurs everything behind
  the clip, so the set smeared and the subject vanished at the swap; 4-frame halves with
  blur up to 420 read as too fast and too blurred; the first entrance came from the wrong
  side for this creator. The hold dials work. Hop length, blur strength and entry side
  have no card dial, so the creator could not tune them.
- **Decision:** Removed `zoom_blur` from the procedure. The default hop half is now 6
  frames, and blur starts at about a third of the formula. The missing dials are
  recorded as a gap.
- **Verification:** Card staged with four hold dials. Preview played with Proposals open
  and showed the landings at Marks 2, 3 and 6. Paused seeks onto cut-out frames showed
  only the empty set in the dev build, so individual swap frames are not yet confirmed.

## 2026-10-27 — Hop length, blur and entry side become card dials

- **Observation:** The creator wanted to tune hop speed, blur and the first entry side on
  the card and could not.
- **Decision:** Timing controls gained `keyframe_span_seconds` (rescales a clip's keys)
  and `source_start_seconds` (slides a following clip's source in), so one hold
  can be **Hop length**. New clips accept a static `directional_blur_x`, so a linked
  **Horizontal blur** dial scales every hop. A clip whose sideways move starts off frame
  gets a **Comes in from** choice. All three are general dials, not speed-only code.
- **Verification:** Unit tests in `src/lib/agent/proposal-motion-dials.test.ts`. The card
  generated from step 7 was swept locally at the shortest and longest hop, every dial at
  its maximum, blur and side, with no overlaps.

## 2026-10-27 — Hops cut on the creator's own steps

- **Observation:** The creator said each hop should begin as they naturally start their
  next step, and each hold should end right before it. Cards planned from mark times
  ("about 1 s from the mark") cut mid-stand. A session retro pointed to
  `visual_activity_prepare` for measuring onsets.
- **Decision:** Added a step that finds each stop's settle and takeoff frames before
  planning. Holds now end on the takeoff and reach back from it. The first stop opens
  live. Long cut-out windows split in two when they fail preview parity.
- **Verification:** Takeoffs were measured from the subject's frame-by-frame position
  against the empty set (20.0, 25.9 and 36.0 s). In the card's preview, the last live
  frame at one stop shows the subject leaning into the step, and the next frame is the
  streak out. `visual_activity_prepare` was not tried on this take.

## 2026-10-27 — Blur sized to keep the body; streaks follow the path

- **Observation:** The creator vanished at every hop's peak frame. Setting one hop's blur
  to 0 brought them back, so the cut-out was fine and the blur was too large: the peak
  was 0.3 × the subject's height (about 100 px of Gaussian spread on a body about
  100 px wide). The creator also asked to streak from where they stand toward where they
  land, not always sideways.
- **Decision:** The blur peak is now about 0.08 × height (8–45 px), split into horizontal
  and vertical parts along each hop's direction. Each hop moves the cut-out on the line
  from one mark to the next and swaps poses halfway. Blur dials are per hop, headed
  "Mark N to Mark N+1". The empty-gap dial was dropped.
- **Verification:** In the card's preview, the subject stays visible on the swap frames of
  all four hops. The nearest hops show a clear smeared body; the farthest (smallest) hop
  is a faint smear at its peak. The Source in dials on the four streak-out clips (in
  Advanced adjustments) fail at their slider end, because the keyframes outlast a
  shortened clip.

## 2026-10-27 — The effect becomes a `hop_sequence` block

- **Observation:** The retro of this effect's session found 23–31 KB of hand-built operations per
  card, 13 of 22 `proposal_create` calls refused for overlaps, lane order, frame rounding and
  binding rules, an adapter per missing dial, and dials the creator asked for that no field could
  hold (blur relative to the subject, speed at the stops).
- **Decision:** The owner approved proposal building blocks
  ([design](../../../docs/architecture/proposal-building-blocks.md)); phase 1 ships `hop_sequence`
  (with `live_hold` and `keyframed_move`). The skill now routes the card through the block and keeps
  the hand-written steps as the explanation and fallback. The block's blur default is 8% of the
  subject's height, following the earlier correction above, not the 33% the design table carried.
- **Verification:** `src/lib/agent/proposal-blocks.test.ts`; a block-built card reviewed on the dev
  build with a disposable copy of the marked-stops project.

## 2026-10-27 — Land stopped, leave mid-step, walk in at the start, bend around obstacles

- **Observation:** The creator wanted to walk into frame to the first stop live, to land
  standing still at each stop, and to be seen walking toward the next stop before the
  streak begins. They also asked for the hop out of one stop to go around a pole instead
  of through it.
- **Decision:** Live holds now run from standing still to about 6 frames after the
  takeoff, and the streak out starts mid-step from a cut-out that covers that walk. The
  opening plays the walk-in live. A hop can bow through a control point (a quadratic
  path, keyed at its quarter points) to pass an obstacle on the side the creator names.
- **Verification:** In the card's preview, the opening shows the walk-in. Each stop shows
  the subject standing, then walking, then the streak. The Mark 2 hop swings left past
  the pole and lands at Mark 3 standing. The Mark 3 hold dial's minimum went up to
  0.33 s so the arrival stays inside its cut-out.

## 2026-10-27 — Exit after the line, sounds reused, packaged as an effect

- **Observation:** The creator finished the build: talking by 2 s (holds of 3 frames, takeoff
  streaks of 2 frames, first streak's blur cut from 61 to 16 so they stayed visible), then
  asked to "speed run me out" after the line and cut the rest. They were close to the camera,
  cropped at the right and bottom, so a sideways slide would have shown the crop edge. The
  tutorial's own sounds, split into single units, ended up in the sound Library as the
  `tutorial-speed-sfx-` set. They then asked
  to package the whole effect with its sounds, without captions or colour grading.
- **Decision:** Added the exit-after-the-line move (lunge past the camera: scale and offset
  grow together, opacity fades) and told the sound step to reuse that set
  before extracting again. Packaged through the new effect-authoring skill as its own card,
  "Speed hops to camera", in the creator's Templates: mark-to-mark hops, the line, the exit and
  the sounds, without captions or grade, with their finished version and raw take. A first
  attempt rewrote the shared Speed Entrance & Exit card instead; the creator said the two are
  different effects (the shared one is a single entrance and exit), so it was put back.
- **Verification:** The exit card was applied by the creator on their footage; its frames
  were not inspected by the agent. Fresh-footage reuse of the packaged effect is untested.

## 2026-10-28 — "Speed hops to camera" is now "Speed hops"

- **Observation:** The creator asked for the effect, its sounds, its workflow and this skill to call it simply "speed hops".
- **Decision:** The template's title, prompt and docs say "Speed hops"; the skill names it as the Mark to mark variant's template and calls the tutorial sound set "the Speed hops sounds". The recipe id `FX-SPEED-HOPS-TO-CAMERA` and the `speed-hops-to-camera` preview paths stay, so saved links and anchors keep working. The sounds' own titles live in the members sound catalog and were not renamed.

## 2026-10-28 — Speed hops in one card, with sound and plain dials

- **Observation:** Applying Speed hops on the creator's take, the card arrived without its whooshes (sound was a later card) and with dials the creator could not read: "Variant… mark to mark, out and in… Travel, 100%. Empty beat. I don't understand these." The card had also defaulted to Out and in until the agent passed the variant by hand. They want a template to build and work in one click.
- **Decision:** The `hop_sequence` block takes `template: "speed_hops"`, which fixes Mark to mark and leaves the style, distance, empty-scene and direction dials off the card (blocks can now hide a setting a template fixes), and `sounds`, which compiles a landing whoosh per hop locked to its streak in with a Sound volume dial (0 = off). Labels are plain: Hop length, Pause at stop, See-through while flying, Slow motion at stops, Speed-up and slow-down; "Every hop" is "All hops". Mark-to-mark defaults are 6-frame halves and 30% see-through (was 3 and 60%), so small far subjects stay visible. The template's prompt asks for that one card.
- **Not done:** Measuring settle and takeoff frames and subject boxes is still the agent's work from `visual_activity_prepare`; no preparation tool does it yet.
- **Verification:** Block tests cover hidden dials, each whoosh peaking on its landing frame, Sound volume 0 (silent, same clips) and the tightest pause and hop (whooshes trimmed so they never overlap). On a disposable copy of the creator's take the card staged with no dial errors, showing Sound volume, then Pause at stop, Hop length and Blur per hop, with three dials under Advanced adjustments. Rendered frames show the subject visible mid-hop and landing on each spot. Not checked by ear yet.

## 2026-10-28 — Settle and takeoff come from visual_activity_prepare holds

- **Observation:** Settle and takeoff seconds were the agent's judgement; the card on the creator's take copied them from an earlier build, and one (the swings settle at 18.6 s) was mid-stride. The owner asked for measurement by reusing an existing tool rather than adding one.
- **Decision:** `visual_activity_prepare` takes `holds: {at_seconds}` and returns each moment's settle, takeoff, at_rest and contrast from the footage motion around it (local, log-scale threshold so far and near stops read alike). Step 2 uses it and says when to read frames.
- **Verification:** On the take's four marks (1.9 s for all four), frames confirm the path-bend stop (24.0–25.4 s reported 23.99–25.39) and the swings settle (19.2 s); the swings takeoff reads about 0.3 s late with a swing moving behind (contrast 0.67); the camera stop, where the creator gestures through the line, reports not at rest (contrast 0.53).

## 2026-10-28 — The ending and Speed Entrance & Exit in one card

- **Observation:** The Speed hops card promised "streak me out of frame when I finish", but the block ended on the line, so no card built the exit. Speed Entrance & Exit named only the skill, and its bobblehead demo is two still poses, which the block could not take. The owner: Speed Entrance & Exit "should be able to accept both" (footage and poses).
- **Decision:** `hop_sequence` gains `closing_exit` (side or past the camera, always fully out of frame, the line's last frames after a line, with `sounds.exit`), `template: "entrance_exit"` (fixes out-and-in, hides Style and Empty scene) and pose stops (`pose` with a standing pose, an optional walking pose and its `place`); one stop is enough with an entrance or exit. Both cards now name this route.
- **Verification:** Block tests (the exit takes the line's last frames and leaves the frame, its whoosh peaks a frame after takeoff; a pose card compiles to stills with the template's dials hidden; both sweep clean). On a disposable copy of the bobblehead demo the one-click card staged with no dial errors, passes the effect eval, and frames show the walking pose streaking in, the standing pose, and the walking pose streaking out. Rendering those frames exposed a frame-state bug (25 fps projects drawn at 30 fps), fixed. The footage case is packaged but not staged (its cut-out never finished preparing in the demo). Not heard.

## 2026-10-28 — The exit is the card's choice, not the template's

- **Observation:** The owner: a template "shouldn't be an exact thing… their instance could be a bit different. It may not have an exit, or it may have an exit. On the card, yes, we should have an exit."
- **Decision:** The Leaves dial gains Stays (the exit clip holds the subject still and sharp; its whoosh goes to 0), so a card can always offer the exit and the creator turns it off without the card losing clips. The skill and both cards say to fit the card to the creator's take and to start with an exit whenever one can be built.
- **Verification:** proposal-blocks.test.ts: Stays keeps the same clips, no movement or blur, exit whoosh at volume 0.
