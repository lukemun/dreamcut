import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject, readTimeline, writeTimeline } from "../local-store/store";
import { readProposal } from "../local-store/proposals";
import { timelineRevision } from "./timeline-editor-agent-apply";
import { operationMayMoveVisuals } from "./proposal-spatial-review";
import { POST as create } from "../../app/api/projects/[projectId]/timeline/proposals/route";

const clip = "00000000-0000-4000-8000-000000000001";

test("only sound and colour skip the spatial check; anything that can move or reveal runs it", () => {
  assert.equal(operationMayMoveVisuals({ element_id: clip, props: { grade_temperature: 0.2, grade_tint: 0.05 } }), false);
  assert.equal(operationMayMoveVisuals({ element_id: clip, patch: { volume: 0.5, fade_out: 1 }, rationale: "Quieter" }), false);
  for (const operation of [{ props: { media_scale: 1.2 } }, { props: { mask_inset: [0, 0.1, 0, 0.1] } }, { props: { playback_reverse: true } },
    { props: { chroma_key_color: "#00ff00" } }, { patch: { timeline_start: 2 } }, { props: { grade_temperature: 0.2, media_mirror: "horizontal" } }]) {
    assert.equal(operationMayMoveVisuals({ element_id: clip, ...operation } as never), true, JSON.stringify(operation));
  }
});

test("staging runs the scoped spatial check itself and keeps it on the proposal record", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spatial-review-"));
  const previous = { projects: process.env.TIMELINE_PROJECTS_DIR, profile: process.env.DREAMCUT_PROFILE_DIR };
  process.env.TIMELINE_PROJECTS_DIR = path.join(dir, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(dir, "profile");
  try {
    createProject("spatial-review", "web");
    const fixture = readTimeline("spatial-review");
    fixture.elements = [{ id: clip, project_id: "spatial-review", type: "still", source_url: "/api/projects/spatial-review/media/synthetic.png", timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0, props: {}, removed_at: null }] as typeof fixture.elements;
    writeTimeline("spatial-review", fixture, "fixture setup");
    const stage = async (props: Record<string, unknown>) => {
      const proposal = { schema_version: 2, project_id: "spatial-review", expected_revision: timelineRevision("spatial-review"), mode: "workshop", decision: "propose", summary: "Edit", assumptions: [], unresolved_gaps: [],
        options: [{ id: "a", label: "Edit", summary: "Edit", recommended: true, operations: [{ element_id: clip, props }] }] };
      const response = await create(new Request("http://localhost/proposals", { method: "POST", body: JSON.stringify({ proposal }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ projectId: "spatial-review" }) });
      return { status: response.status, body: await response.json() };
    };
    const zoom = await stage({ media_scale: 1.2 });
    assert.equal(zoom.status, 201, JSON.stringify(zoom.body));
    assert.equal(zoom.body.spatial_review[0].spatial_status, "checked");
    assert.equal(typeof zoom.body.spatial_review[0].summary.introduced, "number");
    assert.equal(typeof zoom.body.spatial_review_ms, "number");
    assert.equal(readProposal("spatial-review", zoom.body.proposal_id).spatial_review?.[0]?.spatial_status, "checked", "the check travels with the audit record");
    const warmer = await stage({ grade_temperature: 0.2 });
    assert.equal(warmer.body.spatial_review[0].spatial_status, "not_applicable");
  } finally {
    if (previous.projects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous.projects;
    if (previous.profile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous.profile;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
