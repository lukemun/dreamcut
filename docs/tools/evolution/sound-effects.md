# Sound-effect search and audition — evolution

Capability: `sound-effects`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Let any agent, including the in-editor agent with no file access, find library sound effects
and prepare an audition for one timeline moment. Agents cannot listen, so the tools supply
what can be measured (picture and speech context, peak timing, loudness, an envelope image)
and the creator chooses by ear among proposal options. Read-only; no timeline writes.

## 2026-10-11 — initial implementation

- **Observation:** The sound-design skill told agents to read `catalogs/sfx/catalog.json`, which
  the in-editor agent cannot do, so it could not choose library sounds; the agent-parity check
  recorded this gap. The creator asked for auditions that understand what is in the video at
  that time.
- **Change:** `sfx_search` ranks the catalog by query words (with editor synonyms), role,
  editorial motion and intensity, duration and measured audibility. `sfx_audition_prepare`
  returns cue context (picture entering, exiting or on screen; words from caption word
  timings, or caption spans when none exist; next speech start; audio already playing), up to
  four candidates placed peak-on-cue and leveled toward -18 LUFS (6 dB lower over speech) with
  ready `create_audio` operations on free `sound_effect_N` lanes, a PNG envelope-alignment image
  as MCP image content, and the `run_instrument` frame-state call for the picture at the cue.
  Reference-only library sounds are included and labeled, per the creator's rights decision.
- **Verification:** Unit tests for ranking, context, placement and lanes. On real projects the
  audition ran in about one second, identified a title entering at the cue, reported words
  around a cue on a talking-head project and pulled candidates under speech; the image was
  inspected. Not yet exercised by the in-editor agent end to end.
- **Limits:** Ranking is metadata-only; 150 of 274 entries lack editorial motion tags. The image
  shows loudness, not timbre. Whoosh "arrival" points may differ from measured peaks.

## 2026-10-12 — shared catalog and personal library

- **Observation:** The tracked SFX catalog mixed redistributable library sounds with sounds
  whose clearance is the creator's alone (supplied reels, recordings, reference copies), and
  synthesized project sounds were written into it with project provenance.
- **Change:** The tracked catalog keeps redistributable sounds. The creator's sounds live in
  the profile's personal library (`<profile>/library/sfx/`), which `readSfxCatalog()` merges.
  `sfx_search` hits from it carry `personal: true`; "Add to Library" for a synthesized sound
  now writes there. `pnpm check:catalog-privacy` keeps personal entries out of tracked catalogs.
- **Verification:** Unit tests for the merge and the synthesized-sound intake; `sfx_search`
  run against the editor returned personal hits marked `personal: true`.
- **Limits:** A fresh checkout without a profile library has only the shared sounds, and
  their audio files are not tracked; they must be acquired from the recorded sources.

## 2026-10-25 — sound follows the picture (`visual_activity_prepare`)

- **Observation:** On a project with a code-generated ink sketch of a city, library sounds
  placed by eye at single cue times did not line up with the drawing, and the creator noticed.
  Sounds synthesized from the scene's own timing data (when each line is drawn, the camera
  pose per frame) followed it: a pencil whose loudness tracked the shoreline being drawn
  correlated 0.98 with that activity and started and stopped within 10 ms. The creator asked
  for this to be the routine for every sound that accompanies something visible.
- **Existing owners and gap:** `sfx_audition_prepare` places a sound's peak on one cue;
  `sound_synth_prepare` renders code but has no picture timing to follow. Nothing measured when
  things happen on screen over time, or checked a sound against it.
- **Change:** `visual_activity_prepare` (read-only) returns 0–1 activity curves on the timeline
  clock for a window: `draw`, `camera`, `motion` from keyframes (scale-free speed of each animated
  field), `entrances` from presets, `cuts` from hard appearances, `frames` measured from decoded
  video (share of pixels changing per frame at 160 px, alpha premultiplied, so small subjects
  count), and `composition_<name>` from an agent-written `activity_js` run over a HyperFrames
  scene's data scripts in an isolated VM (trusted local requests only). Each curve reports onsets,
  peaks and active spans; `synth_embed` is ready to paste into `synth_js`. With `check` it scores
  timeline sounds, a proposal's sounds or not-yet-proposed renders: envelope correlation, best
  lag, onset offsets in ms and the uncaused energy share, with pass/fail against r ≥ 0.6,
  median onset ≤ 40 ms, uncaused ≤ 15%. The sound-design and visual-timing skills make this the
  default; eval `sound-sync-v1` ([contract](../../evals/sound-sync.md)) checks it.
- **Verification:** Unit tests for keyframe, preset, cut and onset math, timeline mapping through
  trims and speed, alignment metrics and the composition VM. On the real sketch project the tool
  read the scene data (shore, streets, blocks) in 1.5 s and scored the applied pencil sound against
  the shoreline curve at r 0.995, onset offset 10 ms, 0% uncaused; the keyframe path read 20 drawn
  pieces, entrances and cuts from the same timeline. On the eval fixtures the frame measurement
  found the footage beats within 20 ms; the scripted baseline separates curve-driven synthesis
  (passes all three cases, r 0.97–0.99) from single-cue library placement (fails all three).
  Feature case `sound-follows-picture`: Codex 3 of 3 runs reached and called the tool from the
  creator's wording (receipt in `private/eval-features/`); the Claude run could not start because
  the hosted Claude session was signed out.
- **Limits:** Frame motion counts all change: on the sketch's render, the camera flight that
  follows is about 250 times larger than the line drawing, so `frames` there is dominated by the
  camera; scene data is required for exact drawing timing. Composition onsets assume constant
  speed. Correlation is a weak measure for a single short accent; onset offset matters there.
  No model has run the eval yet, and nobody has listened as part of these checks.

## 2026-10-25 — handwriting: pen speed, turns and lifts

- **Observation:** The creator's main case is handwriting drawn on paper: the pencil sound should
  follow each stroke, change as the pen speeds up, and sound different where the pen turns. The
  `draw` curve gives drawing progress only; it cannot tell a sharp corner from a straight run.
- **Change:** `visual_activity_prepare` adds `pen_speed` (the pen tip's speed along the stroke in
  pixels per second on a 1080-high canvas, tracing contours in order as the renderer does) and
  `pen_turn` (how fast the stroke's heading changes), plus `pen_down_seconds` for each new stroke.
  Pen curves stay out of `total`. `check` reports `turns`: how much brighter (above 4 kHz) or
  louder the sound is within 30 ms of each sharp turn than the stroke around it (1.25x passes;
  near-silence at a turn scores 0). The envelope decode rate rose from 16 to 32 kHz so bright
  content up to 16 kHz is measured. Eval `sound-sync-v1` gains a `handwriting` case with the
  turn criterion.
- **Verification:** Unit tests for pen speed, a single corner spike, pen-down on a new contour and
  the turn metric. On the handwriting fixture the tool's turn peaks land on the truth corners
  (0.70/0.88/1.03 s vs 0.68/0.87/1.01 s). Baseline: a synth that follows pen speed and scratches
  on turns passes (r 0.95, 10 ms, 1.91x); a loudness-only synth fails on turns (1.12x); library
  placements fail. The real project's pencil check is unchanged at r 0.995, 10 ms.
- **Limits:** Pen speed follows the renderer, which does not slow at corners as a real hand does;
  the turn metric asks for a change in timbre or level, not for any particular sound. Nobody has
  listened yet.

## 2026-10-26 — sound units from a reference (`sound_units_extract`)

- **Observation:** The creator wanted the speed-effect tutorial's own sounds. Library and
  synthesized whooshes did not match; time-window cuts of the Demucs stems still held two
  overlapping sounds. The owner asked for a reusable tool that isolates a single effect by its
  spectrum and rebuilds it as a tunable unit, for audio in general (freeze exception, recorded in
  project status).
- **Change:** New tool `sound_units_extract` (worker `scripts/sound-units.py`, owner
  `src/lib/local-store/sound-units.ts`). It reuses the instrument analysis stems (htdemucs, cached
  per source bytes; the first call starts separation and returns `preparing`). In each chosen stem
  it detects attacks with an A-weighted, per-band spectral flux, or snaps named `events` to them,
  then runs KL-NMF where each event owns attack, body and tail templates whose activations are
  zero before its onset. A penalty growing with time since onset hands newly arriving energy to the
  newest event; a template may not occupy bins that were clearly fading when its event began, so
  a later sound cannot take over an earlier one's decaying tail. Unnamed attacks keep templates so
  they cannot leak into named units. Each unit is the Wiener-masked event, trimmed where its own
  modelled energy first stays 35 dB down for 100 ms. Per unit it reports character, features, a
  12-band profile, leakage and confidence, writes the equal-span time cut for comparison, and fits a
  sines-plus-noise model (one free ridge partial for sweeps and pitch drops, up to three stable
  partials, twelve noise bands). `src/lib/sound-synth/unit-resynth.ts` turns the model into a
  generic synth program with ten controls (length, attack, pitch, brightness, low end, tone and
  noise level, pan, width, volume), rendered through the existing sound-synth path, and the worker
  scores the rebuild against the unit. Units import as managed project media under
  `sound-units/<key>/`; job output is a cache in `analysis/sound-units/<key>/` with a receipt that
  records source hash, stems, request, imports, rebuilds and the clearance note.
- **Verification:** Synthetic overlap (70 Hz thump at 1.00 s, 2–6 kHz whoosh at 1.15 s over its
  tail): the whoosh's equal-span cut is 22% thump; its unit keeps 0.7% and none of the thump's
  sub-bass. On a disposable copy of the tutorial project (window 1.5–5.4 s, the 11 named sounds),
  compared with the creator's existing time cuts on the same decomposition: 10 of 11 units carry
  less foreign energy, median 10.5 dB less (takeoff whoosh 67% → 7%, arrival whoosh 1 67% → 6%,
  arrival whoosh 2 45% → 4%, click 27% → 2%). The bass "deep boom" did not improve (40% → 37%,
  confidence 0.32): the bass before it is the same sub-bass band, so there is no spectrum to tell
  them apart. Rebuilds of all 11 match their units within 0.8–4.0 dB mean spectrum error, envelope
  correlation 0.90–0.99 (whooshes 1.3–2.9 dB, thumps 0.8–1.3 dB). Unit tests cover every control's
  direction, band level calibration, reproducibility and request validation. A repeated call reuses
  the cache (50 ms); a full call with 11 rebuilds takes about 19 s after separation. Feature case
  `sound-units-from-reference`: Codex 3 of 3 runs reached and called the tool from the creator's
  wording (receipt in `private/eval-features/`).
- **Limits:** Nobody has listened yet; leakage numbers come from the tool's own decomposition, so a
  sound the model assigns to the wrong event is not caught by them (an earlier template rule moved
  the takeoff cut from 67% to 7% foreign by crediting the noise bed differently). Spectrograms were
  inspected for each unit: where a steady bed fades as a whoosh starts, the whoosh's unit loses that
  band and shows mask flicker there (takeoff and arrival whoosh 2). Same-band overlaps in one stem
  stay mixed and are reported as low confidence. Character labels are heuristic. Saving units to
  the profile library is not built. Claude and local-model feature evals have not run.
- **Creator listening (2026-10-27):** On a back-to-back comparison of all 11 tutorial sounds
  (old cut, isolated, rebuilt), the creator chose the isolated units for their personal library and
  judged the rebuilds "not good enough yet; they are flatter". The fit numbers above (spectrum error
  and envelope correlation) did not catch this. Likely causes, untested: twelve noise bands at
  about 0.7 octave smooth away fine spectral detail, the 64-point envelope rounds off transients,
  and noise replaces the reference's phase structure. Rebuilds stay available for tuning, but the
  isolated units are the ones to place.

## 2026-10-28 — visual_activity_prepare reports holds around given moments

- **Observation:** Speed hops needed each stop's settle and takeoff seconds; agents judged them by eye or copied them from an earlier build. The owner asked to reuse an existing tool rather than add one.
- **Decision:** `visual_activity_prepare` gains `holds: {at_seconds, curve?}`. For each moment it returns settle_seconds, takeoff_seconds, at_rest and contrast, read from the chosen curve (default `frames`) against the motion in the 3 s around it, with a geometric-midpoint threshold so a far subject reads like a near one; flickers under 0.1 s do not end a hold, and a hold longer than the context is followed along the whole curve. Helper: `holdsAround` in src/lib/sound-synth/visual-activity.ts. It is generic: marks, beats, freeze frames.
- **Verification:** `visual-activity.test.ts` (near and far stops, a flicker, a 7 s hold, a moment off any stop). On a real take's four marks it matched the frames at two stops, read one takeoff about 0.3 s late with background motion (flagged by contrast 0.67) and reported a talking stop as not at rest.
