# Reusable visual catalog

This catalog stores reusable stills and videos independently of any editing project, such as
licensed chroma-key overlays and motion-graphics passes.

- `catalog.json` is the metadata source of truth: stable id, media type, hashes, dimensions/duration,
  provenance, derivative recipes, rights status, semantic tags, use cases, and cautions.
- `media/` contains the corresponding local files, grouped by rights status. It is ignored by Git by
  default so personal or licensed media does not leak into the repository.
- `TIMELINE_VISUAL_CATALOG_DIR` may point the editor at a catalog stored elsewhere.

Projects do not own or duplicate these assets. A timeline element references the catalog asset id and
global media URL while retaining project-specific timing, placement, and other edit settings. Reusable
cutouts should point to an alpha-bearing derivative while preserving the untouched source and a reproducible
derivation receipt in the catalog.

## Personal media stays out of this catalog

This catalog is published with the repository and holds only generic, redistributable
defaults. The creator's own material (anything depicting or naming them, their people,
pets, clients or brands, media from their projects, and assets cleared only for them)
belongs in the profile library at `<profile>/library/visuals/` (`catalog.json` with the same
schema, files under `files/`). The editor merges it into every project's Library as Your
media. Move entries with `pnpm personal-library-move --kind visuals --ids <ids> --apply`;
`pnpm check:catalog-privacy` fails a commit that puts personal entries here.
