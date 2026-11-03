import assert from "node:assert/strict";
import test from "node:test";

import {
  readTimelineMetadata,
  sanitizeTimelineOutputAspectRatio,
} from "@/lib/timeline/metadata";

test("timeline metadata preserves the 4:5 social-feed canvas", () => {
  assert.equal(sanitizeTimelineOutputAspectRatio("4:5"), "4:5");
  assert.equal(
    readTimelineMetadata({ output_aspect_ratio: "4:5" }).output_aspect_ratio,
    "4:5",
  );
});

test("timeline metadata preserves the 1:1 square canvas", () => {
  assert.equal(sanitizeTimelineOutputAspectRatio("1:1"), "1:1");
  assert.equal(readTimelineMetadata({ output_aspect_ratio: "1:1" }).output_aspect_ratio, "1:1");
});

test("timeline metadata keeps the existing safe fallback", () => {
  assert.equal(sanitizeTimelineOutputAspectRatio("not-a-ratio"), "9:16");
});
