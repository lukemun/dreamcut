import assert from "node:assert/strict";
import test from "node:test";
import { associateDetectionsToShots } from "./shot-association";

test("shot association uses half-open intervals and includes the final endpoint", () => {
  const associated = associateDetectionsToShots([
    { detection_id: "a", time_seconds: 1 },
    { detection_id: "b", time_seconds: 2 },
  ], [
    { shot_id: "one", start_seconds: 0, end_seconds: 1 },
    { shot_id: "two", start_seconds: 1, end_seconds: 2 },
  ]);
  assert.deepEqual(associated.map((item) => item.shot_id), ["two", "two"]);
});
