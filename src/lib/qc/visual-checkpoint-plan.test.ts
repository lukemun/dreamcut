import assert from "node:assert/strict";
import test from "node:test";

import { parseVisualCheckpointIds, parseVisualCheckpointPlan } from "@/lib/qc/visual-checkpoint-plan";

const valid = `# Tutorial

## Visual checkpoint contract

| Checkpoint | Beat / seam | Kind | Arrive on | Motion / action | Stop / hold | Must be visible | Minimum timeline seconds | Framing | Cut rule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CP01 | 1 | stop | Project top | Hold | 1 second | Project title | 1 | target-centered | Only after settled |
| CP02-scroll | 1 → 2 | scroll-waypoint | Project top | Scroll | No freeze | Overview passing | 0.5 | full-desktop | Keep the whole bridge |
`;

test("parses a complete visual checkpoint contract", () => {
  assert.deepEqual(parseVisualCheckpointIds(valid), ["CP01", "CP02-scroll"]);
});

test("parses the machine-checkable checkpoint semantics", () => {
  assert.deepEqual(parseVisualCheckpointPlan(valid)[1], {
    id: "CP02-scroll",
    kind: "scroll-waypoint",
    requiredVisible: ["Overview passing"],
    minimumTimelineSeconds: 0.5,
    framing: "full-desktop",
  });
});

test("blocks a checkpoint with an unspecified stop or visible state", () => {
  assert.throws(
    () => parseVisualCheckpointIds(valid.replace("1 second | Project title", " | Project title")),
    /fill every column/,
  );
});

test("blocks duplicate checkpoint ids", () => {
  assert.throws(() => parseVisualCheckpointIds(valid.replace("CP02-scroll", "CP01")), /duplicated/);
});
