---
name: sound-design
description: Select, time, layer, and propose sound effects for a DreamCut edit. Use when entrances, transitions, reactions, interface actions, impacts, or visual payoffs need sonic emphasis, including requests for pops, whooshes, cash sounds, meme stings, or a complete SFX pass.
---

# Sound design

Read `../open-edit-proposals/SKILL.md` before timeline work and `../audio-balance/SKILL.md` before setting levels. When the request also includes music, use `../music-direction/SKILL.md` for the music actor and keep the SFX decisions independently reviewable.

## 1. Map beats before browsing sounds

Read the current timeline, captions or aligned transcript, referenced marks, and the visual elements entering or changing near each requested beat. Name the sound's editorial role before choosing a file:

- **entrance accent** for one meaningful actor or a coordinated group reveal;
- **movement support** for a visible slide, sweep, or transition;
- **payoff** for a reveal, impact, transaction, or punchline;
- **reaction** for an intentionally comic or meme-coded beat; or
- **interface feedback** for a literal on-screen action.

Do not add a sound merely because an element has an animation. Prefer one group-level accent when several objects form one scene state. Preserve quiet beats; a dense visual sequence does not require dense audio.

## 2. Select from the catalog with provenance

Find candidates with `sfx_search` (words plus the role named in step 1); its `source_url` is the catalog media route. For a specific moment use `sfx_audition_prepare` with the cue time and role: it reports what is on screen, entering or exiting, the words around the cue and the next speech start, places each candidate's loudest moment on the cue, levels it, and returns a ready `create_audio` operation plus a loudness-alignment image. Render the picture at the cue with the `run_instrument` call it returns, then `timeline_evidence`. You cannot hear the sounds: propose the two or three plausible ones as options of one card so the creator listens and picks.

Prefer `source_status: "licensed"`. Treat `reference_only`, unknown rights, or an unverified source as audition evidence, not production media. Carry the catalog title and source URL into the proposed clip so the timeline remains inspectable.

Use catalog guidance as a filter, not as proof of fit. Check `good_for`, `avoid_for`, motion, intensity, texture, duration, and loudness analysis. A recognizable meme sting is a tonal decision, not a neutral effect; defer it when its voice, duration, or cultural reference competes with narration unless the user clearly wants that tone.

## 3. Align the audible event, not the file boundary

Use the catalog's `active_start_seconds`, `active_end_seconds`, and `peak_time_seconds` when present (`sfx_audition_prepare` applies this placement). Place the clip so the perceptual event lands on the edit beat:

`timeline_start = beat_time - (peak_time_seconds - source_start_seconds) / playback_rate`

Trim dead air and irrelevant tails with explicit source windows. Keep useful decay when it supports the beat. For whooshes, align the sweep or arrival point that matches the motion rather than assuming the peak is always the correct anchor.

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

1. the audible transient or motion aligns with the intended frame;
2. speech remains immediately intelligible;
3. repeated effects are sparse enough to retain emphasis;
4. tails do not collide with the next line or cue;
5. overlapping effects occupy separate lanes; and
6. every production source has a usable rights record.

Report which cues were prepared, which tonal ideas were deliberately deferred, and what the user should listen for in review.

## Learned refinements

- Default short accent SFX to conservative levels, audition them against dialogue, and raise them only when the visual beat needs more emphasis.
- When replacing a sound effect, explicitly mute or remove every superseded placeholder in the same proposal, then audition the affected interval against picture and dialogue to verify that no unintended layer remains beneath the replacement.
