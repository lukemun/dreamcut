import assert from "node:assert/strict";
import test from "node:test";
import { referenceTypographySchema } from "./reference-typography";

function fixture() {
  return {
    schema_version: 1,
    source: { file: "reference.mp4", sha256: "a".repeat(64), width: 1080, height: 1920, fps: 30, frame_manifest: "frames.json", convention: "zero-based half-open" },
    coverage: { intervals: [[0, 30]], continuous_playback: false, limitations: [] },
    elements: [{ id: "title", role: "hero", alignment: "center", layering: "foreground", states: [{
      start_frame: 0, end_frame: 30, start_pts: 0, end_pts: 1, text: "TITLE",
      font: { family: null, class: "sans", weight: "heavy", width: "condensed", case: "upper", treatment: "plain" },
      fill: { hex: "#ffffff", method: "crop sample" }, effects: [], glyph_bounds: [0.2, 0.4, 0.8, 0.6],
      glyph_height_ratio: 0.2, ink_area_ratio: null, tracking: null, line_spacing: null, rotation: null,
      measurement_method: "pixel bounds", confidence: "high", limitations: ["Font family unidentified"], evidence: ["frame.png"],
    }] }], relationships: [], reconstruction: [],
  };
}

test("typography evidence permits explicit unknowns but requires geometry and timing fields", () => {
  assert.equal(referenceTypographySchema.safeParse(fixture()).success, true);
  const missing = fixture();
  Reflect.deleteProperty(missing.elements[0].states[0], "glyph_bounds");
  assert.equal(referenceTypographySchema.safeParse(missing).success, false);
});

test("typography rejects reversed bounds and overlapping font states", () => {
  const reversed = fixture();
  reversed.elements[0].states[0].glyph_bounds = [0.8, 0.4, 0.2, 0.6];
  assert.equal(referenceTypographySchema.safeParse(reversed).success, false);
  const overlap = fixture();
  overlap.elements[0].states.push({ ...overlap.elements[0].states[0], start_frame: 29, end_frame: 60, start_pts: 29 / 30, end_pts: 2 });
  assert.equal(referenceTypographySchema.safeParse(overlap).success, false);
});
