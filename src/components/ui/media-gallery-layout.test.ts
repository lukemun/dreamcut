import test from "node:test";
import assert from "node:assert/strict";
import { mediaGalleryRows, mediaGalleryWidths } from "./media-gallery-layout";
test("mixed native ratios pack without overflow or changing item order", () => {
  const ratios = [16 / 9, 9 / 16, 1, 2 / 3, 3];
  for (const width of [240, 390, 740, 1280]) {
    const sizes = mediaGalleryWidths(ratios, width);
    assert.equal(sizes.length, ratios.length);
    assert.ok(sizes.every(s => s >= Math.min(140, width) && s <= width));
    assert.deepEqual(mediaGalleryWidths(ratios, width), sizes);
  }
  const row = mediaGalleryWidths([2, 1], 660, 220, 0);
  assert.equal(row[0] / row[1], 2);
  assert.equal(row[0] + row[1], 660);
});
test("sparse rows, unknown ratios, extreme assets and constrained columns remain bounded", () => {
  assert.deepEqual(mediaGalleryWidths([1], 1200), [220]);
  assert.deepEqual(mediaGalleryWidths([1, 1], 0), [0, 0]);
  assert.ok(mediaGalleryWidths([NaN, 0, Infinity, .001, 1000], 390).every(n => Number.isFinite(n) && n > 0 && n <= 390));
  assert.deepEqual(mediaGalleryWidths([1, 1], 400, 220, 12, 140, 1), [400, 220]);
});
test("even rows share one media height without exceeding any item's natural height", () => {
  const ratios = [16 / 9, 9 / 16, 16 / 9, 9 / 16, 9 / 16];
  const { widths, heights } = mediaGalleryRows(ratios, 900, 240, 20, 200);
  widths.forEach((w, i) => assert.ok(heights[i] <= w / ratios[i] + 0.01));
  let start = 0;
  // Items whose left edges restart mark a new row; every row has a single height.
  const rows: number[][] = [[]];
  widths.forEach((w, i) => { if (i && start + w > 900 + 0.5) { rows.push([]); start = 0; } rows.at(-1)!.push(heights[i]); start += w + 20; });
  rows.forEach(row => assert.equal(new Set(row).size, 1));
  // A row of floored portraits keeps the target height instead of growing to the label floor.
  assert.equal(mediaGalleryRows([9 / 16, 9 / 16], 900, 240, 20, 200).heights[0], 240);
});

test("a last row that nearly fills the width stretches like the rows above; a sparse one does not", () => {
  const four = mediaGalleryRows([16 / 9, 16 / 9, 16 / 9, 16 / 9], 555, 140, 12, 120, 3);
  assert.deepEqual(four.widths.map(Math.round), [272, 272, 272, 272]);
  const three = mediaGalleryRows([16 / 9, 16 / 9, 16 / 9], 555, 140, 12, 120, 3);
  assert.equal(Math.round(three.widths[2]), 249, "a lone last card keeps its natural width");
});
