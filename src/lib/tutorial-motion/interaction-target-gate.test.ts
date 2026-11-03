import assert from "node:assert/strict";
import test from "node:test";

import { auditInteractionTargets } from "./interaction-target-gate";

const target = {
  id: "target",
  type: "video_clip",
  timeline_start: 0,
  duration: 2,
  props: {
    source_width: 720,
    source_height: 1280,
    media_scale: 1,
    media_offset_x: 0,
    media_offset_y: 0,
  },
};

const cursor = (offsetY: number) => ({
  id: "cursor",
  type: "still",
  source_url: "/api/projects/demo/media/tutorial-cursor.png",
  timeline_start: 0,
  duration: 2,
  props: {
    source_width: 256,
    source_height: 256,
    media_scale: 0.1,
    media_offset_x: 0,
    media_offset_y: offsetY,
    interaction_target_contracts: [{
      id: "button",
      label: "Button",
      click_local_seconds: 1,
      target_element_id: "target",
      target_bounds_normalized_source: { x: 0.4, y: 0.45, width: 0.2, height: 0.1 },
      cursor_hotspot_normalized: { x: 0.5, y: 0.5 },
    }],
  },
});

test("passes when the cursor hotspot intersects the measured target", () => {
  const findings = auditInteractionTargets([target, cursor(0)], { width: 720, height: 1280 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.status, "pass");
});

test("fails when the cursor hotspot misses the measured target", () => {
  const findings = auditInteractionTargets([target, cursor(0.5)], { width: 720, height: 1280 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.status, "fail");
  assert.match(findings[0]?.message ?? "", /outside/);
});

test("fails cursor overlays that have no measured target contracts", () => {
  const unmeasured = cursor(0);
  delete (unmeasured.props as Record<string, unknown>).interaction_target_contracts;
  const findings = auditInteractionTargets([target, unmeasured], { width: 720, height: 1280 });
  assert.equal(findings[0]?.status, "fail");
  assert.match(findings[0]?.message ?? "", /not enrolled/);
});
