import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { timelineRevision, validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { proposalElementFingerprints } from "@/lib/agent/proposal-staleness";
import { saveProposal } from "@/lib/local-store/proposals";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { recordEditingFeedback } from "@/lib/local-store/editing-feedback";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { GET as listRoute } from "../../app/api/projects/[projectId]/timeline/proposals/route";
import { POST as askRoute } from "../../app/api/projects/[projectId]/timeline/proposals/agent-requests/route";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-agent-requests-"));
process.env.TIMELINE_PROJECTS_DIR = root;
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const CLIP = "11111111-1111-4111-8111-111111111111";

function clip(overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-10-10T00:00:00.000Z";
  return {
    id: CLIP, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

function seed(projectId: string) {
  createProject(projectId, "web");
  writeTimeline(projectId, { elements: [clip()], transitions: [] }, "fixture");
  const proposal = validateEditorAgentProposalAgainstProject({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Tighten the opening.", assumptions: [], unresolved_gaps: [], caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    options: [{ id: "tighten", label: "Tighten", recommended: true, summary: "Shorter.", requested_mutations: 1,
      operations: [{ element_id: CLIP, patch: { duration: 3 } }] }],
  }, 24, projectId);
  return saveProposal(projectId, proposal, { touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal) });
}

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });
const ask = (projectId: string, body: unknown) => askRoute(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/agent-requests`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), params(projectId));

test("a card that still applies needs no repair", async () => {
  const projectId = "ask-live";
  const record = seed(projectId);
  const response = await ask(projectId, { kind: "repair", target_id: record.proposal_id });
  assert.equal(response.status, 409);
});

test("Repair on a card that no longer applies records the ask with its reason, and the inbox shows it", async () => {
  const projectId = "ask-stale";
  const record = seed(projectId);
  // The creator deletes the clip the card changes, so the card can no longer apply.
  writeTimeline(projectId, { elements: [clip({ removed_at: "2026-10-13T00:00:00.000Z" })], transitions: [] }, "fixture");
  const response = await ask(projectId, { kind: "repair", target_id: record.proposal_id });
  assert.equal(response.status, 200);
  const { request } = await response.json();
  assert.equal(request.kind, "repair");
  assert.match(request.prompt, new RegExp(record.proposal_id));
  assert.match(request.prompt, /supersedes_proposal_ids/);
  assert.match(request.prompt, /A clip this card changes was deleted/);
  assert.match(request.prompt, /Never approve or reject/);
  const list = await (await listRoute(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals`), params(projectId))).json();
  const entry = list.proposals.find((candidate: { proposal_id: string }) => candidate.proposal_id === record.proposal_id);
  assert.equal(entry.stale, true);
  assert.equal(entry.agent_request.requested_at, request.requested_at);
});

test("Draft on a recorded request asks for an independent card linked to it", async () => {
  const projectId = "ask-draft";
  seed(projectId);
  const { event_id } = recordEditingFeedback({ project_id: projectId, session_id: "s", turn_id: "t", ordinal: 0,
    direction: "Blur the background behind me", provenance: "user_words" });
  const response = await ask(projectId, { kind: "draft", target_id: event_id });
  assert.equal(response.status, 200);
  const { request } = await response.json();
  assert.match(request.prompt, /responds_to_feedback_ids/);
  assert.match(request.prompt, /Blur the background behind me/);
  assert.match(request.prompt, /apply on its own/);
  const inbox = await (await listRoute(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals?include=pending_details`), params(projectId))).json();
  assert.equal(inbox.pending_requests[0].agent_request.kind, "draft");
  assert.equal((await ask(projectId, { kind: "draft", target_id: "feedback:unknown" })).status, 409);
});
