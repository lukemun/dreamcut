import assert from "node:assert/strict";
import test from "node:test";

import type { GenerationJobSnapshot } from "@/lib/generation/jobs-client";
import { selectExportRenderJob } from "./export-render-job";

const finished: GenerationJobSnapshot = { id: "old", status: "completed", statusLabel: "Completed", progress: 1, targetType: "render" };
const running: GenerationJobSnapshot = { id: "new", status: "processing", statusLabel: "Rendering frames", progress: 0.2, targetType: "render" };

test("a re-export never shows the previous export's Completed while its own job is pending", () => {
  // Start clears the tracked id; the tracker still holds the finished job.
  assert.equal(selectExportRenderJob({ old: finished }, null), null);
  // The new job id is known before the tracker has fetched it.
  assert.equal(selectExportRenderJob({ old: finished }, "new"), null);
});

test("the export's own job wins once the tracker has it", () => {
  assert.equal(selectExportRenderJob({ old: finished, new: running }, "new"), running);
  assert.equal(selectExportRenderJob({ old: finished }, "old"), finished);
});

test("a render started elsewhere shows while it runs", () => {
  assert.equal(selectExportRenderJob({ old: finished, new: running }, null), running);
  assert.equal(selectExportRenderJob({ other: { ...running, targetType: "image" } }, null), null);
});

test("unapproved previews never become export progress or completion, including a stale tracked id", () => {
  for (const status of ["processing", "completed", "canceled", "failed"] as const) {
    const preview: GenerationJobSnapshot = { ...running, id: "preview", targetType: "proposal_preview", status,
      statusLabel: "Unapproved preview" };
    assert.equal(selectExportRenderJob({ preview }, null), null);
    assert.equal(selectExportRenderJob({ preview }, preview.id), null);
    assert.equal(selectExportRenderJob({ preview, new: running }, null), running);
    assert.equal(selectExportRenderJob({ preview, old: finished }, finished.id), finished);
  }
});
