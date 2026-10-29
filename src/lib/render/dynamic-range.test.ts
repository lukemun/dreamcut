import assert from "node:assert/strict";
import test from "node:test";
import { hdrExportWarning, hdrFootageShare, hdrSuitsTimeline } from "./dynamic-range";

const hlg = { source_color_space: { transfer: "hlg", primaries: "rec2020" } };
const clip = (timeline_start: number, duration: number, props: unknown = {}, type = "video_clip") => ({ type, timeline_start, duration, props });

test("a screen-recording tutorial with one iPhone HLG clip is mostly SDR", () => {
  const elements = [clip(0, 60), clip(20, 8, hlg), clip(0, 60, {}, "text"), clip(0, 60, {}, "audio")];
  assert.ok(Math.abs(hdrFootageShare(elements) - 8 / 60) < 1e-9);
  assert.equal(hdrSuitsTimeline(elements), false);
  assert.match(hdrExportWarning(elements)!, /look dim/);
});

test("overlapping HDR clips count their running time once", () => {
  const elements = [clip(0, 10, hlg), clip(5, 10, { source_color_space: { transfer: "pq" } }), clip(15, 5)];
  assert.equal(hdrFootageShare(elements), 0.75);
  assert.equal(hdrSuitsTimeline(elements), true);
  assert.equal(hdrExportWarning(elements), null);
});

test("HDR stills, SDR clips and empty timelines never suggest HDR", () => {
  assert.equal(hdrFootageShare([]), 0);
  assert.equal(hdrFootageShare([clip(0, 10, hlg, "still"), clip(0, 10)]), 0);
});
