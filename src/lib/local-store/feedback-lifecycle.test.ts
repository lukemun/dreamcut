import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { recordEditingFeedback, recordFeedbackDisposition, assertFeedbackReferences } from "./editing-feedback";
import { createProject, readTimeline, readMetadata, restoreProjectHistorySnapshot } from "./store";
import { createExportCheckpoint, memoryEvents, readMemoryView } from "./editing-memory";
import { saveProposal, listProposals, readProposal, resolveProposal } from "./proposals";
import { feedbackCoverage } from "../timeline/editing-feedback";
import { parseEditorAgentProposal, timelineRevision } from "../agent/timeline-editor-agent-apply";
import { buildExportEvidence } from "./export-evidence";
import { POST as approve } from "../../app/api/projects/[projectId]/timeline/proposals/[proposalId]/approve/route";
import { POST as approveBatch } from "../../app/api/projects/[projectId]/timeline/proposals/batch/approve/route";
import { POST as record, GET as check } from "../../app/api/projects/[projectId]/memory/feedback/route";
import { PATCH as mute } from "../../app/api/projects/[projectId]/timeline/muted-lanes/route";
import { addFrameTag } from "./frame-tags";
import { PATCH as note } from "../../app/api/projects/[projectId]/review/frame-tags/route";
import { DELETE as reject } from "../../app/api/projects/[projectId]/timeline/proposals/[proposalId]/route";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-lifecycle-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const capture = (project_id: string, ordinal = 0) => recordEditingFeedback({ project_id, session_id: "session", turn_id: "turn", ordinal,
  direction: "Use a landscape canvas", reason: "It is for the website", provenance: "user_words" });
const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });
const request = (projectId: string, body: unknown, suffix = "") => new Request(`http://localhost/api/projects/${projectId}/${suffix}`, {
  method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", origin: "http://localhost" }, body: JSON.stringify(body),
});
function proposal(projectId: string, feedbackId: string) {
  return parseEditorAgentProposal({ schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId),
    responds_to_feedback_ids: [feedbackId], mode: "workshop", decision: "propose", summary: "Landscape canvas",
    assumptions: [], unresolved_gaps: [], caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{ id: "landscape", label: "Landscape", recommended: true, summary: "Use landscape", requested_mutations: 1,
      operations: [{ element_id: "11111111-1111-4111-8111-111111111111", set_output_format: { aspect_ratio: "16:9" } }] }],
  });
}

test("structured capture preserves reasons/provenance, retries, corrections and disposition conflicts", () => {
  createProject("capture", "web");
  const first = capture("capture");
  assert.deepEqual(capture("capture"), first);
  const correction = recordEditingFeedback({ project_id: "capture", session_id: "s", turn_id: "correction", direction: "Use portrait",
    provenance: "user_words", supersedes_event_id: first.event_id }, "human");
  const status = { project_id: "capture", feedback_id: correction.event_id, session_id: "s", turn_id: "end", disposition: "deferred", reason: "Awaiting delivery requirements" };
  assert.deepEqual(recordFeedbackDisposition(status), recordFeedbackDisposition(status));
  assert.throws(() => recordFeedbackDisposition({ ...status, reason: "Different explanation" }), /conflict/);
  const view = feedbackCoverage(memoryEvents("capture"), []);
  const original = view.directions.find(d => d.id === first.event_id)!;
  assert.equal(original.reason, "It is for the website");
  assert.equal(original.recorded_by, "agent");
  assert.equal(original.provenance, "user_words");
  assert.deepEqual(original.superseded_by, [correction.event_id]);
  assert.equal(view.directions.find(d => d.id === correction.event_id)?.reason, null);
  assert.equal(view.directions.find(d => d.id === correction.event_id)?.disposition, "deferred");
  assert.equal(view.unaccounted_feedback_ids.length, 0);
  createProject("foreign", "web");
  assert.throws(() => assertFeedbackReferences("foreign", [first.event_id]), /does not exist/);
  assert.throws(() => assertFeedbackReferences("capture", [first.event_id, first.event_id]), /Duplicate/);
  assert.throws(() => saveProposal("foreign", proposal("foreign", first.event_id)), /does not exist/);
  const bytes = fs.readFileSync(first.path, "utf8");
  fs.writeFileSync(first.path, bytes.replace("Use a landscape canvas", "Different direction"));
  assert.throws(() => assertFeedbackReferences("capture", [first.event_id]), /Invalid feedback/);
  fs.writeFileSync(first.path, bytes);
});

test("approval and batch approval retain causal links through Undo/Redo and export evidence", async () => {
  for (const batch of [false, true]) {
    const id = batch ? "batch-feedback" : "approval-feedback";
    createProject(id, "web");
    const feedback = capture(id);
    const saved = saveProposal(id, proposal(id, feedback.event_id));
    const response = batch
      ? await approveBatch(request(id, { selections: [{ proposal_id: saved.proposal_id, option_id: "landscape" }] }), params(id))
      : await approve(request(id, { option_id: "landscape" }), { params: Promise.resolve({ projectId: id, proposalId: saved.proposal_id }) });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    const snapshot = JSON.parse(fs.readFileSync(path.join(root, "projects", id, "history", body.history.after.id), "utf8"));
    assert.deepEqual(snapshot.responds_to_feedback_ids, [feedback.event_id]);
    assert.deepEqual(snapshot.proposal_ids, [saved.proposal_id]);
    assert.ok(snapshot.transaction_id);
    assert.equal(feedbackCoverage(memoryEvents(id), listProposals(id)).directions[0].proposals[0].status, "approved");
    restoreProjectHistorySnapshot(id, body.history.before.id, "history_restore_undo");
    let view = readMemoryView(id);
    assert.equal(view.feedback.directions[0].proposals[0].status, "pending");
    assert.ok(view.feedback.directions[0].changes.some(c => c.restores_snapshot_id === body.history.before.id));
    restoreProjectHistorySnapshot(id, body.history.after.id, "history_restore_redo");
    view = readMemoryView(id);
    assert.equal(view.feedback.directions[0].proposals[0].status, "approved");
    const checkpoint = createExportCheckpoint(id, `checkpoint-${id}`, { timeline: readTimeline(id), metadata: readMetadata(id) });
    const projected = buildExportEvidence(checkpoint.checkpoint);
    assert.equal(projected.feedback?.directions[0].reason, "It is for the website");
    assert.deepEqual(projected.proposals[0].responds_to_feedback_ids, [feedback.event_id]);
    capture(id, 1);
    assert.equal((checkpoint.checkpoint.feedback as ReturnType<typeof feedbackCoverage>).directions.length, 1, "Frozen checkpoint must not change");
  }
});

test("feedback HTTP capture is project bound; coverage is read-only; workspace request links reach history", async () => {
  createProject("http-feedback", "web");
  const body = { session_id: "ui", turn_id: "1", direction: "Keep the music quiet", provenance: "user_words" };
  const result = await record(request("http-feedback", body), params("http-feedback"));
  assert.equal(result.status, 201);
  const receipt = await result.json();
  assert.equal(memoryEvents("http-feedback").find(e => e.id === receipt.event_id)?.actor, "human");
  const mismatch = await record(request("http-feedback", { ...body, project_id: "other" }), params("http-feedback"));
  assert.equal(mismatch.status, 400);
  const before = memoryEvents("http-feedback").length;
  const coverage = await check(request("http-feedback", {}), params("http-feedback"));
  assert.deepEqual((await coverage.json()).unaccounted_feedback_ids, [receipt.event_id]);
  assert.equal(memoryEvents("http-feedback").length, before);
  const linked = await mute(new Request("http://localhost/api/projects/http-feedback/timeline/muted-lanes", {
    method: "PATCH", headers: { "content-type": "application/json", "x-dreamcut-client": "mcp", "x-dreamcut-feedback-ids": JSON.stringify([receipt.event_id]) },
    body: JSON.stringify({ muted_lane_keys: ["music_0"] }),
  }), params("http-feedback"));
  assert.equal(linked.status, 200);
  assert.equal(feedbackCoverage(memoryEvents("http-feedback"), []).unaccounted_feedback_ids.length, 0);
  const invalid = await mute(new Request("http://localhost/api/projects/http-feedback/timeline/muted-lanes", {
    // The legacy OpenEdit header name is still validated, not ignored.
    method: "PATCH", headers: { "content-type": "application/json", "x-openedit-feedback-ids": JSON.stringify(["missing"]) },
    body: JSON.stringify({ muted_lane_keys: [] }),
  }), params("http-feedback"));
  assert.equal(invalid.status, 400);
  assert.deepEqual(readMetadata("http-feedback").muted_lane_keys, ["music_0"], "Invalid links cannot mutate the timeline");
});

test("GUI review notes and rejection reasons become direction without claiming they were addressed", async () => {
  const id = "gui-feedback";
  createProject(id, "web");
  const mark = addFrameTag(id, 0, []).tag;
  const response = await note(request(id, { id: mark.id, note: "Move this title up" }), params(id));
  assert.equal(response.status, 200);
  const captured = memoryEvents(id).find(event => event.type === "editorial.feedback")!;
  assert.equal(captured.actor, "human");
  assert.deepEqual(captured.data?.targets, { review_mark_ids: [mark.id], element_ids: [], timeline_range: { start: 0, end: 0 } });
  assert.ok(feedbackCoverage(memoryEvents(id), []).unaccounted_feedback_ids.includes(captured.id));
  const saved = saveProposal(id, proposal(id, captured.id));
  const rejection = await reject(request(id, { reason: "This should remain portrait" }), { params: Promise.resolve({ projectId: id, proposalId: saved.proposal_id }) });
  assert.equal(rejection.status, 200);
  const view = feedbackCoverage(memoryEvents(id), listProposals(id));
  assert.equal(view.directions.find(d => d.id === captured.id)?.proposals[0].status, "rejected");
  assert.ok(view.directions.some(d => d.direction === "This should remain portrait" && !d.accounted_for && d.recorded_by === "human"));
});


test("rejecting the latest revision rejects its full pending chain without touching other work", async () => {
  const id = "reject-revision-chain";
  createProject(id, "web", "Revision rejection");
  const feedback = capture(id);
  const base = proposal(id, feedback.event_id);
  const save = (proposalId: string, replaces: string[], second: number) => saveProposal(id, {
    ...base, supersedes_proposal_ids: replaces,
  }, { proposalId, now: new Date(`2026-09-28T00:00:0${second}.000Z`) });
  save("20260928T000000-00000001", [], 0);
  save("20260928T000000-00000002", ["20260928T000000-00000001"], 1);
  save("20260928T000000-00000003", ["20260928T000000-00000002", "20260928T000000-00000001"], 2);
  save("20260928T000000-00000004", [], 3);
  save("20260928T000000-00000005", [], 0);
  resolveProposal(id, "20260928T000000-00000005", "20260928T000000-00000005", {});
  const before = readTimeline(id);
  const response = await reject(request(id, { reason: "Reject the entire idea" }), {
    params: Promise.resolve({ projectId: id, proposalId: "20260928T000000-00000003" }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.rejected_proposal_ids, ["20260928T000000-00000001", "20260928T000000-00000002", "20260928T000000-00000003"]);
  for (const name of ["20260928T000000-00000001", "20260928T000000-00000002", "20260928T000000-00000003"]) assert.equal(readProposal(id, name).status, "rejected");
  assert.equal(readProposal(id, "20260928T000000-00000001").resolution?.rejected_with_proposal_id, "20260928T000000-00000003");
  assert.equal(readProposal(id, "20260928T000000-00000004").status, "pending");
  assert.equal(readProposal(id, "20260928T000000-00000005").status, "20260928T000000-00000005");
  assert.deepEqual(readTimeline(id), before);
  const again = await reject(request(id, {}), { params: Promise.resolve({ projectId: id, proposalId: "20260928T000000-00000003" }) });
  assert.equal(again.status, 409);
  const reasons = memoryEvents(id).filter(event => event.type === "editorial.feedback" && event.summary === "Reject the entire idea");
  assert.equal(reasons.length, 1);
});

test("revision rejection crosses already resolved intermediates and ignores missing or forward links", async () => {
  const id = "reject-resolved-intermediate";
  createProject(id, "web", "Revision rejection");
  const base = proposal(id, capture(id).event_id);
  const save = (name: string, refs: string[], second: number) => saveProposal(id, { ...base, supersedes_proposal_ids: refs }, {
    proposalId: name, now: new Date(`2026-09-28T00:00:0${second}.000Z`),
  });
  save("20260928T000000-00000006", ["20260928T000000-00000009"], 0);
  save("20260928T000000-00000007", ["20260928T000000-00000006"], 1);
  resolveProposal(id, "20260928T000000-00000007", "rejected", {});
  save("20260928T000000-00000003", ["20260928T000000-00000007", "20260928T000000-00000008"], 2);
  save("20260928T000000-00000009", [], 3);
  const response = await reject(request(id, {}), { params: Promise.resolve({ projectId: id, proposalId: "20260928T000000-00000003" }) });
  assert.equal(response.status, 200);
  assert.equal(readProposal(id, "20260928T000000-00000006").status, "rejected");
  assert.equal(readProposal(id, "20260928T000000-00000009").status, "pending");
});
