# Prepare reusable handwriting packs

Inventory the entire `SHARED_FONT_LIBRARY` Handwriting category, including entries
below intervening categories. Compare it with `PREPARED_HANDWRITING_FONTS` and the
Permanent Marker reference. Semantic IDs can differ from family names and slugs.
The inventory test should fail when a new handwritten font lacks an explicit route.

Work one font at a time. Preserve the licensed source bytes/provenance/hash and
license in `src/lib/timeline/handwriting/fonts/<slug>/`. Pin variable fonts to an
explicit weight. Keep actual contour paths, advances, spaces, overhangs and pair
kerning. Record unsupported shaping: the current candidates use base glyphs at
400, with contextual alternates/ligatures disabled. Do not claim full shaped-text
parity or other-weight support from base-glyph comparisons.

Author `authored-guides.json` from letter anatomy and intended pen behavior.
Outline contour point order describes a filled boundary, never writing order.
Start B with a descending stem, lift back to the top, then bowls. Save lifts between
gestures explicitly. Dot/stem order for i is an authored choice: these candidates
use the creator's requested dot-first order, then a lift and descending stem.
Do not apply that choice to uppercase I, which has no dot.

Reusable preparation tools (they never mutate timelines):

```sh
python scripts/prepare-handwriting-font.py SOURCE.ttf PACK --font-id ID --family FAMILY --source-url URL --license-file LICENSE
python scripts/fit-handwriting-guides.py PACK --guides PACK/authored-guides.json
python scripts/prepare-handwriting-sweeps.py PACK --resolution 128 --bands 64
python scripts/prepare-handwriting-lines.py PACK
pnpm exec tsx scripts/audit-handwriting-pack.tsx ID --out PACK/line-audit
```

Use a dedicated Python environment with fonttools, uharfbuzz, Pillow, numpy, scipy,
scikit-image. Pass `--license-id Apache-2.0` for Yellowtail; do not assume every
font's license matches the OFL default. For a larger completion comparison, audit
supports `--characters 'O&' --size 480` with a separate output directory.
Browser audit uses repository dependencies and Remotion's browser;
`HANDWRITING_CHROME_PATH` can name an available compatible Chromium executable.
Missing dependencies/browser are preparation blockers, not permission to claim
review. The fitting helper refines **already ordered** semantic guides onto medial
ink. Its graph paths may retrace or create fragments; fitting success is not natural
motion approval. Edit guides per font when the intermediate evidence disagrees.

Measure physical distances in font units. Independently normalizing x/y distorts
nib width and trajectory lengths. Current default uses cubic authored paths,
continuous SVG stroke-dashoffset, round nibs and spatial gesture clips. Retain the
original contour clip through completion; never unmask the last frame. Smooth
spatial boundaries and overlap them slightly to avoid alpha seams. Crossings can
still have notches or detached fragments; source completion is not motion approval.
Never use raster temporal ownership bands in the turning-line route.

Source raster preparation must use base glyphs matching extracted contours.
Pillow's BASIC layout disables contextual alternates that RAQM can choose even
for one character (Pacifico q/s exposed this mismatch). Compare the actual production
SVG against its source contour. For B, fit only the already ordered descending stem
onto ink and prioritize a thickness-scaled stem corridor before bowl ownership.
Inspect the junction: this can leave a small stub. Do not apply unrestricted medial
graph fitting globally; it can backtrack or turn a smooth authored guide jagged.
`line-authored-guides.json` stores targeted font corrections without replacing the
previous saved method. Permanent Marker uses `--source-pack PACK/line-source`
to retain its historical normalized pack; its actual lowercase i has no separate dot.
Preserve that contour instead of inventing one.

The production audit saves every gesture midpoint, fixed partial stages, near-end,
completion, and source. Ensure mask IDs are unique across a contact sheet. Save
missing and extra ink from the same-page source/final alpha comparison. Thin curves
may require `--size 480` comparisons; never assume antialiasing without evidence.
`--steps N` saves denser samples. `--saved-strokes` audits the old method separately.
Hash the current line paths, licensed source, contours, metrics and review images.

Maintain `line-checklist.json`, `line-review.json` and `LINE-MASK.md` per font.
Distinguish source verification, inspected fixed stages, saved gesture midpoints,
continuous playback and scoped human acceptance. Saved frames are not automatically
inspected. Record priority uncertain glyphs and broad-nib diagnostics separately.

On 2026-09-28 the creator selected the Pacifico A experiment and asked to make
that method the default for every font. All 13 fonts now have 85-character line
packs; captions without an explicit mode select `line_mask`. The earlier saved
reveal remains available explicitly and its source/assets remain archived.
Pacifico A's accepted path segments and timing are preserved exactly. Acceptance
covers the shown A comparison and method choice, not all-glyph motion quality.
Use `handwriting-line-mask-font-review` for a short all-font comparison and
`handwriting-<slug>-review` for full alphabet playback. Every font still has
characters requiring motion review. Keep the explicit checklist honest.

Create dedicated review projects through `assembly_create`, read applicable style,
record feedback, and place native captions through granted MCP tools. Include
alphabet sheets and each isolated uppercase, lowercase, digit and punctuation,
with drawing, hold and erasing intervals. Read `frame-state` before judging project
appearance. Inspect actual playback as well as stills; preserve separate projects
and leave existing working cuts untouched. Close feedback accounting and open the
review projects paused for Play. Use the existing Handwriting + Drawing/Erasing
controls; status belongs near the effect, with details in contextual help.

Meaningful checks: complete registry inventory, source/license hashes, exact-case
guides, stem/dot order and lifts, preserved advances/kerning through wrapping,
production measurement parity, persistent contour masks, and current audit
receipt hashes. Partial/fallback glyphs must remain visible as partial status.
