# Local image catalog

The image catalog is the timeline editor's reusable still-image library.

- `sources.json` is the authored L0 acquisition and rights manifest.
- `catalog.json` is generated L1 data consumed by the Asset Shelf and Timeline Editor Agent context.
- `images/` contains production-cleared stills grouped by rights status.

From the repository root, run `pnpm image-analyze` after adding or changing an image (`--personal` analyzes the profile library's `sources.json`). The analyzer records hashes, dimensions, palettes, global color statistics, and neutral 3×3 layout measurements. It does not add semantic tags, use cases, or placement recommendations.

Add only images whose rights allow the intended use, preserve acquisition and attribution in `sources.json`,
and review the repository's [third-party notices](../THIRD_PARTY_NOTICES.md) before redistributing catalog media.

## Personal media stays out of this catalog

This catalog is published with the repository and holds only generic, redistributable
defaults. The creator's own material (anything depicting or naming them, their people,
pets, clients or brands, media from their projects, and assets cleared only for them)
belongs in the profile library at `<profile>/library/images/` (`catalog.json` with the same
schema, files under `files/`). The editor merges it into every project's Library as Your
media. Move entries with `pnpm personal-library-move --kind images --ids <ids> --apply`;
`pnpm check:catalog-privacy` fails a commit that puts personal entries here.
