import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectVersionFamily } from "@/lib/local-store/project-versions";
import type { ProjectMetadata } from "@/lib/local-store/store";

const baseMetadata: ProjectMetadata = {
  lane_order_keys: [],
  lane_defaults: {},
  muted_lane_keys: [],
  output_aspect_ratio: "9:16",
  delivery_target: "reels",
  caption_safe_area_mode: "paid_ad",
};

test("buildProjectVersionFamily returns only members of the current version group in display order", () => {
  const projects = [
    {
      projectId: "alternate",
      metadata: { ...baseMetadata, version_group_id: "hand-swipe", version_label: "Alternate take", version_order: 2 },
    },
    {
      projectId: "unrelated",
      metadata: { ...baseMetadata, version_group_id: "another-edit", version_label: "Unrelated", version_order: 1 },
    },
    {
      projectId: "primary",
      metadata: { ...baseMetadata, version_group_id: "hand-swipe", version_label: "Primary take", version_order: 1 },
    },
  ];

  assert.deepEqual(
    buildProjectVersionFamily("primary", projects[2].metadata, projects),
    [
      { projectId: "primary", label: "Primary take", title: "primary", order: 1 },
      { projectId: "alternate", label: "Alternate take", title: "alternate", order: 2 },
    ],
  );
});

test("buildProjectVersionFamily falls back to the current project when it has no group", () => {
  assert.deepEqual(
    buildProjectVersionFamily("solo", { ...baseMetadata, title: "Solo edit" }, [
      { projectId: "solo", metadata: { ...baseMetadata, title: "Solo edit" } },
      { projectId: "other", metadata: { ...baseMetadata, title: "Other edit" } },
    ]),
    [{ projectId: "solo", label: "Solo edit", title: "Solo edit", order: Number.MAX_SAFE_INTEGER }],
  );
});
