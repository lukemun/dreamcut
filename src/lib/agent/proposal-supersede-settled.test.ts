import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject, readTimeline, writeTimeline } from "../local-store/store";
import { readProposal, rejectProposalRevisionChain, resolveSupersededProposals } from "../local-store/proposals";
import { timelineRevision } from "./timeline-editor-agent-apply";
import { POST as create } from "../../app/api/projects/[projectId]/timeline/proposals/route";

const clip = "00000000-0000-4000-8000-000000000001";

// A correction after a rejection names the rejected draft as its predecessor. That link is
// history: staging succeeds, and the rejected record is never rewritten by later decisions.
test("a correction may supersede a rejected draft without changing its record", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supersede-settled-"));
  const previous = { projects: process.env.TIMELINE_PROJECTS_DIR, profile: process.env.DREAMCUT_PROFILE_DIR };
  process.env.TIMELINE_PROJECTS_DIR = path.join(dir, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(dir, "profile");
  try {
    createProject("supersede", "web");
    const fixture = readTimeline("supersede");
    fixture.elements = [{ id: clip, project_id: "supersede", type: "still", source_url: "/api/projects/supersede/media/synthetic.png", timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0, props: {}, removed_at: null }] as typeof fixture.elements;
    writeTimeline("supersede", fixture, "fixture setup");
    const stage = async (supersedes: string[]) => {
      const proposal = { schema_version: 2, project_id: "supersede", expected_revision: timelineRevision("supersede"), mode: "workshop", decision: "propose", summary: "Lift", assumptions: [], unresolved_gaps: [],
        supersedes_proposal_ids: supersedes, options: [{ id: "a", label: "Lift", summary: "Lift", recommended: true, operations: [{ element_id: clip, props: { media_offset_y: -0.02 } }] }] };
      const response = await create(new Request("http://localhost/proposals", { method: "POST", body: JSON.stringify({ proposal }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ projectId: "supersede" }) });
      return { status: response.status, body: await response.json() };
    };
    const first = await stage([]);
    await rejectProposalRevisionChain("supersede", first.body.proposal_id, "Not this");
    const rejected = readProposal("supersede", first.body.proposal_id);

    const correction = await stage([first.body.proposal_id]);
    assert.equal(correction.status, 201, JSON.stringify(correction.body));
    assert.deepEqual(readProposal("supersede", correction.body.proposal_id).proposal.supersedes_proposal_ids, [first.body.proposal_id]);
    assert.deepEqual(resolveSupersededProposals("supersede", correction.body.proposal_id, [first.body.proposal_id]), [], "approval leaves settled drafts alone");
    assert.deepEqual(readProposal("supersede", first.body.proposal_id), rejected);

    const unknown = await stage(["20990101T000000-deadbeef"]);
    assert.equal(unknown.status, 404);
  } finally {
    if (previous.projects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous.projects;
    if (previous.profile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous.profile;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
