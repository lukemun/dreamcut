import assert from "node:assert/strict";
import test from "node:test";

import { sourceNeedsSdrRenderAuthority } from "./color-profile";

test("requires a paired SDR render authority for Apple HLG BT.2020", () => {
  assert.equal(sourceNeedsSdrRenderAuthority({
    color_transfer: "arib-std-b67",
    color_primaries: "bt2020",
    pixel_format: "yuv420p10le",
  }), true);
});

test("requires a paired SDR render authority for PQ and conservative untagged 10-bit", () => {
  assert.equal(sourceNeedsSdrRenderAuthority({ color_transfer: "smpte2084", color_primaries: "bt2020", pixel_format: "yuv420p10le" }), true);
  assert.equal(sourceNeedsSdrRenderAuthority({ color_transfer: null, color_primaries: null, pixel_format: "yuv420p10le" }), true);
});

test("keeps ordinary SDR BT.709 as direct render authority", () => {
  assert.equal(sourceNeedsSdrRenderAuthority({ color_transfer: "bt709", color_primaries: "bt709", pixel_format: "yuv420p" }), false);
});
