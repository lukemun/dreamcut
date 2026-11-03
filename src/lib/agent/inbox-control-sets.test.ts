import assert from "node:assert/strict";
import test from "node:test";

import { packInboxControlSets, unpackInboxControlSets } from "./inbox-control-sets";

test("packed inbox controls expand back to exactly what the server built", () => {
  const look = { id: "look", kind: "choice", label: "Look", default: "glass", options: [{ value: "glass", label: "Glass" }, { value: "paper", label: "Paper" }] };
  const body = {
    revision: "r",
    details: {
      a: { review: [{ motion_items: [{ id: "x", controls: [look, { id: "layer", kind: "text", label: "Layer", default: "chart-bars", fixed: true }] }, { id: "y", controls: [look, { id: "layer", kind: "text", label: "Layer", default: "chart-stat", fixed: true }] }] }] },
      b: { error: "unavailable" },
      c: { review: [{ motion_items: [{ id: "sound" }] }] },
    },
  };
  const original = structuredClone(body);
  const packed = packInboxControlSets(structuredClone(body)) as typeof body & { control_sets: Record<string, unknown> };
  assert.equal(Object.keys(packed.control_sets).length, 3);
  assert.ok(!JSON.stringify(packed.details).includes('"options"'));
  assert.deepEqual(unpackInboxControlSets(packed), original);
});
