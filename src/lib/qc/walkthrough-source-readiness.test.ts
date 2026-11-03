import assert from "node:assert/strict";
import test from "node:test";

import { assessWalkthroughSourceReadiness } from "@/lib/qc/walkthrough-source-readiness";

type RouteContinuity = NonNullable<
  NonNullable<Parameters<typeof assessWalkthroughSourceReadiness>[0]["qualification"]>["route_continuity"]
>[number];

function passingQualification() {
  return {
    schema_version: 1,
    project_id: "example",
    verdict: "PASS",
    product_revision: { id: "abc123", routes: ["/dashboard"], current: true },
    normal_speed_watch: { completed: true, verdict: "PASS" },
    script_plan_sha256: "plan-hash",
    visual_checkpoints: [{
      id: "CP01",
      kind: "stop",
      source_id: "capture-1",
      source_start_seconds: 10,
      source_end_seconds: 11.5,
      frame: "checkpoint.png",
      state_matches_claim: true,
      required_visible: ["Brief"],
      minimum_timeline_seconds: 1,
      framing: "target-centered",
      verdict: "PASS",
    }],
    beats: [{
      id: "open-brief",
      pre_contact: { frame: "pre.png", state_matches_claim: true },
      contact: { frame: "contact.png", target_intersection: "PASS" },
      response: { frame: "response.png", latency_seconds: 0.2, visibly_differs: true },
      result: { frame: "result.png", hold_seconds: 1.5 },
      regions: [{ label: "Brief", center_delta_x_phone: 12, center_delta_y_phone: -20 }],
    }],
    route_continuity: [] as RouteContinuity[],
    generation: {
      response_latency_seconds: 0.3,
      progress_duration_seconds: 1.2,
      requested_count: 2,
      completed_count: 2,
      fresh_result_ids: ["new-1", "new-2"],
    },
  };
}

const manifestSha = "a".repeat(64);
const qualificationSha = "b".repeat(64);
const passingManifest = {
  project_id: "example",
  sources: [{ id: "capture-1", path: "capture.webm", duration_seconds: 30 }],
};
const expectedCheckpoint = {
  id: "CP01",
  kind: "stop" as const,
  requiredVisible: ["Brief"],
  minimumTimelineSeconds: 1,
  framing: "target-centered" as const,
};
const atlasFrameFiles = new Set(["atlas/1.jpg", "atlas/2.jpg", "atlas/3.jpg", "atlas/4.jpg"]);

function passingCaptureFrameAtlas() {
  return {
    schema_version: 1,
    project_id: "example",
    source_manifest_sha256: manifestSha,
    source_qualification_sha256: qualificationSha,
    max_sample_gap_seconds: 0.5,
    checkpoints: [{
      id: "CP01",
      source_id: "capture-1",
      source_start_seconds: 10,
      source_end_seconds: 11.5,
      frames: [
        { source_seconds: 10, path: "atlas/1.jpg" },
        { source_seconds: 10.5, path: "atlas/2.jpg" },
        { source_seconds: 11, path: "atlas/3.jpg" },
        { source_seconds: 11.499, path: "atlas/4.jpg" },
      ],
    }],
  };
}

function passingSourceGrade() {
  return [
    "# Walkthrough source grade — example",
    "",
    "Overall: PASS",
    "Grader context: fresh-read-only",
    "Project revision: abc123",
    `Source manifest SHA-256: ${manifestSha}`,
    `Qualification SHA-256: ${qualificationSha}`,
    "Normal-speed watch: PASS",
    "",
    "| Source veto | Verdict | Evidence |",
    "| --- | --- | --- |",
    "| Product contract | PASS | current |",
    "| Action causal chain | PASS | current |",
    "| Phone framing feasibility | PASS | current |",
    "| Result payoff | PASS | current |",
  ].join("\n");
}

test("passes a complete source qualification", () => {
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification: passingQualification(),
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
    captureFrameAtlas: passingCaptureFrameAtlas(),
    atlasFrameFiles,
  });
  assert.equal(report.ok, true);
});

test("blocks missing authority artifacts", () => {
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: null,
    qualification: null,
    sourceGrade: null,
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
    captureFrameAtlas: passingCaptureFrameAtlas(),
    atlasFrameFiles,
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings.map((finding) => finding.code), [
    "source_manifest_missing",
    "source_qualification_missing",
  ]);
});

test("blocks late-discovered source failures", () => {
  const qualification = passingQualification();
  qualification.beats[0].pre_contact.state_matches_claim = false;
  qualification.beats[0].regions[0].center_delta_x_phone = 178;
  qualification.generation.response_latency_seconds = 2;
  qualification.generation.progress_duration_seconds = 0.3;
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification,
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "pre_action_state_unqualified"));
  assert.ok(report.findings.some((finding) => finding.code === "semantic_region_off_center"));
  assert.ok(report.findings.some((finding) => finding.code === "generation_response_late"));
  assert.ok(report.findings.some((finding) => finding.code === "generation_progress_too_short"));
});

test("blocks a self-authored qualification without a current independent source grade", () => {
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification: passingQualification(),
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade().replace(qualificationSha, "c".repeat(64)),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "source_grade_qualification_stale"));
});

test("blocks adjacent beats without a receipt-bound continuous bridge", () => {
  const qualification = passingQualification();
  qualification.beats.push({
    id: "generate",
    pre_contact: { frame: "generate-pre.png", state_matches_claim: true },
    contact: { frame: "generate-contact.png", target_intersection: "PASS" },
    response: { frame: "generate-response.png", latency_seconds: 0.2, visibly_differs: true },
    result: { frame: "generate-result.png", hold_seconds: 1.5 },
    regions: [{ label: "Generate", center_delta_x_phone: 10, center_delta_y_phone: 12 }],
  });

  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification,
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
  });

  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "route_continuity_missing"));
  assert.ok(report.findings.some((finding) => finding.code === "route_continuity_unqualified"));
});

test("accepts a receipt-bound bridge for each adjacent beat seam", () => {
  const qualification = passingQualification();
  qualification.beats.push({
    id: "generate",
    pre_contact: { frame: "generate-pre.png", state_matches_claim: true },
    contact: { frame: "generate-contact.png", target_intersection: "PASS" },
    response: { frame: "generate-response.png", latency_seconds: 0.2, visibly_differs: true },
    result: { frame: "generate-result.png", hold_seconds: 1.5 },
    regions: [{ label: "Generate", center_delta_x_phone: 10, center_delta_y_phone: 12 }],
  });
  qualification.route_continuity.push({
    from_beat_id: "open-brief",
    to_beat_id: "generate",
    source_id: "capture-1",
    source_start_seconds: 12.4,
    source_end_seconds: 15.2,
    entry_state_matches: true,
    exit_state_matches: true,
    verdict: "PASS",
  });

  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification,
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
    captureFrameAtlas: passingCaptureFrameAtlas(),
    atlasFrameFiles,
  });

  assert.equal(report.ok, true);
});

test("blocks a missing dense capture frame atlas", () => {
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification: passingQualification(),
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
    captureFrameAtlas: null,
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "capture_frame_atlas_missing"));
});

test("blocks sparse atlas coverage", () => {
  const atlas = passingCaptureFrameAtlas();
  atlas.checkpoints[0].frames = [
    { source_seconds: 10, path: "atlas/1.jpg" },
    { source_seconds: 11.499, path: "atlas/missing.jpg" },
  ];
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification: passingQualification(),
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
    captureFrameAtlas: atlas,
    atlasFrameFiles,
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "capture_frame_atlas_sparse"));
});

test("blocks atlas entries whose extracted frame file is absent", () => {
  const atlas = passingCaptureFrameAtlas();
  atlas.checkpoints[0].frames[2].path = "atlas/missing.jpg";
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification: passingQualification(),
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
    captureFrameAtlas: atlas,
    atlasFrameFiles,
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "capture_frame_atlas_file_missing"));
});

test("blocks capture qualification when an approved visual checkpoint is missing", () => {
  const qualification = passingQualification();
  qualification.visual_checkpoints = [];

  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification,
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
  });

  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "visual_checkpoint_missing"));
});

test("blocks qualification that is not bound to the approved checkpoint plan", () => {
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification: passingQualification(),
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "new-plan-hash",
    currentScriptPlanSha256: "new-plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
  });

  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "visual_checkpoint_plan_stale"));
});

test("blocks source promotion after the checkpoint plan changes without fresh approval", () => {
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification: passingQualification(),
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "edited-plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
  });

  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "visual_checkpoint_plan_unapproved_change"));
});

test("blocks a checkpoint bound to a source absent from the manifest", () => {
  const qualification = passingQualification();
  qualification.visual_checkpoints[0].source_id = "invented-source";
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification,
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [expectedCheckpoint],
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "visual_checkpoint_source_missing"));
});

test("blocks qualification semantics that differ from the approved checkpoint row", () => {
  const qualification = passingQualification();
  qualification.visual_checkpoints[0].kind = "stop";
  const report = assessWalkthroughSourceReadiness({
    projectId: "example",
    sourceManifest: passingManifest,
    sourceManifestSha256: manifestSha,
    qualification,
    qualificationSha256: qualificationSha,
    sourceGrade: passingSourceGrade(),
    approvedScriptPlanSha256: "plan-hash",
    currentScriptPlanSha256: "plan-hash",
    requiredCheckpointIds: ["CP01"],
    requiredCheckpoints: [{ ...expectedCheckpoint, kind: "scroll-waypoint" }],
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "visual_checkpoint_plan_mismatch"));
});
