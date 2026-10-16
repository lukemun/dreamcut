# Local sound-effect library

`catalog.json` is the reusable source pool for sound effects. The actual files live under
`audio/<rights-status>/` and are intentionally gitignored, following the music catalog's pattern.

Unlike music, SFX do not go through beat, tempo, section, or cue-map analysis. Their L1 pass records
container facts, loudness/peak measurements, audible bounds, and spectral/energy shape. Authored metadata
records the editorial role because a waveform cannot decide whether a sound should sell a text entrance,
an exit, or a reveal. The timeline editor exposes production-cleared catalog entries in every project's
SFX shelf, where they can be previewed and placed directly at the playhead.

Run `pnpm sfx-analyze <file ...>` from the repository root to produce the reproducible L1 fields used
by `catalog.json`. Do not loudness-normalize or trim the masters during ingest: transient contrast and
pre-roll are part of an effect's timing. The measured LUFS, true peak, active bounds, and peak position
give the editor enough information to set gain and align the audible event deliberately.

For compilation sources with a reviewed clip manifest, run
`node scripts/recut-sfx-compilation.mjs <manifest.json>`. It keeps the source reel unchanged, rebuilds
each derived WAV from its absolute source window, and refreshes duration, hash, and L1 analysis metadata.
Determine those windows from persistent frame-level label states in the source video—not rounded seconds
or subtitle timing—and record the audit method in the manifest.

Every entry must retain acquisition and license provenance. Folder names declare render rights:

- `audio/owned/` — created or recorded in-house;
- `audio/licensed/` — cleared for production use;
- `audio/reference/` — study/timing only; never ship.

## Personal media stays out of this catalog

This catalog is published with the repository and holds only generic, redistributable
defaults. The creator's own material (anything depicting or naming them, their people,
pets, clients or brands, media from their projects, and assets cleared only for them)
belongs in the profile library at `<profile>/library/sfx/` (`catalog.json` with the same
schema, files under `files/`). The editor merges it into every project's Library as Your
media. Move entries with `pnpm personal-library-move --kind sfx --ids <ids> --apply`;
`pnpm check:catalog-privacy` fails a commit that puts personal entries here.
