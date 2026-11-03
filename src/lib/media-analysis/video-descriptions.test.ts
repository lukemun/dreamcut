import test from "node:test";
import assert from "node:assert/strict";
import { matchingVideoFrames, videoSearchTextMatches, videoDescriptionTimes, validateVideoFrames, validateVideoDescription, type VideoDescription } from "./video-descriptions";

export const descriptionFixture = (hash = "a".repeat(64)): VideoDescription => ({
  schema_version: 1, recipe: "video-descriptions-v1", source_sha256: hash, duration_seconds: 2.5,
  summary: "An empty room, followed by a cat beside the sofa.", tags: ["room", "cat"], uncertainties: [],
  frames: videoDescriptionTimes(2.5).map((time, i) => ({ id: `frame-${i}`, time_seconds: time,
    description: i < 2 ? "Empty room with a sofa." : "Spotted cat sits beside the sofa.", tags: i < 2 ? ["room"] : ["cat", "sofa"] })),
  summary_input_ids: videoDescriptionTimes(2.5).map((_, i) => `frame-${i}`),
});
test("description coverage rejects a poster-only video, dropped ending, duplicates and out-of-order observations", () => {
  const d = descriptionFixture();
  assert.deepEqual(videoDescriptionTimes(2.5), [0, 1, 2, 2.45]);
  assert.throws(() => validateVideoFrames(d.frames.slice(0, 1), 2.5), /whole clip/);
  assert.throws(() => validateVideoFrames(d.frames.slice(0, -1), 2.5), /whole clip/);
  assert.throws(() => validateVideoFrames([...d.frames].reverse(), 2.5), /whole clip/);
  assert.throws(() => validateVideoFrames(d.frames.map(f => ({ ...f, id: "same" })), 2.5), /Duplicate/);
  assert.throws(() => validateVideoDescription({ ...d, summary_input_ids: d.summary_input_ids.slice(0, -1) }), /all frame/);
  assert.throws(() => videoDescriptionTimes(Infinity), /positive/);
  assert.equal(validateVideoDescription(d).frames.length, 4);
});
test("search finds an ending-only action with multiword case-insensitive queries", () => {
  assert.equal(matchingVideoFrames(descriptionFixture().frames, "SPOTTED cat").length, 2);
  assert.equal(matchingVideoFrames(descriptionFixture().frames, "cat ending", 2.5).length, 2);
  assert.equal(matchingVideoFrames(descriptionFixture().frames, "cats").length, 2);
  assert.equal(matchingVideoFrames(descriptionFixture().frames, "cat beginning", 2.5).length, 0);
  assert.equal(matchingVideoFrames(descriptionFixture().frames, "dog").length, 0);
  assert.equal(matchingVideoFrames(descriptionFixture().frames, "").length, 0);
  assert.equal(videoSearchTextMatches("A vacation location", ["cat"]), false);
  assert.equal(videoSearchTextMatches("Two cats", ["cat"]), true);
});
