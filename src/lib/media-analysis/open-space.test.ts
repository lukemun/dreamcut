import assert from "node:assert/strict";
import test from "node:test";
import { findOpenRegions, pickFittingSize, speakerRegionsFromFace, textFill } from "./open-space";

const canvas = { width: 1920, height: 1080 }, safe = { x: 96, y: 54, width: 1728, height: 972 };

test("the open wall beside a talking head stays open; the shoulders below it do not", () => {
  // A centred close-up: the face is 424 px wide at x 829.
  const speaker = speakerRegionsFromFace({ x: 829, y: 300, width: 424, height: 520 }, canvas);
  assert.equal(speaker[1]!.y + speaker[1]!.height, 1080, "the shoulders run to the bottom of the frame");
  const [first] = findOpenRegions({ canvas, safe, occupied: speaker });
  assert.equal(first!.side, "left");
  assert.ok(first!.x + first!.width <= speaker[0]!.x, "the region stops before the head");
  assert.ok(first!.width > 500 && first!.height > 600, `a large region beside the head: ${first!.width}x${first!.height}`);
});

test("regions avoid every occupied box and are listed largest first", () => {
  const regions = findOpenRegions({ canvas, safe, occupied: [{ x: 800, y: 0, width: 320, height: 1080 }, { x: 96, y: 54, width: 400, height: 200 }], padding: 0 });
  for (let i = 1; i < regions.length; i++) assert.ok(regions[i - 1]!.area_fraction >= regions[i]!.area_fraction);
  for (const region of regions) assert.ok(region.x + region.width <= 800 + 1 || region.x >= 1120 - 1);
});

test("fill compares ink to the region and the largest fitting size wins", () => {
  const region = { x: 100, y: 100, width: 800, height: 600 };
  assert.deepEqual(textFill(region, { width: 400, height: 150 }), { width_fill: 0.5, height_fill: 0.25, fill: 0.5 });
  const sizes = [60, 90, 120, 150].map(font_size_px => ({ font_size_px, ink_width: font_size_px * 5, height: font_size_px * 3 }));
  assert.equal(pickFittingSize(region, sizes, 0.85)?.font_size_px, 120);
  assert.equal(pickFittingSize({ ...region, width: 100 }, sizes, 0.85), null);
});
