import assert from "node:assert/strict";
import test from "node:test";

import {
  boundaryIntegrityReceiptFindings,
  classifyUniformBlackRgb,
  walkthroughBoundarySamples,
} from "@/lib/qc/walkthrough-boundary-integrity";

test("samples frames around every product boundary and pointer contact", () => {
  const samples = walkthroughBoundarySamples([{
    id: "product",
    type: "video_clip",
    lane_key: "visual_0",
    timeline_start: 1,
    duration: 2,
    removed_at: null,
    props: {
      interaction_target_contracts: [{ click_local_seconds: 1 }],
    },
  }, {
    id: "product-2",
    type: "video_clip",
    lane_key: "visual_0",
    timeline_start: 3,
    duration: 1,
    removed_at: null,
    props: {},
  }]);
  const frames = samples.map((sample) => Math.round(sample.atSeconds * 30));
  assert.deepEqual(frames, [59, 60, 61, 89, 90, 91]);
  assert.equal(samples.find((sample) => Math.round(sample.atSeconds * 30) === 60)?.reason, "contact");
});

test("uniform black is blocked while a dark structured frame remains valid", () => {
  assert.equal(classifyUniformBlackRgb(Buffer.alloc(300, 0)).black, true);
  const structured = Buffer.from(Array.from({ length: 300 }, (_, index) => index % 6 < 3 ? 2 : 30));
  assert.equal(classifyUniformBlackRgb(structured).black, false);
});

test("boundary receipt must bind the current project and timeline", () => {
  const sample = {
    atSeconds: 2,
    reason: "contact",
    black: false,
    meanLuma: 120,
    lumaStdDev: 20,
    still_path: "review/frame.png",
    still_sha256: "a".repeat(64),
  } as const;
  assert.deepEqual(boundaryIntegrityReceiptFindings({
    schema_version: 1,
    project_id: "tutorial",
    timeline_sha256: "current",
    verdict: "PASS",
    samples: [sample],
  }, { projectId: "tutorial", timelineSha256: "current" }), []);

  assert.deepEqual(boundaryIntegrityReceiptFindings({
    schema_version: 1,
    project_id: "tutorial",
    timeline_sha256: "old",
    verdict: "PASS",
    samples: [{ ...sample, black: true }],
  }, { projectId: "tutorial", timelineSha256: "current" }), [
    "timeline hash is stale",
    "a boundary/contact frame has a uniform-black product region",
    "one or more boundary/contact samples are incomplete or unresolved",
  ]);
});
