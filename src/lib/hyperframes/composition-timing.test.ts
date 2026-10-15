import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFormula, parseTimingSpec, resolveTiming } from "./composition-timing";
import { parseCompositionManifest } from "./composition-manifest";

test("timing formulas evaluate arithmetic over number controls only", () => {
  assert.equal(evaluateFormula("4.2 * pace + title_hold", { pace: 1, title_hold: 2.2 }), 6.4);
  assert.equal(evaluateFormula("max(0.5, (1 - pace) * 2)", { pace: 0.5 }), 1);
  assert.throws(() => evaluateFormula("1; alert(1)", {}), /may use/);
  assert.throws(() => evaluateFormula("window.alert(1)", {}), /not a number control/);
  assert.throws(() => evaluateFormula("2 * speed", {}), /not a number control/);
  assert.throws(() => evaluateFormula("2 +", {}), /ends early/);
});

test("a manifest's timing resolves for any value set and fails early when wrong", () => {
  const manifest = parseCompositionManifest({ schema_version: 1,
    controls: [{ id: "pace", kind: "number", label: "Pace", default: 1, min: 0.5, max: 2 }, { id: "title_hold", kind: "number", label: "Title hold", default: 2.2, min: 0.5, max: 6 }],
    timing: { duration: "4.9 * pace + title_hold", cues: [{ id: "impact", label: "Title lands", at: "2.2 * pace" }, { id: "out", label: "Collapse out", at: "4.2 * pace + title_hold" }] } });
  assert.deepEqual(resolveTiming(manifest.timing!, { pace: 1, title_hold: 2.2 }), { duration: 7.1, cues: { impact: 2.2, out: 6.4 } });
  assert.deepEqual(resolveTiming(manifest.timing!, { pace: 0.5, title_hold: 4, title: "x" }).cues, { impact: 1.1, out: 6.1 });
  assert.throws(() => parseTimingSpec({ cues: [{ id: "a", label: "A", at: "2 * missing" }] }, {}), /not a number control/);
  assert.throws(() => parseTimingSpec({ duration: "1 - hold", cues: [] }, { hold: 2 }), /longer than zero/);
});
