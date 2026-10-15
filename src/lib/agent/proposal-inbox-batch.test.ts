import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { timelineRevision, validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { proposalBaseValues, proposalElementFingerprints } from "@/lib/agent/proposal-staleness";
import { readProposal, saveProposal } from "@/lib/local-store/proposals";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { recordEditingFeedback, recordFeedbackDisposition } from "@/lib/local-store/editing-feedback";
import { requestLine } from "@/lib/timeline/editing-feedback";
import { pendingProposalInbox } from "@/components/studio/timeline/proposal-inbox";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { GET as listRoute } from "../../app/api/projects/[projectId]/timeline/proposals/route";
import { GET as detailRoute } from "../../app/api/projects/[projectId]/timeline/proposals/[proposalId]/route";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-inbox-batch-"));
process.env.TIMELINE_PROJECTS_DIR = root;
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const ELEMENT_A = "11111111-1111-4111-8111-111111111111";
const ELEMENT_B = "22222222-2222-4222-8222-222222222222";

function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-10-10T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

function seedWithPending(projectId: string) {
  createProject(projectId, "web");
  writeTimeline(projectId, { elements: [element(ELEMENT_A), element(ELEMENT_B, { timeline_start: 4 })], transitions: [] }, "fixture");
  const proposal = validateEditorAgentProposalAgainstProject({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Tighten it.", assumptions: [], unresolved_gaps: [], caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    options: [{ id: "tighten", label: "Tighten", recommended: true, summary: "Shorter.", requested_mutations: 1,
      operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }] }],
  }, 24, projectId);
  return saveProposal(projectId, proposal, { touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal),
    touchedBaseValues: proposalBaseValues(readTimeline(projectId), proposal) });
}

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });
const inboxRequest = (projectId: string, etag?: string | null) => new Request(
  `http://localhost/api/projects/${projectId}/timeline/proposals?include=pending_details`,
  { headers: etag ? { "If-None-Match": etag } : {} },
);

test("inbox batch returns the list and each pending proposal's review detail in one response", async () => {
  const projectId = "inbox-batch-details";
  const record = seedWithPending(projectId);
  const response = await listRoute(inboxRequest(projectId), params(projectId));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.proposals.map((entry: { proposal_id: string }) => entry.proposal_id), [record.proposal_id]);
  const detail = body.details[record.proposal_id];
  assert.equal(detail.status, "pending");
  assert.equal(detail.stale, false);
  // Same review rows as the single-proposal endpoint.
  const single = await (await detailRoute(new Request("http://localhost/x"), { params: Promise.resolve({ projectId, proposalId: record.proposal_id }) })).json();
  assert.deepEqual(detail.review, single.review);
  assert.deepEqual(detail.tuning, single.tuning);
  // The plain list keeps its original shape.
  const plain = await (await listRoute(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals`), params(projectId))).json();
  assert.equal("details" in plain, false);
});

test("unchanged inbox answers 304 with no body; a timeline change returns fresh state", async () => {
  const projectId = "inbox-batch-etag";
  const record = seedWithPending(projectId);
  const first = await listRoute(inboxRequest(projectId), params(projectId));
  const etag = first.headers.get("etag");
  assert.ok(etag);

  const unchanged = await listRoute(inboxRequest(projectId, etag), params(projectId));
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");

  // The creator changes the very setting the card changes: the tag changes, and the card stays
  // reviewable, saying it will replace that change.
  writeTimeline(projectId, { elements: [element(ELEMENT_A, { duration: 2 }), element(ELEMENT_B, { timeline_start: 4 })], transitions: [] }, "human_edit");
  const changed = await listRoute(inboxRequest(projectId, etag), params(projectId));
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("etag"), etag);
  const body = await changed.json();
  assert.equal(body.details[record.proposal_id].stale, false);
  const entry = body.proposals.find((candidate: { proposal_id: string }) => candidate.proposal_id === record.proposal_id);
  assert.deepEqual(entry.overrides, [{ element_id: ELEMENT_A, field: "duration" }]);
  // Reading never resolves a proposal: approval remains the human's action.
  assert.equal(readProposal(projectId, record.proposal_id).status, "pending");
});

test("inbox lists recorded requests with no draft, link or disposition as not drafted yet", async () => {
  const projectId = "inbox-pending-requests";
  seedWithPending(projectId);
  const capture = (ordinal: number, direction: string, extra: Record<string, unknown> = {}) => recordEditingFeedback({
    project_id: projectId, session_id: "s", turn_id: "t", ordinal, direction, provenance: "user_words", ...extra,
  }).event_id;
  const blur = capture(0, "Blur the background behind me\nso the text pops");
  const drafted = capture(1, "Tighten the opening");
  const setAside = capture(2, "Try a warmer grade");
  const replaced = capture(3, "Make the quote bigger");
  const correction = capture(4, "Make the quote fill the space", { supersedes_event_id: replaced });
  recordFeedbackDisposition({ project_id: projectId, feedback_id: setAside, session_id: "s", turn_id: "t", disposition: "deferred", reason: "Later" });
  const proposal = validateEditorAgentProposalAgainstProject({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    responds_to_feedback_ids: [drafted], summary: "Tighter open.", assumptions: [], unresolved_gaps: [],
    caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    options: [{ id: "tight", label: "Tight", recommended: true, summary: "Shorter.", requested_mutations: 1,
      operations: [{ element_id: ELEMENT_B, patch: { duration: 3 } }] }],
  }, 24, projectId);
  saveProposal(projectId, proposal, { touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal) });

  const first = await listRoute(inboxRequest(projectId), params(projectId));
  const body = await first.json();
  // Only undrafted, unlinked, undisposed, unsuperseded directions; in recorded order; one plain line each.
  assert.deepEqual(body.pending_requests.map((request: { id: string }) => request.id), [blur, correction]);
  assert.equal(body.pending_requests[0].direction, "Blur the background behind me");
  assert.ok(body.pending_requests[0].time);
  // They are never counted as reviewable proposals.
  assert.equal(pendingProposalInbox(body.proposals).actionable, 2);
  // The plain list keeps its original shape.
  const plain = await (await listRoute(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals`), params(projectId))).json();
  assert.equal("pending_requests" in plain, false);

  // Setting a request aside drops it from the queue and changes the poll's tag.
  const etag = first.headers.get("etag");
  recordFeedbackDisposition({ project_id: projectId, feedback_id: blur, session_id: "s", turn_id: "t", disposition: "deferred", reason: "Separate" });
  const changed = await listRoute(inboxRequest(projectId, etag), params(projectId));
  assert.equal(changed.status, 200);
  assert.deepEqual((await changed.json()).pending_requests.map((request: { id: string }) => request.id), [correction]);
});

test("a request line is the first non-empty line, single-spaced and capped with an ellipsis", () => {
  assert.equal(requestLine("“Can we audition the CNBC quote?”"), "Can we audition the CNBC quote?");
  assert.equal(requestLine("\n  Swap   the   CNBC quote \n for the other take"), "Swap the CNBC quote");
  const long = requestLine("word ".repeat(80), 40);
  assert.equal(long.length, 40);
  assert.ok(long.endsWith("…"));
});
