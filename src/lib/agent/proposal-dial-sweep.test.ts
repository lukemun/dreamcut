import assert from "node:assert/strict";
import test from "node:test";
import { numericWorkingRange } from "@/lib/timeline/numeric-working-range";
import { dialSweepValues } from "./proposal-dial-sweep";
import type { ProposalFieldChange } from "./proposal-review";

const change = (patch: Partial<ProposalFieldChange>): ProposalFieldChange => ({ field: "shape_taper", label: "Taper", before: "—", after: "85%", target: "create_shape", operation_index: 1, after_value: 0.85, ...patch });

test("a dial is swept to both ends of the slider the card draws, in stored units", () => {
  const window = numericWorkingRange(85, 0, 100, 1, { floorFraction: 0.25 });
  assert.deepEqual(dialSweepValues(change({})), [window.min / 100, window.max / 100]);
});

test("timing dials sweep their whole range", () => {
  const values = dialSweepValues(change({ field: "spacing_seconds", target: "timing_control", after_value: 0.4, control_range: { min: 0.2, max: 1.2 } }));
  assert.deepEqual(values, [0.2, 1.2]);
});

test("choices, colours and unknown fields are not swept as sliders", () => {
  assert.deepEqual(dialSweepValues(change({ field: "place_side", after_value: "below" })), []);
  assert.deepEqual(dialSweepValues(change({ field: "shape_stroke", after_value: "#ffffff" })), []);
  assert.deepEqual(dialSweepValues(change({ field: "not_a_dial", after_value: 3 })), []);
});

test("a slider that reaches its minimum lands on it exactly, not a rounding error below", () => {
  const values = dialSweepValues(change({ field: "params.audio_fade_duration_seconds", target: "create_transition", after_value: 0.5 }));
  assert.ok(values.every(value => value >= 1 / 30 && value <= 2), String(values));
});
