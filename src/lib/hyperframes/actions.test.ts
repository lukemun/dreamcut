import assert from "node:assert/strict";
import test from "node:test";

import { hyperframesOverlayCliArgs, parseHyperframesActionRequest } from "./actions";

test("requires explicit approval for a HyperFrames render", () => {
  assert.throws(() => parseHyperframesActionRequest({
    action: "render_approved",
    composition_id: "hook-title",
  }), /explicit preview approval/);

  assert.deepEqual(parseHyperframesActionRequest({
    action: "render_approved",
    composition_id: "hook-title",
    approved: true,
  }), {
    action: "render_approved",
    composition_id: "hook-title",
    approved: true,
  });
});

test("rejects unsafe composition ids before constructing CLI arguments", () => {
  assert.throws(() => parseHyperframesActionRequest({
    action: "check",
    composition_id: "../outside",
  }), /letters, numbers/);
  assert.throws(() => parseHyperframesActionRequest({
    action: "check",
    composition_id: "..",
  }), /letters, numbers/);
});

test("maps a create action to the project-local overlay command", () => {
  const request = parseHyperframesActionRequest({
    action: "create",
    composition_id: "hook-title",
    resolution: "portrait",
  });
  assert.deepEqual(hyperframesOverlayCliArgs(request, "demo"), [
    "hyperframes-overlay",
    "scaffold",
    "demo",
    "hook-title",
    "--resolution",
    "portrait",
  ]);
});
