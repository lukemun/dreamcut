import assert from "node:assert/strict";
import test from "node:test";

import { buildShotBoundedTracks, type TrackDetection } from "./semantic-tracks";

const shots = [
  { shot_id: "shot_a", start_seconds: 0, end_seconds: 2 },
  { shot_id: "shot_b", start_seconds: 2, end_seconds: 4 },
];

function detection(id: string, time: number, x: number, label: "face" | "person" = "face"): TrackDetection {
  return { detection_id: id, frame_id: `frame_${time}`, time_seconds: time, label, confidence: 0.9, x, y: 0.2, width: 0.2, height: 0.2 };
}

test("tracking is stable across detector completion order and keeps labels separate", () => {
  const detections = [
    detection("right_2", 0.5, 0.66), detection("left_2", 0.5, 0.12),
    detection("person", 0.5, 0.1, "person"),
    detection("left_1", 0, 0.1), detection("right_1", 0, 0.7),
  ];
  const forward = buildShotBoundedTracks("detector-v1:abc", detections, shots);
  const reverse = buildShotBoundedTracks("detector-v1:abc", [...detections].reverse(), [...shots].reverse());
  assert.deepEqual(reverse, forward);
  assert.deepEqual(forward.map((track) => [track.track_id, track.samples.map((sample) => sample.detection_id)]), [
    ["face_01", ["left_1", "left_2"]],
    ["face_02", ["right_1", "right_2"]],
    ["person_01", ["person"]],
  ]);
});

test("tracks never cross a shot boundary even when boxes are identical", () => {
  const result = buildShotBoundedTracks("rev", [
    detection("before", 1.9, 0.2),
    detection("after", 2, 0.2),
  ], shots);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((track) => track.shot_id), ["shot_a", "shot_b"]);
  assert.deepEqual(result.map((track) => track.track_id), ["face_01", "face_02"]);
});

test("a long absence starts a new track and no gap samples are invented", () => {
  const result = buildShotBoundedTracks("rev", [
    detection("seen_1", 0, 0.2),
    detection("seen_2", 0.25, 0.21),
    detection("seen_again", 1.5, 0.22),
  ], shots, { max_gap_seconds: 0.5 });
  assert.equal(result.length, 2);
  assert.deepEqual(result[0]!.samples.map((sample) => sample.time_seconds), [0, 0.25]);
  assert.deepEqual(result[1]!.samples.map((sample) => sample.time_seconds), [1.5]);
});

test("detections outside declared shots and invalid zero-area boxes are excluded", () => {
  const invalid = { ...detection("invalid", 1, 0.2), width: 0 };
  const result = buildShotBoundedTracks("rev", [detection("outside", 5, 0.2), invalid], shots);
  assert.deepEqual(result, []);
});

test("the final endpoint belongs only to the final shot", () => {
  const result = buildShotBoundedTracks("rev", [detection("final", 4, 0.2)], shots);
  assert.equal(result[0]?.shot_id, "shot_b");
});
