import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { currentEditAttribution, requestEditAttribution, withEditRequestActor } from "./edit-attribution";
import { createProject, readTimeline, writeTimeline, withProjectLock } from "./store";
import { editChapters, memoryEvents } from "./editing-memory";
import { buildExportEvidence } from "./export-evidence";
import { PATCH as muteRoute } from "../../app/api/projects/[projectId]/timeline/muted-lanes/route";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "edit-actor-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
const request = (headers: Record<string, string> = {}) => new Request("http://localhost:3123/api/edit", { headers });
const editorHeaders = { "sec-fetch-site": "same-origin", origin: "http://localhost:3123" };

test("request provenance separates editor, MCP and opaque calls without granting authority", () => {
  assert.equal(requestEditAttribution(request(editorHeaders)).actor, "human");
  assert.equal(requestEditAttribution(request({ "x-dreamcut-client": "editor" })).actor, "human");
  assert.equal(requestEditAttribution(request({ ...editorHeaders, "x-dreamcut-client": "mcp" })).actor, "agent");
  // Processes started before the DreamCut rename still send the OpenEdit header.
  assert.equal(requestEditAttribution(request({ "x-openedit-client": "editor" })).actor, "human");
  assert.equal(requestEditAttribution(request({ ...editorHeaders, "x-openedit-client": "mcp" })).actor, "agent");
  assert.equal(requestEditAttribution(request()).actor, "unknown");
  assert.equal(requestEditAttribution(request({ ...editorHeaders, origin: "https://elsewhere.example" })).actor, "unknown");
});

test("request attribution survives shared project queues without leaking between requests", async () => {
  const wrapped = withEditRequestActor(async (_request: Request, wait: number) => {
    await new Promise(resolve => setTimeout(resolve, wait));
    return withProjectLock("shared", async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      return currentEditAttribution("element_patch").actor;
    });
  });
  assert.deepEqual(await Promise.all([wrapped(request(editorHeaders), 3), wrapped(request({ "x-dreamcut-client": "mcp" }), 0)]), ["human", "agent"]);
  assert.equal(currentEditAttribution("element_patch").actor, "unknown");
});

test("real editor route persists actor into snapshot, event, chapter and retro projection", async () => {
  createProject("ui-edit", "web");
  for (const [index, headers] of [editorHeaders, { "x-dreamcut-client": "mcp" }, {}].entries()) {
    const response = await muteRoute(new Request("http://localhost:3123/api/projects/ui-edit/timeline/muted-lanes", {
      method: "PATCH", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ muted_lane_keys: [`music_${index}`] }),
    }), { params: Promise.resolve({ projectId: "ui-edit" }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    const snapshot = JSON.parse(fs.readFileSync(path.join(root, "projects/ui-edit/history", body.history.after.id), "utf8"));
    const expected = ["human", "agent", "unknown"][index];
    assert.equal(snapshot.actor, expected);
    assert.equal(memoryEvents("ui-edit").find(e => e.evidence === body.history.after.id)?.actor, expected);
    const chapters = editChapters("ui-edit");
    assert.equal(chapters.find(c => c.id === body.history.after.id)?.actor, expected);
    const projected = buildExportEvidence({ chapters, proposals: [], events: [], preferences: [], core_skills: [] });
    assert.equal(projected.chapters.find(c => c.id === body.history.after.id)?.actor, expected);
  }
});

test("agent proposal authorship and human approval remain distinct; legacy stays unknown", async () => {
  createProject("approval", "web");
  await withEditRequestActor(async (_request: Request) => {
    writeTimeline("approval", readTimeline("approval"), "editor_agent_apply");
  })(request(editorHeaders));
  const event = memoryEvents("approval").find(e => e.summary === "editor agent apply")!;
  assert.equal(event.actor, "agent");
  assert.equal(event.data?.initiated_by, "human");
  assert.equal(event.data?.attribution_source, "approved_proposal");
  const projected = buildExportEvidence({ chapters: [{ id: "old", category: "Audio", operation: "patch", summary: "old", changes: [] }], proposals: [], events: [], preferences: [], core_skills: [] });
  assert.equal(projected.chapters[0].actor, "unknown");
});
