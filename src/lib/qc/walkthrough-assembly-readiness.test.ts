import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { assessWalkthroughAssemblyReadiness } from "@/lib/qc/walkthrough-assembly-readiness";

const fixture = JSON.parse(fs.readFileSync(path.join(
  process.cwd(),
  "src/lib/qc/fixtures/product-walkthrough-hidden-scroll-missing-voice.json",
), "utf8"));
const syncFixture = JSON.parse(fs.readFileSync(path.join(
  process.cwd(),
  "src/lib/qc/fixtures/product-walkthrough-narration-screen-sync.json",
), "utf8"));

test("blocks the Gatsby edit that hides the qualified scroll and drops approved voiceover", () => {
  const report = assessWalkthroughAssemblyReadiness({
    ...fixture.input,
    timeline: fixture.baseline,
  });

  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_route_seam_missing"));
  assert.ok(report.findings.some((finding) => finding.code === "assembly_visual_checkpoint_missing"));
  assert.ok(report.findings.some((finding) => finding.code === "assembly_narration_line_missing"));
});

test("still reports visual failures while narration is not yet approved", () => {
  const report = assessWalkthroughAssemblyReadiness({
    ...fixture.input,
    timeline: fixture.baseline,
    approvedNarration: null,
    narrationSha256: null,
    lockedNarrationSha256: null,
    narrationVisualContract: null,
    narrationVisualContractSha256: null,
    lockedNarrationVisualContractSha256: null,
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_narration_missing"));
  assert.ok(report.findings.some((finding) => finding.code === "assembly_route_seam_missing"));
  assert.ok(report.findings.some((finding) => finding.code === "assembly_visual_checkpoint_missing"));
});

test("passes the corrected full-desktop scroll and complete narration mapping", () => {
  const report = assessWalkthroughAssemblyReadiness({
    ...fixture.input,
    timeline: fixture.accepted,
  });

  assert.deepEqual(report, { ok: true, findings: [] });
});

test("blocks a destination-focused crop even when the correct source interval is present", () => {
  const report = assessWalkthroughAssemblyReadiness({ ...fixture.input, timeline: fixture.cropped });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_route_seam_cropped"));
});

test("blocks a qualified scroll compressed below its declared readable duration", () => {
  const report = assessWalkthroughAssemblyReadiness({ ...fixture.input, timeline: fixture.compressed });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_route_seam_compressed"));
});

test("blocks checkpoint metadata that claims footage beyond the clip's actual timeline duration", () => {
  const timeline = structuredClone(fixture.accepted);
  timeline.elements[0].duration = 0.1;
  timeline.elements.push({
    id: "covering-still",
    type: "still",
    timeline_start: 0.1,
    duration: 3,
    removed_at: null,
    props: {},
  });
  const report = assessWalkthroughAssemblyReadiness({ ...fixture.input, timeline });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_visual_checkpoint_outside_clip"));
});

test("blocks a qualified checkpoint when its only timeline clip is disabled", () => {
  const timeline = structuredClone(fixture.accepted);
  timeline.elements[0].props.disabled = true;
  const report = assessWalkthroughAssemblyReadiness({ ...fixture.input, timeline });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_visual_checkpoint_missing"));
});

test("blocks a contact checkpoint without a checkpoint-bound visible pointer", () => {
  const input = structuredClone(fixture.input);
  input.qualification.visual_checkpoints[1].kind = "contact";
  const report = assessWalkthroughAssemblyReadiness({ ...input, timeline: fixture.accepted });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_contact_pointer_missing"));
});

test("passes a contact only when its visible pointer is bound to the same checkpoint interval", () => {
  const input = structuredClone(fixture.input);
  input.qualification.visual_checkpoints[1].kind = "contact";
  const timeline = structuredClone(fixture.accepted);
  timeline.elements[0].props.interaction_target_contracts = [{
    checkpoint_id: "CP05B",
    click_local_seconds: 1,
    pointer_evidence: "reconstructed",
  }];
  const report = assessWalkthroughAssemblyReadiness({ ...input, timeline });
  assert.deepEqual(report, { ok: true, findings: [] });
});

test("blocks a visible pointer whose click lands outside its approved contact interval", () => {
  const input = structuredClone(fixture.input);
  input.qualification.visual_checkpoints[1].kind = "contact";
  const timeline = structuredClone(fixture.accepted);
  timeline.elements[0].props.interaction_target_contracts = [{
    checkpoint_id: "CP05B",
    click_local_seconds: 2.8,
    pointer_evidence: "native-visible",
  }];
  const report = assessWalkthroughAssemblyReadiness({ ...input, timeline });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_contact_pointer_outside_checkpoint"));
});

test("blocks narration that explains a state before it exists and an action long before it occurs", () => {
  const report = assessWalkthroughAssemblyReadiness({ ...syncFixture.input, timeline: syncFixture.baseline });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_narration_action_drift"));
  assert.ok(report.findings.some((finding) => finding.code === "assembly_narration_prerequisite_early"));
});

test("passes narration aligned to its visual prerequisite and action anchors", () => {
  const report = assessWalkthroughAssemblyReadiness({ ...syncFixture.input, timeline: syncFixture.accepted });
  assert.deepEqual(report, { ok: true, findings: [] });
});

function creatorPerformanceTimeline() {
  const timeline = structuredClone(syncFixture.accepted);
  timeline.elements = timeline.elements.filter((element: { type?: string }) => element.type !== "vo_segment");
  timeline.elements.push(
    {
      id: "creator-upload",
      type: "video_clip",
      lane_key: "visual_presenter",
      timeline_start: 12,
      duration: 3,
      playback_rate: 1,
      source_url: "/media/creator.mp4",
      removed_at: null,
      props: {
        script_line_number: 1,
        transcript: "Choose Use a book and upload your manuscript.",
        synchronized_av_unit: true,
        edit_unit_contract: "Picture and embedded voice split, trim, move, and delete together.",
        creator_speech_intervals: [{ start_seconds: 0.1, end_seconds: 2.9 }],
      },
    },
    {
      id: "creator-brief",
      type: "video_clip",
      lane_key: "visual_presenter",
      timeline_start: 30,
      duration: 3,
      playback_rate: 1,
      source_url: "/media/creator.mp4",
      removed_at: null,
      props: {
        script_line_number: 2,
        transcript: "Now build the character brief.",
        synchronized_av_unit: true,
        edit_unit_contract: "Picture and embedded voice split, trim, move, and delete together.",
        creator_speech_intervals: [{ start_seconds: 0.1, end_seconds: 2.9 }],
      },
    },
  );
  return timeline;
}

test("passes approved narration mounted as synchronized creator picture and voice", () => {
  const report = assessWalkthroughAssemblyReadiness({
    ...syncFixture.input,
    timeline: creatorPerformanceTimeline(),
  });
  assert.deepEqual(report, { ok: true, findings: [] });
});

test("passes one approved creator line split into ordered synchronized edit pieces", () => {
  const timeline = creatorPerformanceTimeline();
  const creator = timeline.elements.find((element: { id?: string }) => element.id === "creator-upload");
  creator.duration = 1.5;
  creator.props.transcript = "Choose Use a book";
  creator.props.creator_speech_intervals = [{ start_seconds: 0.1, end_seconds: 1.4 }];
  timeline.elements.push({
    ...structuredClone(creator),
    id: "creator-upload-piece-2",
    timeline_start: 13.5,
    props: {
      ...structuredClone(creator.props),
      transcript: "and upload your manuscript.",
    },
  });
  const report = assessWalkthroughAssemblyReadiness({ ...syncFixture.input, timeline });
  assert.deepEqual(report, { ok: true, findings: [] });
});

test("blocks an unplanned internal no-speech interval in a creator clip", () => {
  const timeline = creatorPerformanceTimeline();
  const creator = timeline.elements.find((element: { id?: string }) => element.id === "creator-upload");
  creator.props.creator_speech_intervals = [
    { start_seconds: 0.1, end_seconds: 0.8 },
    { start_seconds: 2, end_seconds: 2.9 },
  ];
  const report = assessWalkthroughAssemblyReadiness({ ...syncFixture.input, timeline });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_creator_internal_silence"));
});

test("blocks creator footage whose embedded voice is not one synchronized edit unit", () => {
  const timeline = creatorPerformanceTimeline();
  const creator = timeline.elements.find((element: { id?: string }) => element.id === "creator-upload");
  creator.props.synchronized_av_unit = false;
  const report = assessWalkthroughAssemblyReadiness({ ...syncFixture.input, timeline });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_creator_av_not_synchronized"));
});

test("blocks a hidden separate voice clock overlapping synchronized creator audio", () => {
  const timeline = creatorPerformanceTimeline();
  timeline.elements.push({
    id: "hidden-duplicate-voice",
    type: "vo_segment",
    timeline_start: 12,
    duration: 3,
    source_url: "/media/creator-audio.m4a",
    removed_at: null,
    props: {
      script_line_number: 1,
      transcript: "Choose Use a book and upload your manuscript.",
    },
  });
  const report = assessWalkthroughAssemblyReadiness({ ...syncFixture.input, timeline });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "assembly_creator_voice_topology_conflict"));
});
