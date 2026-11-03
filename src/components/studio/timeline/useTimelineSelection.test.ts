import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeSelectedIds,
  sanitizeSelectedTransitionId,
  selectActiveTimelineTransition,
} from "@/components/studio/timeline/useTimelineSelection";
import type { TimelineTransition } from "@/components/studio/timeline/types";

function buildTransition(overrides: Partial<TimelineTransition> = {}): TimelineTransition {
  return {
    id: overrides.id ?? "tr-1",
    project_id: "project-1",
    from_element_id: overrides.from_element_id ?? "el-1",
    to_element_id: overrides.to_element_id ?? "el-2",
    type: overrides.type ?? "fade",
    duration_seconds: overrides.duration_seconds ?? 0.5,
    params: overrides.params ?? null,
    removed_at: overrides.removed_at ?? null,
    removed_reason: overrides.removed_reason ?? null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  };
}

test("sanitizeSelectedIds drops ids that no longer exist", () => {
  assert.deepEqual(
    sanitizeSelectedIds(["el-1", "el-2", "el-3"], new Set(["el-1", "el-3"])),
    ["el-1", "el-3"],
  );
});

test("sanitizeSelectedTransitionId clears missing, removed, or inactive transitions", () => {
  const transitions = [
    buildTransition({ id: "tr-active" }),
    buildTransition({ id: "tr-removed", removed_at: "2026-03-20T00:00:01.000Z", removed_reason: "user" }),
  ];

  assert.equal(
    sanitizeSelectedTransitionId("tr-active", transitions, new Set(["tr-active"])),
    "tr-active",
  );
  assert.equal(
    sanitizeSelectedTransitionId("tr-active", transitions, new Set()),
    null,
  );
  assert.equal(
    sanitizeSelectedTransitionId("tr-removed", transitions, new Set(["tr-removed"])),
    null,
  );
  assert.equal(
    sanitizeSelectedTransitionId("tr-missing", transitions, new Set(["tr-missing"])),
    null,
  );
});

test("selectActiveTimelineTransition only returns active rendered transitions", () => {
  const transitions = [
    buildTransition({ id: "tr-active" }),
    buildTransition({ id: "tr-hidden" }),
  ];

  assert.equal(
    selectActiveTimelineTransition(transitions, "tr-active", new Set(["tr-active"]))?.id,
    "tr-active",
  );
  assert.equal(
    selectActiveTimelineTransition(transitions, "tr-hidden", new Set(["tr-active"])),
    null,
  );
});
