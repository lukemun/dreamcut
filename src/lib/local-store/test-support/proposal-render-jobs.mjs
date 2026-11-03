import assert from "node:assert/strict";
import { mock } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-render-jobs-"));
process.env.TIMELINE_PROJECTS_DIR = root;
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
const events = [], checkpoints = [], shares = [], exports = [], renders = [];
let finish;
const memory = await import("../editing-memory.ts");
mock.module("../editing-memory.ts", { namedExports: { ...memory,
  safeMemoryEvent: (...args) => events.push(args), createExportCheckpoint: (...args) => checkpoints.push(args) } });
mock.module("../export-sharing.ts", { namedExports: {
  exportSharingEnabled: () => true, shareExportPacket: async (...args) => { shares.push(args); } } });
mock.module("../export-library.ts", { namedExports: {
  addToExportsFolder: (...args) => { exports.push(args); return "fixture-library-path"; } } });
mock.module("../../render/browser-renderer.ts", { namedExports: { renderBrowserVideo: async input => {
  await new Promise((resolve, reject) => {
    finish = resolve;
    input.signal.addEventListener("abort", () => reject(new Error("fixture canceled")), { once: true });
  });
  fs.writeFileSync(input.outputLocation, "fixture encoded output");
} } });
const pipeline = await import("../../render/pipeline.ts");
mock.module("../../render/pipeline.ts", { namedExports: { ...pipeline, renderProjectVideo: input => {
  renders.push(input);
  return pipeline.renderProjectVideo(input);
} } });

const store = await import("../store.ts");
const { saveProposal } = await import("../proposals.ts");
const { validateEditorAgentProposalAgainstProject } = await import("../../agent/timeline-editor-agent-apply.ts");
const { readProposalRenderSnapshot } = await import("../proposal-render-snapshot.ts");
const { startProposalRender, startRender, getJob, latestRenderJob, latestRenderFile, listJobs } = await import("../render-jobs.ts");
const route = await import("../../../app/api/projects/[projectId]/timeline/proposals/[proposalId]/render/route.ts");
const fileRoute = await import("../../../app/api/generation-jobs/[jobId]/file/route.ts");
const id = "render-preview", A = "11111111-1111-4111-8111-111111111111";
store.createProject(id, "web");
store.writeTimeline(id, { elements: [{
  id: A, project_id: id, type: "shape", source_url: null, props: { shape: "rectangle" },
  beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0", lane_index: 0,
  trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
  position_locked: false, removed_at: null, removed_reason: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
}], transitions: [] }, "fixture");
const proposal = saveProposal(id, validateEditorAgentProposalAgainstProject({
  schema_version: 2, project_id: id, expected_revision: store.readTimelineSnapshot(id).revision,
  mode: "workshop", decision: "propose", summary: "Shorten shape", assumptions: [], unresolved_gaps: [],
  caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
  options: [{ id: "short", label: "Short", recommended: true, summary: "Trim", requested_mutations: 1,
    operations: [{ element_id: A, patch: { duration: 3 } }] }],
}, 24, id));
events.length = 0;
const before = JSON.stringify(store.readTimeline(id));
const authorityFiles = () => fs.readdirSync(path.join(root, id), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && !path.relative(path.join(root, id), path.join(entry.parentPath, entry.name)).startsWith("renders/"))
  .map(entry => [path.relative(path.join(root, id), path.join(entry.parentPath, entry.name)), fs.readFileSync(path.join(entry.parentPath, entry.name), "base64")])
  .sort((a, b) => a[0].localeCompare(b[0]));
const authorityBefore = authorityFiles();
const identity = readProposalRenderSnapshot(id, proposal.proposal_id, "short").identity;
const args = [id, proposal.proposal_id, "short", identity, "http://localhost:3123", { backend: "gpu", resolution: 720 }];
const context = { params: Promise.resolve({ projectId: id, proposalId: proposal.proposal_id }) };
const prepare = await route.GET(new Request("http://localhost:3123/render?option_id=short"), context);
assert.equal(prepare.status, 200);
assert.deepEqual((await prepare.json()).preview, identity);
const stale = await route.POST(new Request("http://localhost:3123/render", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ option_id: "short", expected_revision: identity.revision, expected_fingerprint: "0".repeat(64) }) }), context);
assert.equal(stale.status, 409);
assert.equal(renders.length, 0, "stale request is refused before dispatch");
const started = await startProposalRender(...args);
assert.equal(started.ok, true);
assert.equal(started.job.targetType, "proposal_preview");
assert.equal(listJobs({ projectId: id, targetType: "render" }).length, 0, "preview must not enter the editor's export tracker");
assert.equal(renders.length, 1, "real coordinator reaches the controlled renderer");
assert.equal(renders[0].unapprovedPreview, true);
assert.equal(renders[0].elements[0].duration, 3);
const repeated = await startProposalRender(...args);
assert.equal(repeated.ok, true);
assert.equal(repeated.alreadyInProgress, true);
assert.equal(repeated.job.id, started.job.id);
const changed = await startProposalRender(...args.slice(0, 5), { backend: "gpu", resolution: 1080 });
assert.equal(changed.ok, false);
assert.equal(changed.status, 409);
assert.equal(startRender(id, [], "http://localhost:3123", { backend: "gpu" }).ok, false);
assert.equal(renders.length, 1);
await new Promise(resolve => setImmediate(resolve));
finish();
await new Promise(resolve => setImmediate(resolve));
assert.equal(getJob(started.job.id).status, "completed");
assert.equal(getJob(started.job.id).libraryPath, undefined);
assert.equal(latestRenderJob(id), null);
assert.equal(latestRenderFile(id), null);
assert.deepEqual(events, []);
assert.deepEqual(checkpoints, []);
assert.deepEqual(exports, []);
assert.deepEqual(shares, []);
assert.equal(JSON.stringify(store.readTimeline(id)), before);
assert.deepEqual(authorityFiles(), authorityBefore, "preview completion changes no proposal, tuning, history or project authority file");
const status = await route.GET(new Request(`http://localhost:3123/render?job_id=${started.job.id}`), context);
assert.equal(status.status, 200);
assert.equal((await status.json()).preview.kind, "unapproved_proposal_preview");
const wrongScope = await route.GET(new Request(`http://localhost:3123/render?job_id=${started.job.id}`),
  { params: Promise.resolve({ projectId: "other-project", proposalId: proposal.proposal_id }) });
assert.equal(wrongScope.status, 404);
const file = await fileRoute.GET(new Request("http://localhost:3123/file"), { params: Promise.resolve({ jobId: started.job.id }) });
assert.equal(await file.text(), "fixture encoded output");

const delivery = startRender(id, [], "http://localhost:3123", { backend: "gpu" });
assert.equal(delivery.ok, true);
assert.equal(renders.length, 2);
assert.equal(renders[1].unapprovedPreview, undefined);
assert.equal(renders[1].elements[0].duration, 4);
assert.equal(checkpoints.length, 1);
await new Promise(resolve => setImmediate(resolve));
finish();
await new Promise(resolve => setImmediate(resolve));
assert.equal(getJob(delivery.job.id).status, "completed");
assert.equal(exports.length, 1);
assert.equal(shares.length, 1);
assert.deepEqual(events.map(entry => entry[1].type), ["export.started", "export.completed"]);
assert.equal(latestRenderJob(id).id, delivery.job.id);
assert.equal(latestRenderFile(id).fileName, delivery.job.fileName);
assert.equal((await fileRoute.GET(new Request("http://localhost:3123/file"), { params: Promise.resolve({ jobId: delivery.job.id }) })).status, 404);
const stopped = await startProposalRender(...args);
assert.equal(stopped.ok, true);
await new Promise(resolve => setImmediate(resolve));
const canceled = await route.DELETE(new Request(`http://localhost:3123/render?job_id=${stopped.job.id}`), context);
assert.equal(canceled.status, 200);
await new Promise(resolve => setImmediate(resolve));
assert.equal(getJob(stopped.job.id).status, "canceled");
assert.equal(checkpoints.length, 1);
assert.equal(exports.length, 1);
assert.equal(shares.length, 1);
assert.deepEqual(events.map(entry => entry[1].type), ["export.started", "export.completed"]);
fs.rmSync(root, { recursive: true, force: true });
