import assert from "node:assert/strict";
import test from "node:test";

import { parseIntegratedLufs } from "@/lib/local-store/audio-loudness";

test("parseIntegratedLufs reads the integrated figure from an ebur128 summary", () => {
  const stderr = [
    "[Parsed_ebur128_0 @ 0x] Summary:",
    "",
    "  Integrated loudness:",
    "    I:         -30.8 LUFS",
    "    Threshold: -40.9 LUFS",
    "",
    "  Loudness range:",
    "    LRA:         6.1 LU",
  ].join("\n");
  assert.equal(parseIntegratedLufs(stderr), -30.8);
});

test("parseIntegratedLufs takes the LAST I: so integrated wins over any per-frame line", () => {
  const stderr = [
    "[Parsed_ebur128_0 @ 0x] t: 1  M: -22.0 S: -22.0 I: -19.4 LUFS",
    "[Parsed_ebur128_0 @ 0x] Summary:",
    "    I:         -23.0 LUFS",
  ].join("\n");
  assert.equal(parseIntegratedLufs(stderr), -23);
});

test("parseIntegratedLufs returns null when no integrated figure is present", () => {
  assert.equal(parseIntegratedLufs("no loudness here"), null);
  assert.equal(parseIntegratedLufs(""), null);
});

test("parseIntegratedLufs handles a positive/zero-ish value defensively", () => {
  assert.equal(parseIntegratedLufs("    I:   -0.5 LUFS"), -0.5);
});
