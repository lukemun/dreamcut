import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { timelineRevision } from "@/lib/agent/timeline-editor-agent-apply";
import { readProposal } from "@/lib/local-store/proposals";
import { createProject, readTimeline, restoreProjectHistorySnapshot, writeTimeline } from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { GET as listProposals, POST as createProposal } from "@/app/api/projects/[projectId]/timeline/proposals/route";
import { POST as approveProposal } from "@/app/api/projects/[projectId]/timeline/proposals/[proposalId]/approve/route";
import { POST as previewProposal } from "@/app/api/projects/[projectId]/timeline/proposals/[proposalId]/preview/route";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-waves-"));

const SHOT = "11111111-1111-4111-8111-111111111111";
const TITLE = "33333333-3333-4333-8333-333333333333";

function shot(): TimelineElement {
  const now = "2026-10-12T00:00:00.000Z";
  return {
    id: SHOT, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 8, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
  };
}

function step(projectId: string, revision: string, wave: Record<string, unknown>, operations: unknown[]) {
  return {
    schema_version: 2, project_id: projectId, expected_revision: revision, mode: "workshop", decision: "propose",
    summary: String(wave.title), assumptions: [], unresolved_gaps: [], caps: { max_renders: 0 }, wave,
    options: [{ id: "only", label: String(wave.title), recommended: true, summary: String(wave.title), operations }],
  };
}

async function post(projectId: string, body: unknown) {
  const response = await createProposal(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposal: body }),
  }), { params: Promise.resolve({ projectId }) });
  return { status: response.status, body: await response.json() as { proposal_id: string; error?: string } };
}

async function approve(projectId: string, proposalId: string) {
  const response = await approveProposal(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/${proposalId}/approve`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ option_id: "only" }),
  }), { params: Promise.resolve({ projectId, proposalId }) });
  return { status: response.status, body: await response.json() as { error?: string; history: { before: { id: string } } } };
}

async function inbox(projectId: string) {
  const response = await listProposals(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals?status=pending&include=pending_details`), { params: Promise.resolve({ projectId }) });
  const body = await response.json() as {
    proposals: Array<{ proposal_id: string; stale: boolean; wave: { step: number; total: number; waiting_for: number[] } | null }>;
    details: Record<string, unknown>;
  };
  return { byStep: new Map(body.proposals.map(entry => [entry.wave?.step, entry])), details: body.details };
}

test("every wave step applies on its own: dependent steps are refused, the rest settle in any order", async () => {
  const projectId = "proposal-waves";
  createProject(projectId, "web");
  writeTimeline(projectId, { elements: [shot()], transitions: [] }, "fixture");
  const start = readTimeline(projectId);
  const revision = timelineRevision(projectId);

  const title = { element_id: TITLE, create_visual: { type: "still", source_url: "/api/projects/x/media/title.png", timeline_start: 1, duration_seconds: 3, lane_key: "visual_1", lane_index: 1 } };
  const one = await post(projectId, step(projectId, revision, { id: "opener", step: 1, title: "Place the title" }, [title]));
  assert.equal(one.status, 201, one.body.error);
  // A step that changes the title step 1 creates only works on top of it: refused, so the
  // creator never meets a card that breaks when step 1 is rejected or retuned.
  const dependent = await post(projectId, step(projectId, revision, { id: "opener", step: 2, title: "Title timing", needs_steps: [1] }, [{ element_id: TITLE, patch: { duration: 4 } }]));
  assert.equal(dependent.status, 409);
  assert.match(dependent.body.error ?? "", /only applies on top of a pending step/);
  // Steps are an order: without needs_steps a step depends on nothing.
  const two = await post(projectId, step(projectId, revision, { id: "opener", step: 2, title: "Quieter shot" }, [{ element_id: SHOT, patch: { volume: 0.5 } }]));
  assert.equal(two.status, 201, two.body.error);

  const state = await inbox(projectId);
  assert.deepEqual(state.byStep.get(2)?.wave?.waiting_for, []);
  assert.ok(state.details[one.body.proposal_id] && state.details[two.body.proposal_id], "both steps are open");

  // Settled out of order, each still applies.
  const approvals = [] as Array<{ history: { before: { id: string } } }>;
  for (const proposal of [two, one]) {
    const approved = await approve(projectId, proposal.body.proposal_id);
    assert.equal(approved.status, 200, approved.body.error);
    approvals.push(approved.body);
  }
  const done = readTimeline(projectId).elements;
  assert.ok(done.some(element => element.id === TITLE));
  assert.equal(done.find(element => element.id === SHOT)?.volume, 0.5);

  for (const approved of approvals.reverse()) restoreProjectHistorySnapshot(projectId, approved.history.before.id, "history_restore_undo");
  assert.deepEqual(readTimeline(projectId).elements.map(element => element.id), start.elements.map(element => element.id));
  for (const proposal of [one, two]) assert.equal(readProposal(projectId, proposal.body.proposal_id).status, "pending");
});

test("a card that changes what another pending card changes is refused at drafting", async () => {
  const projectId = "proposal-waves-overlap";
  createProject(projectId, "web");
  writeTimeline(projectId, { elements: [shot()], transitions: [] }, "fixture");
  const revision = timelineRevision(projectId);
  const quieter = await post(projectId, step(projectId, revision, { id: "mix", step: 1, title: "Quieter shot" }, [{ element_id: SHOT, patch: { volume: 0.5 } }]));
  assert.equal(quieter.status, 201, quieter.body.error);
  const louder = await post(projectId, step(projectId, revision, { id: "mix", step: 2, title: "Louder shot" }, [{ element_id: SHOT, patch: { volume: 1.5 } }]));
  assert.equal(louder.status, 409);
  assert.match(louder.body.error ?? "", /both change volume/);
  // A different setting of the same clip is its own card.
  const fade = await post(projectId, step(projectId, revision, { id: "mix", step: 2, title: "Fade in" }, [{ element_id: SHOT, patch: { fade_in: 0.5 } }]));
  assert.equal(fade.status, 201, fade.body.error);
});

test("a step cannot name a wave step that does not exist", async () => {
  const projectId = "proposal-waves-missing";
  createProject(projectId, "web");
  writeTimeline(projectId, { elements: [shot()], transitions: [] }, "fixture");
  const orphan = await post(projectId, step(projectId, timelineRevision(projectId), { id: "opener", step: 2, title: "Title timing", needs_steps: [1] }, [{ element_id: SHOT, patch: { volume: 0.5 } }]));
  assert.equal(orphan.status, 409);
});
