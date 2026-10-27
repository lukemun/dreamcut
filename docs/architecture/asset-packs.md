# Asset packs from DreamCut Cloud — plan (after ship)

Status: planned 2026-10-24 for after the first release. Nothing here is built. The feature
freeze applies until then.

## Why

A fresh install has empty sound, music and visual shelves. The repository tracks only each
catalog's `catalog.json`; the media files are git-ignored, and the editor hides any entry whose
file is missing (`sfx-tools.ts` filters on `sfxCatalogFileExists`). Measured on the development
machine on 2026-10-24:

| Catalog | Entries | Local files | In the repository |
| --- | --- | --- | --- |
| Sound effects | 50, all CC0 | 488 files, 118 MB | the catalog only |
| Music | 73 licensed | 2,762 files, 2.8 GB | the catalog only |
| Visuals | 1 | 106 files, 171 MB | the catalog only |
| Images | 5 | 24 MB | the catalog and 5 stills |

Music cannot ride in an install at that size, and members-only assets need an account check
that only DreamCut Cloud can make. So media moves to DreamCut Cloud and the editor fetches it.

## Shape

- **Manifest.** DreamCut Cloud serves a versioned list of packs. Each pack has an id, title,
  kind (sound effects, music, visuals, images), tier (`free` or `member`), size, and per file
  the catalog entry, SHA-256, byte size and rights (provider, licence, attribution).
- **Starter pack.** A free pack of the 50 sound effects and 10–15 music tracks, small enough to
  download in seconds. The editor offers it on first run and from the Library; it never blocks
  editing while it downloads.
- **Member packs.** Listed for everyone, downloadable when `/api/v1/me` reports a membership.
  Download links are short-lived and signed per account.
- **Local copies.** Downloaded files go into the profile, beside the personal library, and are
  read through the existing catalog loaders, so placement, preview and export do not change.
  Files are verified against the manifest hash before they appear.
- **Projects keep working.** A placed asset is copied into the project as source media
  (`media_import` with `managed_copy`), so a project opens, previews and exports offline and
  after a pack changes or a membership ends. Ending a membership stops new member downloads
  only.
- **Storage.** Downloads follow the [storage lifecycle contract](../standards/storage-lifecycle.md):
  declared owner, bounded temporary bytes, a destination headroom check, and resumable
  downloads.
- **Tracked catalogs.** `catalogs/` stays the source for building packs. The repository keeps
  only what the editor needs to work with no packs.

## Skills later

Skills could ship the same way, with tighter rules because they steer the agent: each skill
pack is versioned and signed by DreamCut, the editor shows what a pack adds before installing
it, and a pack never replaces a bundled skill without the creator's say-so.

## Sound effects without a pack

`sound_synth_prepare` already renders abstract sounds (whooshes, hits, ticks, risers) from
synth code any model can write, and proposes them with `create_audio`. Realistic generated
sound effects are a separate addition: a sound-effect kind for `generate_media`, run on
DreamCut Cloud and paid in credits like music.

## Phases

| Phase | Scope | Acceptance |
| --- | --- | --- |
| 1 | Manifest API and starter pack on DreamCut Cloud; first-run offer and Library download in the editor | A clean install downloads the starter pack, and its sounds and tracks can be placed, previewed and exported |
| 2 | Member packs behind the membership check | A member downloads a member pack; a non-member sees it listed and locked; a lapsed member's projects still export |
| 3 | Realistic sound-effect generation through `generate_media` | A drafted sound effect shows its price, generates on approval and lands as a proposal |
| 4 | Skill packs | A signed skill pack installs, shows what it adds and can be removed |

The membership offer already lists "Premium sound effects, music and visuals (coming soon)".
Remove "coming soon" when phase 2 ships.
