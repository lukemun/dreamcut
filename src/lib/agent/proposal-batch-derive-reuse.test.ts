import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { resolveProposalBatch } from "./proposal-batch";
import { parseEditorAgentProposal, previewEditorAgentProposalBatch, timelineRevision } from "./timeline-editor-agent-apply";
import { saveProposal } from "@/lib/local-store/proposals";
import { createProject, readMetadata, readTimeline, writeMetadata, writeTimeline } from "@/lib/local-store/store";
import { POST as previewBatchRoute } from "@/app/api/projects/[projectId]/timeline/proposals/batch/preview/route";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-batch-derive-reuse-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];

function element(id: string, overrides: Partial<TimelineElement>): TimelineElement {
  const now = "2026-07-21T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

/** Three clips on three lanes and three independent cards: a lane reorder, a trim and a picture change. */
function seed(projectId: string, laneOrderKeys: string[], proposedLaneOrder: string[]) {
  createProject(projectId, "web");
  writeTimeline(projectId, { elements: [
    element(ids[0]!, { lane_key: "visual_0" }),
    element(ids[1]!, { lane_key: "visual_1", lane_index: 1, timeline_start: 1 }),
    element(ids[2]!, { lane_key: "visual_2", lane_index: 2, timeline_start: 2 }),
  ], transitions: [] }, "fixture");
  const metadata = readMetadata(projectId);
  metadata.lane_order_keys = laneOrderKeys;
  writeMetadata(projectId, metadata, "fixture-lanes");
  const revision = timelineRevision(projectId);
  const card = (operations: unknown[]) => saveProposal(projectId, parseEditorAgentProposal({
    schema_version: 2, project_id: projectId, expected_revision: revision, mode: "workshop", decision: "propose",
    summary: "Card", assumptions: [], unresolved_gaps: [], rebase_policy: "independent",
    caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    options: [{ id: "only", label: "Only", recommended: true, summary: "Only", requested_mutations: 1, operations }],
  }));
  return [
    card([{ element_id: ids[0], set_lane_order: { lane_order_keys: proposedLaneOrder } }]),
    card([{ element_id: ids[1], patch: { duration: 2.5 } }]),
    card([{ element_id: ids[2], props: { media_offset_x: 0.1 } }]),
  ];
}

// Per-call clocks (`created_at`, `updated_at`, `removed_at`) are the only fields two derives may differ in.
const strip = (value: unknown) => JSON.stringify(value).replace(/"20\d\d-\d\d-\d\dT[0-9:.]+Z"/g, '"T"');

for (const [label, laneOrder, proposed] of [
  ["saved lane order", ["visual_0", "visual_1", "visual_2"], ["visual_2", "visual_1", "visual_0"]],
  // The saved order lacks an active lane and the card names an inactive one: the batch lane merge still runs.
  ["partial saved lane order", ["visual_1", "visual_0"], ["visual_2", "visual_9", "visual_0", "visual_1"]],
] as const) {
  test(`batch preview from validation's derive matches a fresh derive (${label})`, async () => {
    const projectId = `batch-derive-reuse-${label.replace(/\W+/g, "-")}`;
    const records = seed(projectId, [...laneOrder], [...proposed]);
    for (const order of [records, [...records].reverse()]) {
      const batch = resolveProposalBatch(projectId, order.map((record) => ({ proposal_id: record.proposal_id, option_id: "only" })));
      const live = JSON.stringify(batch.timeline);
      const options = batch.items.map((item) => item.option);
      assert.ok(batch.items.every((item) => item.liveDerivation), "validation keeps each option's derive");
      const reused = previewEditorAgentProposalBatch(projectId, options, batch.timeline, batch.items.map((item) => item.liveDerivation));
      const fresh = previewEditorAgentProposalBatch(projectId, options, batch.timeline);
      assert.equal(strip(reused), strip(fresh));
      assert.equal(strip(fresh), strip(previewEditorAgentProposalBatch(projectId, options)), "same as a batch that reads the timeline itself");
      assert.equal(JSON.stringify(batch.timeline), live, "the shared live read is never mutated");
    }
    // The route answers the same composite either way.
    const response = await previewBatchRoute(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/batch/preview`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ selections: records.map((record) => ({ proposal_id: record.proposal_id, option_id: "only" })) }),
    }), { params: Promise.resolve({ projectId }) });
    assert.equal(response.status, 200);
    const body = await response.json() as { timeline: { elements: TimelineElement[]; lane_order_keys: string[] }; touched_element_ids: string[] };
    assert.equal(body.timeline.elements.find((item) => item.id === ids[1])?.duration, 2.5);
    assert.equal(body.timeline.elements.find((item) => item.id === ids[2])?.props?.media_offset_x, 0.1);
    assert.ok(ids.slice(1).every((id) => body.touched_element_ids.includes(id)));
    assert.deepEqual(body.timeline.lane_order_keys.filter((key) => key !== "visual_9"), proposed.filter((key) => key !== "visual_9"));
    assert.equal(readTimeline(projectId).elements.find((item) => item.id === ids[1])?.duration, 4, "previewing writes nothing");
  });
}

test("a one-card batch returns validation's derive itself; a different base is never reused", () => {
  const projectId = "batch-derive-reuse-identity";
  const [first] = seed(projectId, ["visual_0", "visual_1", "visual_2"], ["visual_2", "visual_1", "visual_0"]);
  const batch = resolveProposalBatch(projectId, [{ proposal_id: first!.proposal_id, option_id: "only" }]);
  const derivations = batch.items.map((item) => item.liveDerivation);
  const reused = previewEditorAgentProposalBatch(projectId, [batch.items[0]!.option], batch.timeline, derivations);
  assert.equal(reused.timeline, derivations[0]!.derived.timeline);
  const otherBase = readTimeline(projectId);
  const fresh = previewEditorAgentProposalBatch(projectId, [batch.items[0]!.option], otherBase, derivations);
  assert.notEqual(fresh.timeline, derivations[0]!.derived.timeline);
  assert.equal(strip(fresh), strip(reused));
});

test("the batch route keeps the spatial assessment for agents and skips it when the editor opts out", async () => {
  const projectId = "batch-derive-reuse-spatial";
  const records = seed(projectId, ["visual_0", "visual_1", "visual_2"], ["visual_2", "visual_1", "visual_0"]);
  const selections = records.map((record) => ({ proposal_id: record.proposal_id, option_id: "only" }));
  const call = async (extra: Record<string, unknown>) => (await previewBatchRoute(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/batch/preview`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ selections, ...extra }),
  }), { params: Promise.resolve({ projectId }) })).json() as Promise<Record<string, unknown>>;
  const full = await call({});
  const editor = await call({ spatial: false });
  assert.ok(full.spatial_assessment, "agents still receive the combined assessment by default");
  assert.equal("spatial_assessment" in editor, false);
  const { spatial_assessment: _spatial, ...rest } = full;
  assert.equal(strip(editor), strip(rest), "everything else is unchanged");
});
