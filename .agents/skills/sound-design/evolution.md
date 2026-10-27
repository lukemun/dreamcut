# sound-design — evolution log

## Purpose
Select, time, layer, and propose sound effects mapped to editorial beats. Scope: SFX only — music is an independently reviewable actor handled through music-direction, and levels through audio-balance. Good looks like: every sound has a named editorial role (entrance accent, movement support, payoff, reaction, interface feedback) chosen before browsing files; the audible event, not the file boundary, lands on the beat; dialogue and the mix are protected; quiet beats are preserved rather than filled.

## Preserved prior evolution records

# sound-design evolution
2026-09-17: Approved Memory improvement `2ce786d2b0f58ab71300f0657029ca813685b0df49c686614019b499bca4eb52` from retro `manual-layout-retro-20260917103032262`. Default short accent SFX to conservative levels, audition them against dialogue, and raise them only when the visual beat needs more emphasis.

## 2026-09-19
- **Observation:** When replacing a sound effect, explicitly mute or remove every superseded placeholder in the same proposal, then audition the affected interval against picture and dialogue to verify that no unintended layer remains beneath the replacement. Evidence: a4ee2879-8b59-461d-ad58-7727be36a307, 2026-09-19T10-39-42-216Z-editor_agent_batch.json, 2026-09-19T10-40-52-860Z-editor_agent_workshop.json, 2026-09-19T10-48-12-701Z-editor_agent_batch.json, 2026-09-19T10-48-51-952Z-editor_agent_batch.json.
- **Decision:** Updated — Approved Memory improvement `b7d56d199b155c159bd2a83aed73dac30a35ae83fa87dacb7fb2982078fed37c` from retros `6af06584-6d6c-444c-9bb4-191bc52c3fc8`, `e1fa5648-65b0-4675-ac5e-88c87950fd51`. Reconciled candidates: 8d8123c1c06cc504673c9caab500bed622c0aa502d807faa5cbbd4fb4e5b43af, 1138401b22d46a4546716a33bac7c7fd78470c369dcef3e08c96cf2f833ff465.
- **Verification:** Human-approved instruction incorporated once; operational verification remains required when applying the skill to an edit.

## 2026-10-25 — Sound follows the picture by default
- **Observation:** On a code-generated sketch intro, library sounds placed by eye at one cue time did not line up with the drawing and the creator noticed. Sounds driven by the scene's own timing (drawing and camera activity curves) matched it: correlation 0.98, onsets within 10 ms. The creator called this very important and asked for it to be the routine.
- **Decision:** Updated — whenever a sound accompanies something visible, get its activity curve with `visual_activity_prepare` first; synthesize continuous activity with `sound_synth_prepare` from the curve, or place and trim library sounds on its onsets and peaks; verify with the tool's `check` and report correlation, onset offsets in ms and the uncaused share on the card. No sound where nothing changes on screen unless asked.
- **Verification:** Eval `sound-sync-v1` scripted baseline: curve-driven synthesis passes the sketch, camera and footage cases (r 0.97–0.99, 20 ms); single-cue placement fails all three. On the real project the tool scored the applied pencil at r 0.995, 10 ms. Instruction walkthrough only; no model run of the revised skill yet.

## 2026-10-25 — Handwriting follows the pen tip
- **Observation:** The creator's main case is handwriting: the pencil should match each stroke, change as the pen speeds up, and sound different where it turns.
- **Decision:** Updated — for drawn strokes use `pen_speed` (loudness and brightness) and `pen_turn` (a 2–7 kHz scratch on sharp turns), silent between strokes; verify with `check.curve: pen_speed`, whose `turns` report must pass.
- **Verification:** Eval `sound-sync-v1` handwriting case: the pen synth passes (r 0.95, 10 ms, 1.91x at turns); a loudness-only synth fails on turns (1.12x). Instruction walkthrough; no model run yet.
