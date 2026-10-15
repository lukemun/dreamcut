# Third-party notices

DreamCut is licensed under the Apache License 2.0, but it depends on
third-party software and includes a small catalog of attributed media. Those materials retain their own
licenses and are not relicensed by the DreamCut license.

## Remotion

Preview and rendering use Remotion packages installed from npm. Remotion is not distributed under MIT and its
license can require a paid company license. It also restricts copying or modifying Remotion code to sell a
derivative of Remotion. Review the current terms before using or distributing DreamCut:

- https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
- https://www.remotion.dev/license

DreamCut does not vendor Remotion's runtime source, `node_modules`, or the contents of
`remotion-dev/skills`; each user installs dependencies locally. Remotion's maintained agent guidance can be
installed directly from its publisher with `npx skills add remotion-dev/skills`. The upstream skills repository
does not currently declare a repository license, so its files are not redistributed here.

## HyperFrames

DreamCut uses HyperFrames as a development dependency. The installed package declares the Apache
License 2.0. HyperFrames retains its own copyright and license terms:

- https://github.com/remotion-dev/hyperframes
- https://www.apache.org/licenses/LICENSE-2.0

## Other dependencies

The lockfile records the exact dependency graph. Each package retains the license declared by its publisher.
Notable transitive licenses include Apache-2.0, BSD, ISC, LGPL-3.0-or-later, MPL-2.0, and CC-BY-4.0.

## Bundled media

Bundled image, music, and sound-effect catalogs retain the source and attribution information stored beside
their files. Do not remove those records when redistributing the catalog assets.

- The `image-catalog` includes Unsplash images governed by the Unsplash License. Creator, source, acquisition,
  and license records are in `image-catalog/sources.json`.
- “Clair de lune,” performed by Laurens Goedhart, is distributed under CC BY 3.0. Credit: Claude Debussy,
  performed by Laurens Goedhart. Source and license details are preserved in `music-catalog/catalog.json`.
- The bundled Satie recording is CC0 1.0, and the Bizet and Offenbach recordings are public-domain/CC0
  sources. Their source records are in `music-catalog/catalog.json`.

## Bundled font data

`src/lib/fonts/files/` bundles the latin subsets of DM Sans (Copyright 2014 The DM Sans Project Authors)
and Libre Caslon Display (Copyright 2012 The Libre Caslon Display Authors) for the editor interface, as
distributed by Google Fonts. Both are licensed under the SIL Open Font License 1.1; the license texts are
`OFL-DM-Sans.txt` and `OFL-Libre-Caslon-Display.txt` in the same folder.

`public/fonts/helvetiker_bold.typeface.json` contains Helvetiker Bold font data. Copyright © 2004 MAGENTA Ltd.
Its embedded license permits reproduction and distribution when the copyright and permission notice remain
with the font data, and imposes naming conditions on modified fonts. The complete notice is preserved in the
file's `original_font_information.license_description` field.
