import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sweepProposalDials } from "@/lib/agent/proposal-dial-sweep";
import { applyProposalReviewOverrides } from "@/lib/agent/proposal-overrides";
import { reviewOption } from "@/lib/agent/proposal-review";
import { defaultReviewControls, previewEditorAgentProposal, timelineRevision, validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { writePreparation } from "@/lib/local-store/media-preparation";
import { projectMediaDir } from "@/lib/local-store/paths";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-speed-step-dials-"));

const projectId = "speed-step-dials";
const JUMP = "11111111-1111-4111-8111-111111111111", SPLASH = "22222222-2222-4222-8222-222222222222";
const media = `/api/projects/${projectId}/media/sources`;
const now = "2026-11-02T00:00:00.000Z";

createProject(projectId, "web");
for (const [name, duration] of [["jump.mp4", 6.266667], ["splash.wav", 0.611823]] as const) {
  const source = `sources/${name}`, file = path.join(projectMediaDir(projectId), source), preview = `${source}.preview.mp4`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "fixture media");
  fs.writeFileSync(path.join(projectMediaDir(projectId), preview), "fixture proxy");
  const stat = fs.statSync(file);
  writePreparation(projectId, { recipe: "editor-media-v1", source, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview, render: source, duration });
}
// The Cup Jump take placed unchanged, as an assembly hands it off.
writeTimeline(projectId, { elements: [{
  id: JUMP, project_id: projectId, type: "video_clip", source_url: `${media}/jump.mp4`, props: { source_duration_seconds: 6.266667 },
  beat_id: null, character_id: null, timeline_start: 0, duration: 6.266667, lane_key: "visual_0", lane_index: 0, trim_start: 0, trim_end: 0,
  volume: 0, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
} as TimelineElement], transitions: [] }, "fixture");

function card(operations: unknown[], review_controls?: unknown[]) {
  return validateEditorAgentProposalAgainstProject({ schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "He jumps and speeds up.", assumptions: [], unresolved_gaps: [],
    options: [{ id: "a", label: "Jump", recommended: true, summary: "Jump at normal speed, then faster.", operations, ...(review_controls ? { review_controls } : {}) }] }, 50, projectId);
}

// Jump take 3.5-5.0 s: 1x until 4.6 s, then 1.5x (1.1 s + 0.2667 s on screen).
const stepped = { element_id: JUMP, patch: { timeline_start: 0, trim_start: 3.5, trim_end: 1.266667, duration: 1.366667, playback_rate: 1 }, props: { playback_speed_steps: [{ source_t: 4.6, v: 1.5 }] } };
const splash = (extra: Record<string, unknown> = {}) => ({ element_id: SPLASH, create_audio: { type: "sound_effect", source_url: `${media}/splash.wav`, timeline_start: 1.333333,
  source_duration_seconds: 0.611823, source_start_seconds: 0, source_end_seconds: 0.611823, lane_key: "sound_effect_0", lane_index: 0, volume: 1, ...extra } });

test("trim and speed dials on a speed-stepped clip recompute its length from the steps", () => {
  const proposal = card([stepped]);
  const timeline = readTimeline(projectId);
  const tuned = (field: string, value: number) => {
    const next = applyProposalReviewOverrides(proposal, "a", [{ operation_index: 0, target: "patch", field, value }] as Parameters<typeof applyProposalReviewOverrides>[2], timeline);
    previewEditorAgentProposal(next, "a", timeline);
    return next.options[0]!.operations[0]!.patch!;
  };
  // Starting 0.5 s earlier at 1x adds 0.5 s on screen; the start stays put.
  assert.deepEqual([tuned("trim_start", 3).duration, tuned("trim_start", 3).timeline_start], [1.866667, 0]);
  // Ending 0.3 s later at 1.5x adds 0.2 s.
  assert.equal(tuned("trim_end", 0.966667).duration, 1.566667);
  // The first part at 2x halves its 1.1 s.
  assert.equal(tuned("playback_rate", 2).duration, 0.816667);
});

test("a speed-stepped clip's trims stop a frame short of its steps, and every slider end previews", async () => {
  const proposal = card([stepped]);
  const timeline = readTimeline(projectId);
  const changes = reviewOption(timeline, proposal.options[0]!).adjustment_rows.flatMap(row => row.changes);
  assert.deepEqual(changes.find(change => change.field === "trim_start")?.control_range, { min: 0, max: 4.567 });
  assert.deepEqual(changes.find(change => change.field === "trim_end")?.control_range, { min: 0, max: 1.633 });
  const sweep = await sweepProposalDials(projectId, timeline, proposal, 60_000);
  assert.deepEqual(sweep.failures, []);
  assert.equal(sweep.unchecked, 0);
});

test("a new sound's start is a dial: Advanced by default, main when asked, and it moves the sound", async () => {
  const timeline = readTimeline(projectId);
  assert.ok(!defaultReviewControls([splash()]).some(ref => ref.field === "timeline_start"), "not a main dial unless the agent leads with it");
  const proposal = card([stepped, splash()], [{ operation_index: 1, target: "create_audio", field: "timeline_start" }]);
  const option = proposal.options[0]!;
  assert.ok(option.review_controls?.some(ref => ref.target === "create_audio" && ref.field === "timeline_start"), "kept as a main dial");
  const start = reviewOption(timeline, option).adjustment_rows.flatMap(row => row.changes).find(change => change.target === "create_audio" && change.field === "timeline_start");
  assert.ok(start?.control_range && start.control_range.min < 1.333333 && start.control_range.max > 1.333333);
  const moved = applyProposalReviewOverrides(proposal, "a", [{ operation_index: 1, target: "create_audio", field: "timeline_start", value: 1.5 }] as Parameters<typeof applyProposalReviewOverrides>[2], timeline);
  const sound = previewEditorAgentProposal(moved, "a", timeline).timeline.elements.find(element => element.id === SPLASH);
  assert.equal(sound?.timeline_start, 1.5);
  assert.deepEqual((await sweepProposalDials(projectId, timeline, proposal, 60_000)).failures, []);
});

test("a sound linked to its picture has no start dial of its own", () => {
  const timeline = readTimeline(projectId);
  const proposal = card([stepped, splash({ follows_visual: { element_id: JUMP, offset_seconds: 1.333333 } })]);
  const changes = reviewOption(timeline, proposal.options[0]!).adjustment_rows.flatMap(row => row.changes);
  assert.ok(!changes.some(change => change.target === "create_audio" && change.field === "timeline_start"));
  assert.throws(() => applyProposalReviewOverrides(proposal, "a", [{ operation_index: 1, target: "create_audio", field: "timeline_start", value: 1.5 }] as Parameters<typeof applyProposalReviewOverrides>[2], timeline), /moves with its picture/);
});
