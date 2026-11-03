import test from "node:test";
import assert from "node:assert/strict";
import { transitionKeyframesSchema } from "../timeline/transition-effects";
import { TRANSITION_KEYFRAME_DISPLAY, formatFieldValue, transitionKeyframeDisplay } from "./proposal-review";

const keys = Object.keys(transitionKeyframesSchema.shape);
const track = [{ t: 0, v: 0 }, { t: 0.1, v: 1 }];

test("every transition_keyframes key has its own review label", () => {
  assert.deepEqual(Object.keys(TRANSITION_KEYFRAME_DISPLAY).sort(), [...keys].sort());
  const labels = new Set<string>();
  for (const key of keys) {
    const { label } = transitionKeyframeDisplay(key);
    assert.ok(label && label !== key, `${key} needs a human label`);
    assert.ok(!labels.has(label), `${key} reuses the label "${label}"`);
    labels.add(label);
    const row = formatFieldValue("transition_keyframes", { [key]: track });
    assert.ok(row.startsWith(`${label}: `), `${key} row reads "${row}"`);
    if (key !== "transition_blur") assert.ok(!row.startsWith("Blur:"), `${key} must not be labelled Blur`);
  }
});

test("subject flash and glow read as Flash and Glow", () => {
  assert.equal(formatFieldValue("transition_keyframes", { subject_flash: [{ t: 0, v: 0 }, { t: 0.1, v: 1 }] }), "Flash: 0.00s 0% → 0.10s 100%");
  assert.equal(formatFieldValue("transition_keyframes", { subject_glow: [{ t: 0, v: 0 }, { t: 0.2, v: 1.5 }] }), "Glow: 0.00s 0% → 0.20s 150%");
});

test("an unknown key keeps its own name rather than falling to Blur", () => {
  assert.equal(formatFieldValue("transition_keyframes", { future_track: track }), "future track: 0.00s 0 → 0.10s 1");
});
