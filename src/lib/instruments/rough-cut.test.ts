import assert from "node:assert/strict";
import test from "node:test";
import { buildEditMap, proposeRoughCuts, retainedRegions, sourceToTimeline } from "@/lib/instruments/rough-cut";

const words = [{ word: "Hello", start: 0, end: 0.4 }, { word: "um", start: 1, end: 1.2 }, { word: "world", start: 1.8, end: 2.2 }];
const source = { sourceStart: 0, sourceEnd: 3, timelineStart: 0, playbackRate: 1 };

test("proposal includes source/timeline bounds, reason, and confidence", () => {
  const cuts = proposeRoughCuts(words, [source]);
  assert.ok(cuts.some((cut) => cut.reason === "dead_air" && cut.timelineEnd > cut.timelineStart));
  assert.ok(cuts.some((cut) => cut.reason === "filler" && cut.confidence > 0));
});

test("proposal is idempotent after removed source ranges are absent", () => {
  const retained = [{ ...source, sourceEnd: 0.48 }, { ...source, sourceStart: 0.92, timelineStart: 0.48 }];
  assert.equal(proposeRoughCuts(words, retained).some((cut) => cut.id === "dead-air-0"), false);
});

test("retained regions ripple closed and edit map preserves source mapping", () => {
  const removal = proposeRoughCuts(words, [source])[0]!;
  removal.approved = true;
  const retained = retainedRegions(source, [removal]);
  const map = buildEditMap(retained);
  assert.equal(map[1]!.timelineStart, map[0]!.timelineEnd);
  assert.equal(sourceToTimeline(map[1]!.sourceStart, map), map[1]!.timelineStart);
});
