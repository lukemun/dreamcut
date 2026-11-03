import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sweepProposalDials } from "@/lib/agent/proposal-dial-sweep";
import { preparedMaskSourceBounds } from "@/lib/agent/proposal-subject-window-range";
import { applyProposalReviewOverrides } from "@/lib/agent/proposal-overrides";
import { reviewOption } from "@/lib/agent/proposal-review";
import { previewEditorAgentProposal, timelineRevision, validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { internalGridMatteDirectory } from "@/lib/local-store/internal-masks";
import { writePreparation } from "@/lib/local-store/media-preparation";
import { projectMediaDir } from "@/lib/local-store/paths";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { subjectWindowCoveredSource } from "@/lib/timeline/subject-window";
import type { TimelineElement } from "@/components/studio/timeline/types";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-subject-window-range-"));

const projectId = "subject-window-range";
const TAKE = "11111111-1111-4111-8111-111111111111", POND = "22222222-2222-4222-8222-222222222222";
const SUBJECT = "33333333-3333-4333-8333-333333333333", FILL = "44444444-4444-4444-8444-444444444444";
const media = `/api/projects/${projectId}/media/sources`;
// A cut-out of the used window plus handles: take seconds 3-7 of a 10 s recording.
const mask = { source_url: `/api/projects/${projectId}/media/grid-mattes/cut-1`, source_start_seconds: 3, fps: 30, frame_count: 120, width: 96, height: 54, source_sha256: "a".repeat(64) };
const now = "2026-11-02T00:00:00.000Z";
function clip(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  return { id, project_id: projectId, type: "video_clip", source_url: `${media}/${id}.mp4`,
    props: { source_duration_seconds: 10 }, beat_id: null, character_id: null, timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0,
    trim_start: 4, trim_end: 2, volume: 0, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false, removed_at: null,
    removed_reason: null, created_at: now, updated_at: now, ...overrides } as TimelineElement;
}

createProject(projectId, "web");
for (const [name, duration] of [["take.mov", 10], ["pond.mp4", 30]] as const) {
  const source = `sources/${name}`, file = path.join(projectMediaDir(projectId), source), preview = `${source}.preview.mp4`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "fixture video");
  fs.writeFileSync(path.join(projectMediaDir(projectId), preview), "fixture proxy");
  const stat = fs.statSync(file);
  writePreparation(projectId, { recipe: "editor-media-v1", source, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview, render: source, duration });
}
writeTimeline(projectId, { elements: [
  clip(SUBJECT),
  clip(FILL, { lane_key: "visual_1", lane_index: 1, trim_start: 0, trim_end: 6, props: { source_duration_seconds: 10, subject_window_parent_id: SUBJECT, subject_window_mask: mask } }),
], transitions: [] }, "fixture");
fs.mkdirSync(path.join(internalGridMatteDirectory(projectId), "cut-1"), { recursive: true });
fs.writeFileSync(path.join(internalGridMatteDirectory(projectId), "cut-1", "manifest.json"), JSON.stringify({ binding: mask, masks: [] }));

const covered = subjectWindowCoveredSource(mask, 30);

function card(operations: unknown[]) {
  return validateEditorAgentProposalAgainstProject({ schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Pond on the floor.", assumptions: [], unresolved_gaps: [],
    options: [{ id: "a", label: "Pond", recommended: true, summary: "Pond inside the floor cut-out.", operations }] }, 50, projectId);
}

// The House Pond card: the take and a pond windowed by the take's floor cut-out, both added by the card.
const createCard = () => card([
  { element_id: TAKE, create_visual: { type: "video_clip", source_url: `${media}/take.mov`, timeline_start: 10, source_duration_seconds: 10, source_start_seconds: 4, source_end_seconds: 6, lane_key: "visual_2", lane_index: 2, volume: 1 } },
  { element_id: POND, create_visual: { type: "video_clip", source_url: `${media}/pond.mp4`, timeline_start: 10, source_duration_seconds: 30, source_start_seconds: 0, source_end_seconds: 2, lane_key: "visual_3", lane_index: 3, volume: 0,
    subject_window_parent_id: TAKE, subject_window_mask: mask, subject_window_mode: "inside" } },
]);

test("the covered source window sits half a frame inside the cut-out's ends", () => {
  assert.deepEqual(covered, { start: 3.017, end: 6.983 });
});

test("a created subject clip's Source in/out stop at its partial cut-out's ends, and every slider end previews", async () => {
  const proposal = createCard();
  const option = proposal.options[0]!;
  const timeline = readTimeline(projectId);
  const take = reviewOption(timeline, option).adjustment_rows.flatMap(row => row.changes).filter(change => change.operation_index === 0);
  assert.deepEqual(take.find(change => change.field === "source_start_seconds")?.control_range, { min: covered.start, max: covered.end });
  assert.deepEqual(take.find(change => change.field === "source_end_seconds")?.control_range, { min: covered.start, max: covered.end });
  // The bound is what keeps the card working: past it the cut-out has no frames.
  const outside = applyProposalReviewOverrides(proposal, "a", [{ operation_index: 0, target: "create_visual", field: "source_start_seconds", value: 1 }] as Parameters<typeof applyProposalReviewOverrides>[2], timeline);
  assert.throws(() => previewEditorAgentProposal(outside, "a", timeline), /does not cover/);
  const sweep = await sweepProposalDials(projectId, timeline, proposal, 60_000);
  assert.deepEqual(sweep.failures, []);
  assert.equal(sweep.unchecked, 0);
});

test("an existing subject clip's head trim and speed stop where its windows' cut-out ends", async () => {
  const proposal = card([{ element_id: SUBJECT, patch: { trim_start: 4.5, playback_rate: 1.2 } }]);
  const timeline = readTimeline(projectId);
  const changes = reviewOption(timeline, proposal.options[0]!).adjustment_rows.flatMap(row => row.changes);
  const trim = changes.find(change => change.field === "trim_start")!.control_range!;
  assert.equal(trim.min, covered.start);
  assert.ok(trim.max <= covered.end - 2 * 1.2 + 1e-9, "the shown source end stays covered");
  const speed = changes.find(change => change.field === "playback_rate")!.control_range!;
  assert.ok(speed.max <= (covered.end - 4.5) / 2 + 1e-9);
  assert.deepEqual((await sweepProposalDials(projectId, timeline, proposal, 60_000)).failures, []);
});

test("a clip's own grid matte and a removed window decide its bounds", () => {
  const timeline = readTimeline(projectId);
  assert.deepEqual(preparedMaskSourceBounds(timeline, { operations: [] } as never, SUBJECT, 30), covered);
  assert.equal(preparedMaskSourceBounds(timeline, { operations: [{ element_id: FILL, remove_visual: { reason: "x" } }] } as never, SUBJECT, 30), undefined);
  const matted = { ...timeline, elements: timeline.elements.map(element => element.id === FILL ? { ...element, props: { ...element.props, grid_matte_mask: { ...mask, source_start_seconds: 0 }, grid_matte_cell_size: 40 } } : element) };
  assert.deepEqual(preparedMaskSourceBounds(matted, { operations: [] } as never, FILL, 30), subjectWindowCoveredSource({ ...mask, source_start_seconds: 0 }, 30));
});
