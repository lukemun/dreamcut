# Sound follows the picture — v1

Suite `sound-sync-v1` checks whether proposed sound effects follow what is on screen:
loudness rising and falling with how much is changing, onsets landing on visual starts,
and no sound where nothing happens. It backs the default in the
[sound-design skill](../../.agents/skills/sound-design/SKILL.md): get the timing curve
with `visual_activity_prepare`, make the sound follow it, then verify it numerically.
All inputs are synthetic and generated on setup; no creator media is involved.

| Case | Creator request | What is on screen (timeline clock) |
| --- | --- | --- |
| `handwriting` | "Add a handwriting pencil sound that matches the strokes: faster when the pen speeds up, a different scratch where it turns, quiet when it lifts." | One handwritten path on paper traced contour by contour: a zigzag with three sharp corners (0.68, 0.87, 1.01 s), a round loop, then the two strokes of a "t". The pen accelerates from 0.2 s, pauses 1.2–1.5 s, then slows to a stop at 2.6 s |
| `drawn-sketch` | "Add a pencil sound while the sketch draws itself." | Six path strokes draw on (`shape_draw`, linear and eased) from 0.3 to 1.3 s and 2.2 to 3.5 s, with a still pause between |
| `camera-fast-section` | "Give the camera move some air, with a whoosh on the fast push." | A camera drifts slowly, pushes fast from 1.4 to 1.8 s, then settles until 3.6 s |
| `footage-motion-beats` | "Add sound effects to the moves in this clip." | A 4.5 s footage clip placed at 0.5 s in which a square moves in three beats (1.1, 2.3, 3.5 s); still otherwise |

## Scoring

Ground truth is computed from each fixture's own definition (stroke times and easing,
camera keyframe segments, the square's path), not by `visual_activity_prepare`, so the
tool is not grading itself. The scorer measures the sounds of a proposal's recommended
option (decoded from their sources and mixed as placed) or a rendered audio file that
starts at the case window, and compares its 20 ms-smoothed loudness envelope with the truth
at 100 values per second using the shared metrics in
[sound-alignment.ts](../../src/lib/sound-synth/sound-alignment.ts):

- **correlation** of envelope and activity at zero lag, at least 0.6;
- **median onset error**, at most 40 ms; a visual onset with no sound onset within
  250 ms counts as 250 ms;
- **uncaused share** of the sound's energy while nothing moves (allowing 50 ms before
  and 300 ms of tail after activity), at most 15%;
- at least one sound;
- **handwriting only, turn response:** within 30 ms of each sharp corner the sound must be
  at least 1.25 times brighter (energy above 4 kHz) or louder than the stroke around it
  (±200 ms, away from other corners), median across corners. A sound under half as loud at
  the corner as around it scores 0 there. A sound that only follows the pen's speed misses this.

For handwriting the activity is the pen tip's speed along the stroke in pixels per second,
computed from the stroke geometry and its `shape_draw` keyframes, the way the renderer
draws contours in order.

These are regression thresholds, not quality targets. Passing them does not show that
a sound is tasteful, well mixed or the right timbre; that stays with the creator's ears.

## Run it

```bash
pnpm eval:sound-sync list
pnpm eval:sound-sync setup drawn-sketch eval-sound-sync-sketch-1
pnpm eval:sound-sync packet drawn-sketch eval-sound-sync-sketch-1
pnpm eval:sound-sync grade drawn-sketch eval-sound-sync-sketch-1 <proposal-id | proposal.json> [rendered.wav]
pnpm eval:sound-sync baseline
pnpm eval:sound-sync:check
```

`setup` creates a disposable project (refusing an existing id) for a model trial: give the
model the packet's request, let it propose through the editor, then grade its proposal.
`baseline` builds every fixture in a temporary projects folder, runs three scripted
policies and writes a receipt to `private/eval-sound-sync/`. Definitions live in
[sound-sync-eval.ts](../../src/lib/agent/sound-sync-eval.ts).

## Baseline — 2026-10-25 (handwriting added the same day)

Scripted policies, no model. `single-cue-library` is the earlier habit (one library sound
placed by its peak at a single cue, here generously the truth's loudest moment);
`curve-library-hits` places one library sound per active span the curve reports, trimmed
to the span; `curve-synth` synthesizes filtered noise whose loudness follows the curve;
`pen-synth` (handwriting) also gets brighter as the pen speeds up and adds a 2–7 kHz
scratch on `pen_turn`, so each sharp turn sounds different.

| Case | Policy | Pass | Correlation | Median onset (ms) | Uncaused | Turn response |
| --- | --- | --- | --- | --- | --- | --- |
| handwriting | single-cue-library | no | -0.04 | 50 | 9% | 0 |
| handwriting | curve-library-hits | no | 0.29 | 50 | 6% | 0 |
| handwriting | curve-synth | no | 0.99 | 20 | 0% | 1.12x |
| handwriting | pen-synth | yes | 0.95 | 10 | 0% | 1.91x |
| drawn-sketch | single-cue-library | no | 0.17 | 60 | 28% | – |
| drawn-sketch | curve-library-hits | no | 0.34 | 60 | 27% | – |
| drawn-sketch | curve-synth | yes | 0.99 | 20 | 0% | – |
| camera-fast-section | single-cue-library | no | 0.55 | 100 | 0% | – |
| camera-fast-section | curve-library-hits | no | 0.70 | 70 | 0% | – |
| camera-fast-section | curve-synth | yes | 0.99 | 20 | 0% | – |
| footage-motion-beats | single-cue-library | no | 0.48 | 250 | 8% | – |
| footage-motion-beats | curve-library-hits | no | 0.62 | 50 | 0% | – |
| footage-motion-beats | curve-synth | yes | 0.97 | 20 | 0% | – |

The library policies used the shared catalog's top match for each query; a checkout
whose catalog differs gives different library numbers. The curve-synth numbers depend
only on the fixtures and the tool.

Readiness: **fixtures, scorer and scripted baseline ready; no model trial yet.** The next
step is a model run per case (`setup`, the request through the editor's agent, `grade`),
reported with its receipt. The suite is small on purpose: grow it from real sound-design
episodes before tuning anything to it.
