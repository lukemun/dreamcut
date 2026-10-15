# Permanent Marker S–Z, digits 7–9 and punctuation audit

Authored against the actual PermanentMarker.ttf ink, not a generic Latin stroke font. The real outline remains the final appearance authority. No renderer or timeline changes were made by this worker.

## Writing anatomy and order

- S: one right-to-left upper curve, middle bend and lower sweep.
- T: top bar followed by downstroke.
- U, V, W: continuous paths through their native rounded lower joins. W travels down/up/down/up.
- X: descending diagonal, lift, rising diagonal.
- Y: short left arm, lift, right arm down through the stem.
- Z: top bar, descending diagonal and bottom bar in one continuous stroke.
- 7: top and descending stroke followed by the separate crossbar present in this font.
- 8: continuous upper curl, lower loop and upper-right return, with genuine counters preserved by outline clipping.
- 9: oval followed by its downward stem.
- Punctuation follows the actual nib shapes: period is a short tap; commas and quote marks descend; paired marks keep separate strokes; parentheses sweep top to bottom.

## Evidence and measurement

`anatomy.png` shows the native glyph ink normalized to 0–100 bounds. `authored-guides-sheet.png` overlays ordered pen paths. `reveal-timesheet.png` and the four split partial sheets show 25%, 50%, 75%, 99% and full stroke clocks, including the existing 4-unit lift/settle delay. These were visually inspected for writing order and unintended isolated pieces.

`coverage.json` measures weighted ink coverage on 500×500 normalized actual-font rasterizations. Round-cap mask coverage uses point-to-polyline distance, matching the SVG reveal mask geometry. Min widths are calculated from all pixels over alpha 127, then rounded up with a 1-unit guard; lower-alpha antialias fringe is reported as fractional coverage. With recommended widths, every glyph is at least 99.9991% covered at 99% and full time. That residual is below 0.001% antialias fringe. No visible final-frame completion is needed.

Upper/lower S–Z have the same anatomy but slightly different scale/rounding in the font outlines. Explicit lowercase keys were saved and separately raster-audited.

## Required renderer integration

The current width-38 mask is insufficient for broad punctuation. It covers only 44.9% of the earlier period downstroke shape and 49.1% of the earlier dash centerline; final short-tap period coverage at width 38 is lower. Renderer integration must read the supplied glyph-specific widths; saved paths alone do not fix the old width-38 pop. `widths-recommended.json` is the complete machine-readable handoff.

A broad nib is appropriate for filled punctuation: the normalized period needs width 108, dash 91, comma 73 and apostrophe 76. These are normalized mask units, not screen pixels. The filled period tap appears quickly by design. Other punctuation keeps stem/dot or paired-mark lifts. Partial sheets show no unwanted separate punctuation fragments before their intended stroke.

## Widths

- 'S': 38 (width 38 full-mask coverage 100.0%)
- 'T': 38 (width 38 full-mask coverage 100.0%)
- 'U': 39 (width 38 full-mask coverage 100.0%)
- 'V': 38 (width 38 full-mask coverage 100.0%)
- 'W': 38 (width 38 full-mask coverage 100.0%)
- 'X': 38 (width 38 full-mask coverage 100.0%)
- 'Y': 41 (width 38 full-mask coverage 99.874%)
- 'Z': 38 (width 38 full-mask coverage 100.0%)
- 's': 38 (width 38 full-mask coverage 100.0%)
- 't': 38 (width 38 full-mask coverage 100.0%)
- 'u': 39 (width 38 full-mask coverage 100.0%)
- 'v': 38 (width 38 full-mask coverage 100.0%)
- 'w': 38 (width 38 full-mask coverage 100.0%)
- 'x': 38 (width 38 full-mask coverage 100.0%)
- 'y': 41 (width 38 full-mask coverage 99.833%)
- 'z': 38 (width 38 full-mask coverage 100.0%)
- '7': 38 (width 38 full-mask coverage 100.0%)
- '8': 42 (width 38 full-mask coverage 99.621%)
- '9': 46 (width 38 full-mask coverage 99.67%)
- '.': 108 (width 38 full-mask coverage 18.693%)
- ',': 73 (width 38 full-mask coverage 66.355%)
- '!': 56 (width 38 full-mask coverage 86.482%)
- '?': 38 (width 38 full-mask coverage 100.0%)
- '-': 91 (width 38 full-mask coverage 52.34%)
- ':': 52 (width 38 full-mask coverage 96.807%)
- ';': 66 (width 38 full-mask coverage 92.876%)
- "'": 76 (width 38 full-mask coverage 63.755%)
- '"': 43 (width 38 full-mask coverage 99.528%)
- '(': 42 (width 38 full-mask coverage 99.722%)
- ')': 41 (width 38 full-mask coverage 99.895%)
