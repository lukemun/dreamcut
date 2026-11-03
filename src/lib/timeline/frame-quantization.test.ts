import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPOSITION_FPS,
  quantizeVisualFrameSpan,
  quantizeVisualTrimValue,
  toVisualFrame,
} from "@/lib/timeline/frame-quantization";

test("quantizeVisualFrameSpan clamps to minimum visual frames", () => {
  const span = quantizeVisualFrameSpan(1.0, 0.01);
  assert.equal(toVisualFrame(span.duration), 1);
});

test("quantizeVisualFrameSpan is idempotent for frame-aligned inputs", () => {
  const alignedStart = 91 / COMPOSITION_FPS;
  const alignedDuration = 45 / COMPOSITION_FPS;
  const once = quantizeVisualFrameSpan(alignedStart, alignedDuration);
  const twice = quantizeVisualFrameSpan(once.timeline_start, once.duration);
  assert.equal(once.timeline_start, twice.timeline_start);
  assert.equal(once.duration, twice.duration);
});

test("quantizeVisualTrimValue snaps scalars to the nearest frame", () => {
  const value = quantizeVisualTrimValue(3.051);
  assert.equal(toVisualFrame(value), toVisualFrame(3.051));
});
