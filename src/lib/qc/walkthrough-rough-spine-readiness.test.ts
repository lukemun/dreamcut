import assert from "node:assert/strict";
import test from "node:test";

import { assessWalkthroughRoughSpineReadiness } from "@/lib/qc/walkthrough-rough-spine-readiness";

const timelineSha256 = "timeline-sha";
const manifestSha256 = "manifest-sha";
const qualificationSha256 = "qualification-sha";

function validInput(): Parameters<typeof assessWalkthroughRoughSpineReadiness>[0] {
  return {
    projectId: "example",
    productRevision: "revision-1",
    lockedSourceManifestSha256: manifestSha256,
    lockedSourceQualificationSha256: qualificationSha256,
    currentSourceManifestSha256: manifestSha256,
    currentSourceQualificationSha256: qualificationSha256,
    sourceManifest: {
      project_id: "example",
      product_revision: "revision-1",
      sources: [{ id: "capture-a", duration_seconds: 30 }],
    },
    metadata: { output_aspect_ratio: "9:16" },
    expectedOutputAspectRatio: "9:16",
    timeline: {
      elements: [{
        id: "clip-a",
        type: "video_clip",
        source_url: "/media/capture-a.webm",
        timeline_start: 0,
        duration: 4,
        trim_start: 2,
        trim_end: 24,
        playback_rate: 1,
        removed_at: null,
        props: {
          editorial_role: "product-walkthrough-rough-spine",
          beat_label: "Show the real action",
          rough_beat_kind: "motion",
          source_manifest_id: "capture-a",
          source_duration_seconds: 30,
          source_interval: { start_seconds: 2, duration_seconds: 4 },
        },
      }],
    },
    timelineSha256,
    receipt: {
      schema_version: 1,
      project_id: "example",
      verdict: "PASS",
      product_revision: "revision-1",
      source_manifest_sha256: manifestSha256,
      source_qualification_sha256: qualificationSha256,
      timeline_sha256: timelineSha256,
      clip_count: 1,
      duration_seconds: 4,
      narration_status: "not authored",
      captions_status: "not authored",
      camera_status: "not fine-authored",
      normal_speed_watch: { completed: true, verdict: "PASS", timeline_sha256: timelineSha256 },
      motion_review: { scrolling: "N/A", loading: "PASS" },
    },
    receiptSha256: "receipt-sha",
  };
}

test("passes a source-only, hash-bound rough spine", () => {
  const report = assessWalkthroughRoughSpineReadiness(validInput());
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
});

test("blocks when timeline.json is absent", () => {
  const input = validInput();
  input.timeline = null;
  input.timelineSha256 = null;
  const report = assessWalkthroughRoughSpineReadiness(input);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "rough_spine_timeline_missing"));
});

test("blocks a project that is not in the frozen delivery shape", () => {
  const input = validInput();
  input.metadata!.output_aspect_ratio = "16:9";
  const report = assessWalkthroughRoughSpineReadiness(input);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "rough_spine_output_aspect_ratio"));
});

test("blocks a stale receipt and malformed source window", () => {
  const input = validInput();
  input.receipt.timeline_sha256 = "old-timeline";
  input.timeline.elements[0].trim_end = 6;
  const report = assessWalkthroughRoughSpineReadiness(input);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "rough_spine_receipt_timeline"));
  assert.ok(report.findings.some((finding) => finding.code === "rough_spine_trim_contract"));
});

test("blocks stretched loading and premature polish", () => {
  const input = validInput();
  input.timeline.elements[0].playback_rate = 0.8;
  input.timeline.elements[0].duration = 5;
  input.timeline.elements[0].props.rough_beat_kind = "loading";
  input.receipt.duration_seconds = 5;
  input.timeline.elements.push({
    id: "caption",
    type: "caption_text",
    timeline_start: 0,
    duration: 5,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    removed_at: null,
    props: {},
  });
  const report = assessWalkthroughRoughSpineReadiness(input);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "rough_spine_loading_stretched"));
  assert.ok(report.findings.some((finding) => finding.code === "rough_spine_not_source_only"));
});
