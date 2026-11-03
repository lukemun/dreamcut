import assert from "node:assert/strict";
import test from "node:test";
import { previewPreparationAtTime } from "./usePreviewReadiness";

test("preparation gates only active clips, including exact cut boundaries", () => {
  const elements = [
    { type: "video_clip", timeline_start: 0, duration: 2, props: { runtime_preview_preparation: { state: "ready", upgrade_state: "preparing" } } },
    { type: "video_clip", timeline_start: 2, duration: 1, props: { runtime_preview_preparation: { state: "preparing" } } },
    { type: "video_clip", timeline_start: 3, duration: 1, props: { runtime_preview_preparation: { state: "failed", error: "Missing proxy" } } },
    { type: "video_clip", timeline_start: 0, duration: 10, removed_at: "removed", props: { runtime_preview_preparation: { state: "failed" } } },
  ];
  assert.deepEqual(previewPreparationAtTime(elements, 1), { preparationPendingCount: 0, preparationError: null });
  assert.deepEqual(previewPreparationAtTime(elements, 2), { preparationPendingCount: 1, preparationError: null });
  assert.deepEqual(previewPreparationAtTime(elements, 3), { preparationPendingCount: 0, preparationError: "Missing proxy" });
  assert.deepEqual(previewPreparationAtTime(elements, 4), { preparationPendingCount: 0, preparationError: null });
});
