import assert from "node:assert/strict";
import test from "node:test";

import { dialSelectionCases, dialSelectionPacket, dialSelectionSelfCheck, gradeDialSelection } from "./dial-selection-eval";

test("every dial-selection case passes its reference answer and fails its known-bad answers", () => {
  for (const result of dialSelectionSelfCheck()) assert.deepEqual(result, { case_id: result.case_id, reference_passes: true, known_bad_fail: true });
});

test("the packet never reveals the grading", () => {
  for (const { id } of dialSelectionCases()) {
    const packet = JSON.stringify(dialSelectionPacket(id));
    assert.ok(!packet.includes("required") && !packet.includes("excluded") && !packet.includes("reference"));
  }
});

test("malformed or unknown answers fail", () => {
  assert.equal(gradeDialSelection("header-flash-fix", { main: "entrance" }).pass, false);
  assert.equal(gradeDialSelection("header-flash-fix", { main: ["entrance", "speed"] }).pass, false);
});
