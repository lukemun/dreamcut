---
name: sound-design
description: Select, time, layer, and propose sound effects for a DreamCut edit so they follow exactly what is on screen. Use when entrances, transitions, drawing, camera moves, motion in footage, reactions, interface actions, impacts, or visual payoffs need sound, including requests for pops, whooshes, pencil or drawing sounds, cash sounds, meme stings, or a complete SFX pass.
---

# Sound design

Read `../dreamcut-proposals/SKILL.md` before timeline work and `../audio-balance/SKILL.md` before setting levels. When the request also includes music, use `../music-direction/SKILL.md` for the music actor and keep the SFX decisions independently reviewable.

## 1. Map beats before browsing sounds

Read the current timeline, captions or aligned transcript, referenced marks, and the visual elements entering or changing near each requested beat. Name the sound's editorial role before choosing a file:

- **entrance accent** for one meaningful actor or a coordinated group reveal;
- **movement support** for a visible slide, sweep, or transition;
- **payoff** for a reveal, impact, transaction, or punchline;
- **reaction** for an intentionally comic or meme-coded beat; or
- **interface feedback** for a literal on-screen action.

Do not add a sound merely because an element has an animation. Prefer one group-level accent when several objects form one scene state. Preserve quiet beats; a dense visual sequence does not require dense audio.

## 2. Get the picture's timing curve first (the default)

A sound that accompanies something visible follows that thing: it starts when it starts, swells while more is changing, and stops when it stops. Placing a library sound by eye at one cue time does not do this, and creators hear the mismatch. So before choosing or making any such sound, call `visual_activity_prepare` for the beat's window (at most 60 s; pass `element_ids` to follow one actor). It returns 0–1 activity curves on the timeline clock with their onsets, peaks and active intervals:

- `draw`, `camera`, `motion`, `entrances` and `cuts` come straight from shape and SVG-piece draw keyframes, camera keyframes, other keyframed props and entrance/exit presets: exact.
- For drawn shapes, `pen_speed` and `pen_turn` follow the pen tip along the stroke: how fast it moves and how sharply it turns, with `pen_down_seconds` for each new stroke. Use them for handwriting and anything traced by a pen.
- For a HyperFrames scene (a sketch, a 3D flight, a chart), pass `composition_activity` with a short `activity_js` that reads the scene's own data: when each line is drawn, each block traced, the camera pose per frame. It returns `composition_<name>` curves. Without it the render is measured as `frames`, which is close but not exact; use the scene data whenever the scene has it.
- For footage and other video, `frames` is measured motion (the share of pixels changing per frame), so a small moving subject still counts.

Match each sound to the curve of the thing it voices: a pencil to the drawing curve, an air rush to the camera curve, a whoosh to the motion of the object that moves. Where `total` is silent nothing changes on screen, so it gets no sound unless the creator asked for ambience there.

Then make the sound follow the curve in one of two ways:

- **Continuous activity** (drawing, a camera move, sustained motion): synthesize with `sound_synth_prepare`. Paste `synth_embed` from `visual_activity_prepare` into `synth_js` and drive loudness from `activityAt(name, t)`: loudness follows how much is changing, onsets land on starts, and pitch or brightness can follow progress. Render it as long as the window (a synthesized sound is at most 30 s; split longer windows), then place it at the window start with source in-point 0, so its clock matches the curve.
- **Handwriting and pen strokes** (continuous activity, synthesized the same way): loudness and brightness follow `pen_speed` (faster pen, louder and brighter grit), a short scratch in roughly the 2–7 kHz band rides `pen_turn` so every sharp turn sounds different, and the sound drops to silence between strokes and during pauses. A sound that only gets louder and quieter with speed misses the turns.
- **Discrete events** (an entrance pop, an impact, a cut): use library sounds, one per onset or peak the curve reports. Find candidates with `sfx_search` (words plus the role named in step 1), then call `sfx_audition_prepare` with `cue_seconds` set to that onset or peak. It reports what is on screen, entering or exiting, the words around the cue and the next speech start, places each candidate's loudest moment on the cue, levels it, and returns a ready `create_audio` operation plus a loudness-alignment image. Trim each sound's tail to the curve's active interval. You cannot hear the sounds: propose the two or three plausible ones as options of one card so the creator listens and picks.

Prefer `source_status: "licensed"`. Treat `reference_only`, unknown rights, or an unverified source as audition evidence, not production media. Carry the catalog title and source URL into the proposed clip so the timeline remains inspectable. Use catalog guidance as a filter, not as proof of fit: check `good_for`, `avoid_for`, motion, intensity, texture, duration, and loudness analysis. A recognizable meme sting is a tonal decision, not a neutral effect; defer it when its voice, duration, or cultural reference competes with narration unless the user clearly wants that tone.

## 3. Align the audible event, not the file boundary, and measure it

Use the catalog's `active_start_seconds`, `active_end_seconds`, and `peak_time_seconds` when present (`sfx_audition_prepare` applies this placement). Place the clip so the perceptual event lands on the curve's onset or peak:

`timeline_start = beat_time - (peak_time_seconds - source_start_seconds) / playback_rate`

Trim dead air and irrelevant tails with explicit source windows. Keep useful decay when it supports the beat. For whooshes, align the sweep or arrival point that matches the motion rather than assuming the peak is always the correct anchor.

Before proposing, verify alignment numerically: call `visual_activity_prepare` again for the same window with `check.sounds` (the placements you intend to propose; or `check.proposal_id` once drafted, `check.sound_element_ids` for sounds already on the timeline) and `check.curve` set to the curve the sound voices. It reports the correlation between the sound's loudness envelope and the curve, the best lag, each onset's offset in ms (sound minus picture), and the share of sound energy with no visual cause. The default pass is correlation at least 0.6, median onset offset at most 40 ms and at most 15% uncaused. For handwriting, check against `pen_speed`: the check then also reports `turns`, how much the sound changes at each sharp turn (1.25 times brighter or louder than the stroke around it passes). A short accent is judged mainly by its onset offset; correlation matters for sounds that last as long as the activity. When a check fails, fix the placement, the trim or the synth curve and check again; do not propose a sound you have measured as out of sync without saying so.

Put the numbers on the card, in the option summary or assumptions: for example "Pencil follows the drawing: r 0.97, onsets within 10 ms, 2% with no visual cause." The creator then knows the timing was measured, not guessed.

## 4. Protect dialogue and the mix

Measure before changing gain. Start conservatively beneath speech and audition in context, not solo. Compare integrated loudness and true peak when analysis exists, then use the Inspector or proposal tuning controls for final gain. Avoid stacking bright transients on consonants or key words. Use short fades only to remove clicks or shape a tail; do not blunt the intended attack.

Put non-overlapping effects on one `sound_effect_n` lane. When effects overlap in time, place them on adjacent SFX lanes; the proposal contract rejects same-lane audio overlap. Keep related SFX lanes co-located in lane order so the scene remains editable.

## 5. Route each actor through review

On a working timeline, every effect is a `proposal_create` `create_audio` operation with:

- full source duration and explicit absolute source in/out;
- timeline start derived from the chosen audible anchor;
- stable SFX lane identity and index;
- conservative gain, fades, and playback rate; and
- a rationale naming the visual or spoken beat it supports.

The proposal contract treats each independently adjustable audio clip as its own actor. Create separate proposals with `rebase_policy: "independent"` when several non-overlapping effects are prepared from one timeline revision. Use proposal options only for genuinely different treatments of the same actor, such as subtle versus meme-forward punctuation. Never approve the user's proposals.

## 6. Verify the pass

Preview every cue against picture and narration. Check:

1. the audible transient or motion aligns with the intended frame, with the measured correlation and onset offsets on the card;
2. speech remains immediately intelligible;
3. repeated effects are sparse enough to retain emphasis;
4. tails do not collide with the next line or cue;
5. overlapping effects occupy separate lanes; and
6. every production source has a usable rights record.

Report which cues were prepared, which tonal ideas were deliberately deferred, and what the user should listen for in review.

## Learned refinements

- Default short accent SFX to conservative levels, audition them against dialogue, and raise them only when the visual beat needs more emphasis.
- When replacing a sound effect, explicitly mute or remove every superseded placeholder in the same proposal, then audition the affected interval against picture and dialogue to verify that no unintended layer remains beneath the replacement.
