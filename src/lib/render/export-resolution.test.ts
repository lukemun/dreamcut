import assert from "node:assert/strict";
import test from "node:test";
import { getCompositionDimensions } from "./composition-adapters";
import { EXPORT_RESOLUTIONS, exportOutputSize, exportRenderPlan, exportResolutionLabel, isExportResolution } from "./export-resolution";

test("every aspect ratio downscales to even H.264 sizes by short side", () => {
  const expected: Record<string, Record<number, [number, number]>> = {
    "9:16": { 480: [480, 854], 720: [720, 1280], 1080: [1080, 1920], 1440: [1440, 2560], 2160: [2160, 3840] },
    "4:5": { 480: [480, 600], 720: [720, 900], 1080: [1080, 1350], 1440: [1440, 1800], 2160: [2160, 2700] },
    "1:1": { 480: [480, 480], 720: [720, 720], 1080: [1080, 1080], 1440: [1440, 1440], 2160: [2160, 2160] },
    "16:9": { 480: [854, 480], 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] },
  };
  for (const [ratio, sizes] of Object.entries(expected)) {
    const canvas = getCompositionDimensions(ratio as "9:16");
    for (const resolution of EXPORT_RESOLUTIONS) {
      const size = exportOutputSize(canvas, resolution);
      assert.deepEqual([size.width, size.height], sizes[resolution], `${ratio} at ${resolution}p`);
      assert.equal(size.width % 2 + size.height % 2, 0);
    }
  }
});

test("2K and 4K raise pixel density instead of encoder upscaling; smaller sizes downscale", () => {
  const canvas = { width: 1080, height: 1920 };
  assert.deepEqual(exportRenderPlan(canvas, 2160), { pixelScale: 2, outputSize: { width: 2160, height: 3840 }, downscale: false });
  assert.deepEqual(exportRenderPlan(canvas, 1440).pixelScale, 4 / 3);
  assert.deepEqual(exportRenderPlan(canvas, 1080), { pixelScale: 1, outputSize: canvas, downscale: false });
  assert.equal(exportRenderPlan(canvas, 720).downscale, true);
  assert.throws(() => exportRenderPlan({ width: 1002, height: 1000 }, 2160), /4K is unavailable/);
  assert.deepEqual(EXPORT_RESOLUTIONS.map(exportResolutionLabel), ["480p", "720p", "1080p", "2K", "4K"]);
  assert.equal(isExportResolution(2160), true);
  assert.equal(isExportResolution(4320), false);
});
