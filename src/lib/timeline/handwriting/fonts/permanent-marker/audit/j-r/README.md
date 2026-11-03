# Permanent Marker J–R and 4–6 audit

Authored 2026-09-27. Scope: the uppercase guide keys `J K L M N O P Q R 4 5 6` only. The final glyph is still the unchanged font outline; these paths are reveal trajectories.

## Inspection and method

Read the actual Permanent Marker font at `/tmp/PermanentMarker.ttf` (1024 font units per em) and the repository's exact outline bounds. Rasterized at twice font-unit resolution with Pillow, cropped to each glyph's original ink bounds, and resized to 500×500 pixels to match the guide's independent X/Y normalization. Used round-cap/round-join polyline masks of width 38 normalized units. Coverage counts font ink above 50% opacity inside the completed mask; this isolates missed solid ink from antialiased edge fringes. `coverage.json` records the measurements and the prior guide coverage. Each letter has an audit PNG showing the original glyph with ordered paths, a half-written state, and completed coverage (red would show uncovered ink). `mask-contact-sheet.png` was visually inspected across all 12 characters.

This is a geometric raster check, not a full browser timing proof. Stroke lifting delays are omitted in the half-written still. The renderer's original unmask-at-completion behavior was not modified. Root should verify actual SVG progress before claiming browser playback quality.

## Per-letter decisions

| Glyph | Stroke order and anatomy |
|---|---|
| J | Sweep the broad top bar left to right, lift, descend the slanted stem and sweep the lower hook left. |
| K | Draw the slanted stem downward; lift to the upper right and draw inward to the stem; lift at the junction and curve outward into the lower leg. |
| L | One descent down the slanted stem, round the low bend, and run right along the foot. |
| M | One continuous marker gesture from lower left to the first peak, through the rounded middle valley, up to the right peak, then down the right stem. |
| N | Follow this font's curved N anatomy: lower left up the first slanted stem, down its inner edge, around the bottom turn, and up the right stem. |
| O | One tilted loop through the upper point, left diagonal, rounded lower bowl, and right diagonal back to the upper point. |
| P | Draw the short lower stem downward, lift, then draw the broad top bowl clockwise and return along its lower edge to the stem. The stem path is offset left to cover the font's flared mid-stem. |
| Q | One tilted loop following the O-like body; lift and draw the inner-to-outer diagonal tail downward. The outer right edge was checked separately and corrected. |
| R | Draw the short lower stem downward, lift and loop the upper bowl clockwise, lift and swing the lower leg down and right. |
| 4 | Draw the bent left arm down and right across the crossbar; lift and descend the slanted right stem, including its lower turn. |
| 5 | Start at the top-right bar, draw left around the broad shoulder, descend and turn into the lower bowl, then sweep left along the foot. |
| 6 | Start at the upper right, descend along the left diagonal, turn through the lower bowl, then rise and close the broad lower loop. |

## Coverage and case handling

All 12 uppercase/digit guides cover **100.000%** of the measured solid font ink with width **38**, with zero uncovered solid pixels. Prior guides ranged from 32.591% (J) to 99.356% (N), so no increased brush width is needed in this range. This metric is saved before the renderer's completion shortcut could hide a failure.

Lowercase j–r are the font's reduced copies of the same letter anatomy. Their normalized raster differences from uppercase are 0.410%–0.856%, caused by outline scaling/rounding and rasterization. All nine lowercase glyphs also measure 100.000% solid-ink coverage with the same guide and width. No lowercase keys were added. No per-glyph brush-width override is recommended for this range.

Because the font has a broad marker nib, nearby stroke junctions can be revealed slightly before a later stroke reaches them; Q's inner tail is the clearest example. This is a mask overlap limitation, not a missing-ink gap. The source contours and their counters remain exact throughout the reveal.
