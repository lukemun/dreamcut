# Local music catalog

`catalog.json` is the editor's local source of truth for music direction. It may
describe tracks before any audio has been added. A small production-cleared set
is deliberately tracked with provenance in `catalog.json`; additional local
audio under `audio/` is ignored by Git by default.

Each track captures:

- editorial fit: moods, energy, tempo, texture, vocals, good/poor scenarios;
- one or more versions, including Instagram/TikTok mappings and source status;
- version-specific cue windows with exact start/end times and use/avoid notes.
- source-addressed provenance for imported recordings: provider URL, rights status,
  attribution obligation, acquisition date, SHA-256, and an immutable import receipt;
- descriptive analysis such as an energy curve and unreliable/alternate tempo values,
  kept separate from authoritative `tempo_bpm`.

See `catalog.example.json` for a fully annotated, non-functional example. Do not
put ripped platform audio here. Add only owned, licensed, or explicitly approved
reference files, and keep `source_status` accurate.

Set `TIMELINE_MUSIC_CATALOG_DIR` to use a catalog outside this folder.

Every local catalog version owns a managed copy under `audio/<rights-status>/`.
Downloads, project folders, and another repository checkout are acquisition or recovery
sources, never durable catalog storage. Audit or recover an older catalog with:

```bash
pnpm music-catalog-storage --source /path/to/older/music-catalog
pnpm music-catalog-storage --source /path/to/older/music-catalog \
  --apply --receipt <stable-recovery-id>
```

The command copies only files named by the current catalog, never overwrites an existing
destination, verifies every copied byte, and fails while any local reference is unresolved.
New bundle imports also fail closed if the existing catalog contains a missing local file.

## Importing an assembled annotated library

Use the `music-catalog-ingestion` skill. Materialize the reviewed bundle locally with
one full recording per annotation under `tracks/` and its JSON records under
`annotations/`, then run:

```bash
pnpm music-import-bundle <bundle> --import-id <stable-id> \
  --source-folder-url <source-url> --acquired-at YYYY-MM-DD \
  --source-status licensed --dry-run
```

Remove `--dry-run` after reviewing the reconciliation. The importer adopts only the
full recordings. Pre-rendered snippets remain source evidence and become editable cue
windows, avoiding duplicate audio authorities. It validates media duration, cue bounds,
hash/ID collisions, provenance, and the complete resulting catalog.

## Preprocessing an audio file into cues

```bash
pnpm music-analyze                 # every audio file in audio/ that has no sidecar yet
pnpm music-analyze <file> --force  # one file, re-analyzed
```

Each file gets a `<name>.analysis.json` sidecar (gitignored) holding duration, tempo
with half/double candidates, the beat and estimated downbeat grids, section boundaries,
a 1s energy curve, a vocal-density heuristic, and `cue_candidates` already shaped like
`musicCueSchema` so they can be pasted into a track version's `cues`.

Everything in a sidecar is a **proposal**, and the file says so:

- tempo ships `confirmed: false` — half/double-time errors are expected and change the edit;
- downbeats assume constant 4/4 from the first tracked beat, so they are wrong on pickups
  and meter changes;
- the vocal estimate is a spectral heuristic, not a detector, and reports `confidence: low`;
- a file with no trackable beat is marked `status: unusable` and proposes no cues rather
  than inventing them.

Confirm the metrical level and listen before promoting any cue into `catalog.json`.

The analyzer needs a Python with librosa. It defaults to `../.venv-music`; override with
`MUSIC_PYTHON`.

```bash
python3 -m venv .venv-music && ./.venv-music/bin/pip install librosa soundfile
```

## Personal media stays out of this catalog

This catalog is published with the repository and holds only generic, redistributable
defaults. The creator's own material (anything depicting or naming them, their people,
pets, clients or brands, media from their projects, and assets cleared only for them)
belongs in the profile library at `<profile>/library/music/` (`catalog.json` with the same
schema, files under `files/`). The editor merges it into every project's Library as Your
media. Move entries with `pnpm personal-library-move --kind music --ids <ids> --apply`;
`pnpm check:catalog-privacy` fails a commit that puts personal entries here.
