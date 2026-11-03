Current default: [Turning line mask](LINE-MASK.md), with separate [review receipt](line-review.json) and [coverage checklist](line-checklist.json). Historical saved-method evidence below is preserved.

# Permanent Marker handwriting pack

Use caption font `permanent_marker` with animation `handwriting`. The renderer reuses this pack for every caption; no generation, network access, or per-title tracing is needed.

## Files

- `outlines.json`: unchanged filled contours and advances from the source font.
- `strokes.json`: ordered pen trajectories, one polyline per pen-down gesture. Each is normalized to its glyph's ink bounds (0–100, y down). Exact-case keys take precedence; absent lowercase guides reuse uppercase anatomy.
- `widths.json`: reviewed per-glyph nib widths, falling back to 38. They reveal contours through a mask; they do not alter the letter shape.
- `regions.json`: cached exclusive stroke regions. A wide nib can reveal only the current gesture's portion of the original glyph. Rebuild after changing guides with `pnpm exec tsx scripts/prepare-handwriting-regions.ts src/lib/timeline/handwriting/fonts/permanent-marker`.
- `metrics.json`: source units, space advance and pair kerning.
- `manifest.json`: stable font ID, source hash, supported characters and limitations.
- `LICENSE`: font license. `audit/`: per-letter findings and coverage receipts.

## Adding or revising a font

Create a separate `fonts/<font-slug>/` pack. Preserve the licensed font's contours and metrics. Trace each glyph's writing order and pen lifts against its actual anatomy; do not infer order from the outline's point order. Review exact lowercase variants. For each character inspect intermediate reveals and measure full-mask coverage before any completion shortcut. Save the font source hash, license, paths, widths and audit with the pack. Register a renderer route for the font ID and verify preview/export use the same frame-derived clock.

The earlier audits below `audit/` describe the original broad-nib implementation; they do not certify the revised renderer. B now uses two gestures: descending stem, pen lift, then both curves from the top. Exclusive regions prevent the stem nib from exposing the later curves. Each pen-down gesture accelerates and decelerates; pen lifts remain explicit clock gaps. The renderer keeps the actual font contour masked through completion instead of switching to a whole unmasked letter.

Use `marker-alphabet-lab` for review: slow B, uppercase/lowercase sheets, then isolated A–Z. Inspect partial strokes and completion after any guide change. This remains a reconstruction of handwriting, not recovered original pen motion. Unsupported Unicode remains visible through whole-character reveal.

## Reuse in the editor

In Text, choose **Permanent Marker**. In Animation, choose **Handwriting** at the start and adjust **Drawing time**. These settings reuse the same saved pack for new words. At the end, Handwriting uses **Erasing time**. The alphabet lab is a review example; the font pack is the reusable effect authority.

`review.json` records creator acceptance of the shown lab result and hashes the exact pack files. It preserves the review scope rather than certifying unreviewed intermediate strokes.
