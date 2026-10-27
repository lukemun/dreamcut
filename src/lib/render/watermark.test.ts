import assert from "node:assert/strict";
import test from "node:test";

import { exportNeedsWatermark, watermarkEncodeArgs, watermarkFilter } from "@/lib/render/watermark";

test("only exports from a signed-out editor carry the watermark", () => {
  assert.equal(exportNeedsWatermark(false), true);
  assert.equal(exportNeedsWatermark(true), false);
});

test("the mark scales with the short side and sits in the bottom-right corner", () => {
  assert.equal(watermarkFilter({ width: 1920, height: 1080 }),
    "[1:v]scale=76:76:flags=lanczos,format=rgba,colorchannelmixer=aa=0.9[mark];[0:v][mark]overlay=W-w-38:H-h-38:format=auto,setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709:range=tv");
  // portrait 1080 × 1920 measures from the same short side
  assert.match(watermarkFilter({ width: 1080, height: 1920 }), /scale=76:76.*overlay=W-w-38:H-h-38/);
  // tiny working renders keep a visible mark
  assert.match(watermarkFilter({ width: 270, height: 480 }), /scale=24:24/);
});

test("the watermark pass keeps each format's codec and colour tags", () => {
  assert.ok(watermarkEncodeArgs("sdr").includes("libx264"));
  assert.ok(watermarkEncodeArgs("hdr").includes("libvpx-vp9"));
  assert.match(watermarkFilter({ width: 1920, height: 1080 }, "hdr"), /color_trc=arib-std-b67/);
});
