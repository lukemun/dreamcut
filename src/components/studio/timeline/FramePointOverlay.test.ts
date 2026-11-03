import assert from "node:assert/strict";
import test from "node:test";

import {
  framePointPrompt,
  framePointsVisibleAtPlayhead,
  normalizedFramePoint,
} from "./FramePointOverlay";
import type { FrameTag } from "@/lib/review/frame-tag-types";

const tag = (seconds: number, point?: { x: number; y: number }): FrameTag => ({
  id: `tag-${seconds}`,
  label: "M1",
  timeline_seconds: seconds,
  frame_number: Math.round(seconds * 30),
  timeline_revision: 1,
  active_element_ids: [],
  anchor: {
    element_id: null,
    element_local_seconds: null,
    source_seconds: null,
  },
  ...(point ? { point } : {}),
  created_at: "2026-07-22T00:00:00.000Z",
});

test("normalizes a player click against the composition frame", () => {
  assert.deepEqual(
    normalizedFramePoint(460, 340, { left: 100, top: 20, width: 720, height: 1280 }),
    { x: 0.5, y: 0.25 },
  );
  assert.deepEqual(
    normalizedFramePoint(0, 2000, { left: 100, top: 20, width: 720, height: 1280 }),
    { x: 0, y: 1 },
  );
});

test("shows marked points only on their marked frame", () => {
  const tags = [
    {
      ...tag(5),
      points: [{ x: 0.2, y: 0.3 }, { x: 0.25, y: 0.9 }],
    },
    tag(5.2, { x: 0.4, y: 0.5 }),
    tag(5),
  ];
  assert.deepEqual(
    framePointsVisibleAtPlayhead(tags, 5).map(({ point }) => point),
    [{ x: 0.2, y: 0.3 }, { x: 0.25, y: 0.9 }],
  );
});

test("keeps the marking prompt short", () => {
  assert.equal(framePointPrompt(0), "Click to add marks");
  assert.equal(framePointPrompt(1), "1 mark · keep clicking");
  assert.equal(framePointPrompt(3), "3 marks · keep clicking");
});
