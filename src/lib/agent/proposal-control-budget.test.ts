import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject, readTimeline, writeTimeline } from "../local-store/store";
import { saveProposal, readProposal, listProposals } from "../local-store/proposals";
import { projectProposalPath } from "../local-store/paths";
import { writeJsonFileAtomic } from "../local-store/atomic-json";
import { timelineRevision, validateEditorAgentProposal } from "./timeline-editor-agent-apply";
import { POST as preflight } from "../../app/api/projects/[projectId]/timeline/proposals/preflight/route";

test("save and preflight reject oversized new drafts without invalidating historical records", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slider-admission-"));
  const oldProjects = process.env.TIMELINE_PROJECTS_DIR;
  const oldProfile = process.env.DREAMCUT_PROFILE_DIR;
  process.env.TIMELINE_PROJECTS_DIR = path.join(dir, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(dir, "profile");
  try {
    createProject("budget-test", "web");
    const fixture = readTimeline("budget-test");
    fixture.elements = Array.from({length:16}, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, project_id: "budget-test", type: "still", source_url: "/api/projects/budget-test/media/synthetic.png", timeline_start: 0, duration: 1, lane_key: `visual_${i}`, lane_index: i, props: {}, removed_at: null,
    })) as typeof fixture.elements;
    writeTimeline("budget-test", fixture, "fixture setup");
    const before = readTimeline("budget-test");
    const proposal = validateEditorAgentProposal({ schema_version: 2, project_id: "budget-test", expected_revision: timelineRevision("budget-test"), mode: "workshop", decision: "propose", summary: "Budget", assumptions: [], unresolved_gaps: [], caps: { max_mutations: 16, requested_mutations: 16, max_renders: 0 }, options: [{ id: "large", label: "Large", summary: "Large", recommended: true, requested_mutations: 16,
      operations: Array.from({ length: 16 }, (_, i) => ({ element_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, props: { subject_glow: 1 } })),
    }] }, 16);
    assert.throws(() => saveProposal("budget-test", proposal), /maximum is 15/);
    // A drawing in several pieces is told how to keep one card: choose and link its main dials.
    assert.throws(() => saveProposal("budget-test", proposal), /linked_operation_indices/);
    assert.equal(listProposals("budget-test").length, 0);
    const response = await preflight(new Request("http://localhost/preflight", { method: "POST", body: JSON.stringify({ proposal }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ projectId: "budget-test" }) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /maximum is 15/);
    writeJsonFileAtomic(projectProposalPath("budget-test", "20260930T000000-abcdef12"), { schema_version: 1, proposal_id: "20260930T000000-abcdef12", created_at: new Date().toISOString(), status: "pending", proposal });
    assert.equal(readProposal("budget-test", "20260930T000000-abcdef12").proposal.options[0].operations.length, 16);
    assert.deepEqual(readTimeline("budget-test"), before);
  } finally {
    if (oldProjects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = oldProjects;
    if (oldProfile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = oldProfile;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
