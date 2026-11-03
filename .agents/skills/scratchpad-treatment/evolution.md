# scratchpad-treatment — evolution log

## Purpose
Apply and audit the Scratchpad appearance: a continuous, even white cut-paper perimeter around cards, logos, cutouts, and other visual actors. Scope: appearance treatment only — timing, position, scale, rotation, and scene overlap remain separate instance properties. Good looks like: the full-perimeter contract holds (uniform inset on all four sides, overscan reserved before building so rotation and clipping cannot cut the margin, no white islands in the interior, consistent width at the same visual scale), verified on black at delivery resolution across entrance, hold, and exit states.

## 2026-09-20
- **Observation:** A reviewed composition extended the single white Scratchpad edge into a multicolor stack with progressive band widths, contour rounding, paper texture, and inter-sheet depth. Those decisions exceed the purpose of one continuous white perimeter.
- **Decision:** Logged the boundary and routed multicolor concentric stacks to the new `layered-paper-cutout` craft skill instead of expanding Scratchpad into a catchall collage workflow.
- **Verification:** Confirmed the Scratchpad full-perimeter rules remain unchanged and the new routing descriptions distinguish single-edge from stacked-paper requests.

## 2026-09-27 — Effect recipe packaging
- **Observation:** Reference analysis and successful recreation were not distinguished in catalog data.
- **Decision:** Link versioned evidence receipts with explicit candidate/partial/complete status.
- **Verification:** Catalog validation checks media hashes and both ownership links; recorded limitations remain unresolved.

## 2026-10-17 — Paper cutout template
- **Observation:** The creator asked for the scrapbook paper-outline look as a selectable template for moving subjects; the editor could already build it (tracked cutout plus `sticker_outline`), but Templates had only the still-artwork White Paper Outline.
- **Decision:** Added the `FX-PAPER-CUTOUT` template (`templates/paper-cutout.md`): `cutout_prepare` on the subject under the mark, then one proposed cutout clip aligned to the same source moment with Paper outline, Size, Horizontal and Vertical dials and Outline color in Advanced.
- **Verification:** Demo project `tpl-paper-cutout-demo` (Pexels 8970054). The first cutout dropped both backpack straps, which left outline strokes inside the body; re-prompting with points on the straps fixed it. Teaching media rendered through the GPU compositor.
