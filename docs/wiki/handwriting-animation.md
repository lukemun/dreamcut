# Handwriting captions

Implementation recommendation based on [external findings](../research/2026-09-27-handwriting-animation.md).

## Two routes

1. **Ready handwriting:** editable text laid out using a licensed stroke alphabet. Use frame-derived SVG dash progress and authored pen lifts. This is the implemented first route, exposed as the caption Handwriting animation.
2. **Keep my font:** prepare ordered centerline strokes and clip them to the filled glyph artwork. This preserves the chosen lettering. Permanent Marker now has an authored reusable font pack. Other fonts need their own prepared and reviewed paths.

## Current contract

Animation `handwriting` with `fontPreset: permanent_marker` reveals the original Permanent Marker glyph outlines through ordered, per-letter masks. The pack stores exact font outlines, advances/kerning, pen paths, nib widths, license and audit records. Other font presets currently use the bundled Hershey Script alphabet (printable ASCII). Duration, caption size, alignment, color and position remain editable. Other Unicode characters appear whole in sequence; they are preserved, not claimed as handwriting. Exit reverses the stroke reveal. No external runtime, model, or network call is required.

Existing `write_on` remains a horizontal wipe for backward compatibility. Stroke data is vendored with attribution and MIT license in `src/lib/timeline/handwriting/`. Additional alphabets require their own reviewed path data and licenses; automatic arbitrary-font reconstruction is not promised.

## Verification

`node --import tsx --test src/lib/timeline/handwriting.test.ts` checks pen-order timing, wrapping, alternate text, and Unicode fallback. `pnpm verify:effect-primitives` renders the B reveal at three progress points and measures increasing ink coverage. Preview and export share `HandwritingText` and pure layout helpers.

Spatial caveat: legacy caption instruments measure the selected ordinary font. Their text bounds are not authoritative for the dedicated stroke alphabet. Inspect rendered frames for placement; do not claim stroke text has passed font-based geometry checks.

Use the effect primitive render and spatial wrapper conformance checks for the current implementation. Sampled frames do not establish every-frame coverage or arbitrary-font support.

## Saved font packs

Permanent Marker lives in [`src/lib/timeline/handwriting/fonts/permanent-marker/`](../../src/lib/timeline/handwriting/fonts/permanent-marker/). Reuse this pack for later text; do not regenerate letter paths for each title. See its README for the per-letter preparation and verification contract. Uppercase and lowercase remain distinct lookup keys; shared anatomy can explicitly fall back to the uppercase guide.

Broad marker masks can expose adjoining ink at intersections slightly early. Unsupported Unicode has an explicit whole-character fallback. This is a prepared font implementation, not automatic stroke inference for arbitrary fonts.

Permanent Marker verification (2026-09-27): seven focused layout/timing tests passed; `pnpm check:pr` passed (1,556 passed, one skipped); the real-render B check measured 0 → 5,480 → 10,711 → 10,711 ink pixels, with only 244 accumulated alpha units changing when the completed mask is removed. Per-letter raster audits and partial-stage review are saved with the font pack. These checks do not claim every-frame verification of every possible caption.
