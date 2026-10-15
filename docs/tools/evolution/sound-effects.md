# Sound-effect search and audition — evolution

Capability: `sound-effects`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Let any agent, including the in-editor agent with no file access, find library sound effects
and prepare an audition for one timeline moment. Agents cannot listen, so the tools supply
what can be measured (picture and speech context, peak timing, loudness, an envelope image)
and the creator chooses by ear among proposal options. Read-only; no timeline writes.

## 2026-10-11 — initial implementation

- **Observation:** The sound-design skill told agents to read `sfx-library/catalog.json`, which
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
