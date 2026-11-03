import assert from "node:assert/strict";
import test from "node:test";

import { gradeSequenceSections, sequenceSectionsExamples, sequenceSectionsPacket } from "./sequence-sections-eval";

test("dials grouped by beat in time order pass", () => {
  const result = gradeSequenceSections(sequenceSectionsExamples().good);
  assert.deepEqual(result.failures, []);
  assert.equal(result.pass, true);
});

test("each broken layout fails for its own reason", () => {
  const expected: Record<string, string> = {
    flat_time_on_screen: "sectioned", mark_numbers: "named_by_place", hold_in_next_beat: "one_beat_per_section",
    by_kind_not_beat: "one_beat_per_section", shared_last: "shared_first", hold_before_move: "blur_before_hold", missing_blur: "coverage",
  };
  for (const [name, option] of Object.entries(sequenceSectionsExamples().bad)) {
    const result = gradeSequenceSections(option);
    assert.equal(result.pass, false, name);
    assert.equal(result.checks[expected[name]], false, `${name}: ${result.failures.join("; ")}`);
  }
});

test("the packet never reveals the layout", () => {
  const packet = sequenceSectionsPacket();
  assert.deepEqual(packet.input.option.review_controls, []);
  assert.ok(!JSON.stringify(packet).includes("\"section\""));
});

test("changing the sequence or a malformed answer fails", () => {
  const { good } = sequenceSectionsExamples();
  const moved = structuredClone(good);
  moved.operations[1].create_visual.title = "Move out: somewhere else";
  assert.equal(gradeSequenceSections(moved).checks.preserve_sequence, false);
  assert.equal(gradeSequenceSections({ review_controls: "dials" }).pass, false);
});
