import assert from "node:assert/strict";
import test from "node:test";

import { explainNoTimelineFailure, explainObjectProbeFailure, isNoTimelineFailure } from "@/lib/hyperframes/check-failure";

const failure = "HyperFrames command failed: check\nRuntime\n✗ check_runtime_failure: Could not determine composition duration — no layout samples run";

test("a check that cannot find the duration names the page error behind it", () => {
  assert.equal(isNoTimelineFailure(failure), true);
  assert.equal(isNoTimelineFailure("Contrast ✗ 1.27:1 (need 3:1)"), false);
  const explained = explainNoTimelineFailure(failure, { timeline: false, page_errors: ["Cannot read properties of undefined (reading 'inks')", "Cannot read properties of undefined (reading 'inks')"] });
  assert.match(explained, /The page threw before its "main" timeline was registered/);
  assert.equal(explained.split("reading 'inks'").length - 1, 1, "repeated errors are listed once");
  assert.match(explained, /look-bundle\.ts/);
  assert.match(explainNoTimelineFailure(failure, { timeline: false, page_errors: [] }), /never set window\.__timelines\["main"\]/);
  assert.equal(explainNoTimelineFailure(failure, null), failure);
});

test("an object check that times out says the page cannot fetch from disk", () => {
  const timeout = "page.waitForFunction: Timeout 15000ms exceeded.";
  assert.match(explainObjectProbeFailure(timeout), /<script src>/);
  assert.equal(explainObjectProbeFailure("Executable doesn't exist"), "Executable doesn't exist");
});
