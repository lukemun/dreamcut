import assert from "node:assert/strict";
import test from "node:test";

import { parseCubeLut, readColorGradeLutProps, resetColorGradeLutProps, writeColorGradeLutProps } from "./cube-lut";

const identity2 = `TITLE "Identity 2"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`;

test("parses a bounded 3D cube contract", () => {
  const parsed = parseCubeLut(identity2);
  assert.equal(parsed.title, "Identity 2");
  assert.equal(parsed.size, 2);
  assert.equal(parsed.data.length, 24);
});

test("rejects incomplete, unsupported, and invalid-domain LUTs", () => {
  assert.throws(() => parseCubeLut("LUT_1D_SIZE 2\n0 0 0\n1 1 1"), /not supported/);
  assert.throws(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0"), /Expected 8 LUT rows/);
  assert.throws(() => parseCubeLut(identity2.replace("DOMAIN_MAX 1 1 1", "DOMAIN_MAX 0 1 1")), /DOMAIN_MIN/);
});

test("LUT props require stable project-local references and reset cleanly", () => {
  const props = writeColorGradeLutProps({ keep: true }, { assetId: "0123456789abcdef", sourceUrl: "/api/projects/demo/media/luts/0123456789abcdef.cube" }, 0.4567);
  assert.deepEqual(readColorGradeLutProps(props), { assetId: "0123456789abcdef", sourceUrl: "/api/projects/demo/media/luts/0123456789abcdef.cube", intensity: 0.457 });
  assert.deepEqual(resetColorGradeLutProps(props), { keep: true });
  assert.throws(() => readColorGradeLutProps({ lut_asset_id: "bad", lut_source_url: "https://example.com/look.cube" }));
});
