# Permanent Marker A–I / a–i / 0–3 pen audit

Authored against actual font ink, not Hershey centerlines. The production guide file was merged only for these 22 keys. `guides.json` is the reviewed subset; `widths.json` is the matching recommended mask-width subset. Exact character lookup is necessary for lowercase i.

## Visual review

Every glyph was read in its normalized ink grid and at 10%, 25%, 50%, 75%, 99.9%, and 100% cumulative pen distance. Five `final-review-page-*.png` sheets group all characters. Per-letter images and notes preserve individual evidence. B has deliberate pen lifts between its descending stem, clockwise upper bowl, and clockwise lower bowl. I has separately authored cap/shaft/foot strokes. Width34 for 2 removes a premature lower-rail fleck visible with width38.

## Completion evidence

`coverage.json` reports alpha-weighted coverage at width38, at the recommended width, and at99/99.9% pen distance. With the saved recommended widths, every character covers100.0% of measured glyph ink at full mask and99.9% pen distance at800×800 normalized resolution. The production clock includes a pen-lift delay after each stroke; this audit excludes those delays and therefore measures completion conservatively.

## Scope and limitations

The lowercase a–h drawn forms are near-identical to uppercase counterparts and use matching but separately inspected guide keys; i has a different outline. Stroke order is a reconstruction from static font artwork. Masks reveal actual font outlines, and overlap at glyph junctions can expose adjoining ink early. Narrow i and1 need broad normalized masks; their initial head grows quickly. A physical-unit/elliptical brush would refine these two. Pixel proof here uses Pillow/FreeType and binary circular cap masks, not the production browser antialiaser. Raster coverage does not establish exact vector coverage or a full live animation review. Font hash, outline hash, method, and limitations are in `manifest.json`.
