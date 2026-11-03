import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { GET as previewGet, POST as previewPost } from "@/app/api/projects/[projectId]/timeline/proposals/[proposalId]/preview/route";
import { applyProposalReviewOverrides } from "@/lib/agent/proposal-overrides";
import { reviewOption } from "@/lib/agent/proposal-review";
import { previewEditorAgentProposal, proposalOption, timelineRevision, validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { readProposal, saveProposal } from "@/lib/local-store/proposals";
import { assessProjectSpatial } from "@/lib/local-store/spatial-assessment";
import { createProject, readTimeline, readTimelineSnapshot, writeTimeline } from "@/lib/local-store/store";
import { timelinePayload } from "@/lib/local-store/timeline-payload";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-preview-route-parity-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const T = "33333333-3333-4333-8333-333333333333";

function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-07-21T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

/** The route's body before it read the timeline once: two reads, the derive's own staleness check. */
function previousBody(projectId: string, proposalId: string, optionId?: string, overrides?: unknown[]) {
  const record = readProposal(projectId, proposalId);
  let proposal = record.proposal;
  if (overrides) proposal = applyProposalReviewOverrides(proposal, proposalOption(proposal, optionId).id, overrides as never, readTimeline(projectId));
  const preview = previewEditorAgentProposal(proposal, optionId);
  return {
    proposal_id: record.proposal_id,
    status: record.status,
    option_id: preview.option.id,
    stale: preview.stale,
    touched_element_ids: preview.touched,
    review: reviewOption(readTimeline(projectId), preview.option),
    spatial_assessment: assessProjectSpatial(projectId, preview.timeline, preview.laneOrderKeys, preview.outputFormat),
    timeline: timelinePayload(projectId, preview.timeline, preview.laneOrderKeys, preview.outputFormat, preview.mutedLaneKeys),
  };
}

/** JSON as sent, without the per-call fields (a created row is stamped at derive time). */
function comparable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (key, inner) => key === "snapshot_id" || key === "updated_at" || key === "created_at" ? undefined : inner);
}

test("the preview route answers as it did when it read the timeline twice", async () => {
  const projectId = "preview-parity";
  createProject(projectId, "web");
  writeTimeline(projectId, {
    elements: [
      element(A, { lane_key: "visual_0" }),
      element(B, { timeline_start: 4 }),
      element("44444444-4444-4444-8444-444444444444", { type: "caption_text", lane_key: "captions_0", source_url: null, props: { text: "Hello", fontSizePx: 60 } }),
    ],
    transitions: [],
  }, "fixture");
  const revision = timelineRevision(projectId);
  const proposal = validateEditorAgentProposalAgainstProject({
    schema_version: 2, project_id: projectId, expected_revision: revision, mode: "workshop", decision: "propose",
    summary: "Tighten and blend.", assumptions: [], unresolved_gaps: [],
    caps: { max_mutations: 24, requested_mutations: 4, max_renders: 0 },
    options: [
      { id: "trim", label: "Trim", recommended: true, summary: "Shorter opening", requested_mutations: 2,
        operations: [{ element_id: A, patch: { duration: 3 } }, { element_id: "44444444-4444-4444-8444-444444444444", props: { fontSizePx: 72 } }] },
      { id: "fade", label: "Fade", recommended: false, summary: "Fade between pictures", requested_mutations: 4,
        review_controls: [{ operation_index: 0, target: "create_transition", field: "duration_seconds" }],
        operations: [{ element_id: T, create_transition: { from_element_id: A, to_element_id: B, type: "fade", duration_seconds: 0.5 } }] },
    ],
  }, 24, projectId);
  const record = saveProposal(projectId, proposal);
  const context = { params: Promise.resolve({ projectId, proposalId: record.proposal_id }) };
  const url = `http://localhost/api/projects/${projectId}/timeline/proposals/${record.proposal_id}/preview`;
  const frozenBefore = JSON.stringify(readTimelineSnapshot(projectId).timeline);

  const check = async (label: string) => {
    for (const option of [undefined, "trim", "fade"]) {
      const response = await previewGet(new Request(option ? `${url}?option=${option}` : url), context);
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.deepEqual(comparable(body), comparable(previousBody(projectId, record.proposal_id, option)), `${label} GET ${option}`);
    }
    const overrides = [{ operation_index: 0, target: "create_transition", field: "duration_seconds", value: 0.8 }];
    const response = await previewPost(new Request(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ option_id: "fade", overrides }) }), context);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(comparable(body), comparable(previousBody(projectId, record.proposal_id, "fade", overrides)), `${label} POST`);
    return body as { stale: boolean };
  };

  assert.equal((await check("current")).stale, false);
  // The shared, frozen snapshot is never changed by a preview.
  assert.equal(JSON.stringify(readTimelineSnapshot(projectId).timeline), frozenBefore);

  // A newer working cut: the card still previews, marked stale, as before.
  const timeline = readTimeline(projectId);
  timeline.elements[1]!.volume = 0.5;
  writeTimeline(projectId, timeline, "fixture-edit");
  assert.equal((await check("stale")).stale, true);
});
