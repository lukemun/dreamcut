import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAssemblyWorkspace, readAssemblyBrief } from "./assembly-workspaces";
import { readMetadata, readTimeline, writeMetadata } from "./store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "assembly-workspace-test-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const request = {
  project_id: "first-assembly",
  title: "First Assembly",
  objective: "Build a coherent first cut from the supplied script and presenter source.",
  script_text: "Opening line.",
  visual_directions: ["Use a black scratch-pad background after the hook."],
  sources: [{ label: "Presenter", role: "talking_head" as const, source_path: "/tmp/presenter.mov", source_url: null, note: null }],
  source_project_id: null,
  delivery_target: "reels" as const,
  output_aspect_ratio: "9:16" as const,
};

test("assembly creation mints one fresh direct-authoring workspace with a durable brief", () => {
  const brief = createAssemblyWorkspace(request);
  assert.equal(brief.authority, "agent_workspace");
  assert.equal(brief.proposal_policy, "direct_until_first_handoff_or_human_edit");
  assert.equal(readMetadata(request.project_id).agent_workspace, true);
  assert.equal(readMetadata(request.project_id).output_aspect_ratio, "9:16");
  assert.deepEqual(readTimeline(request.project_id), { elements: [], transitions: [] });
  assert.deepEqual(readAssemblyBrief(request.project_id), brief);
});

test("assembly creation refuses to overwrite any existing project", () => {
  assert.throws(() => createAssemblyWorkspace(request), /already exists/);
  assert.equal(readAssemblyBrief(request.project_id)?.objective, request.objective);
});

test("assembly sources require a path or registered URL", () => {
  assert.throws(() => createAssemblyWorkspace({ ...request, project_id: "invalid-source", sources: [
    { label: "Missing", role: "visual", source_path: null, source_url: null, note: null },
  ] }), /source path or URL/i);
  assert.equal(fs.existsSync(path.join(root, "invalid-source")), false);
});

test("legacy assembly briefs report effective closed authority after a human edit", () => {
  const id = "legacy-brief";
  createAssemblyWorkspace({ ...request, project_id: id });
  const file = path.join(root, id, "analysis", "assembly-brief.json");
  const legacy = JSON.parse(fs.readFileSync(file, "utf8"));
  legacy.proposal_policy = "direct_until_first_human_edit";
  fs.writeFileSync(file, JSON.stringify(legacy));
  assert.equal(readAssemblyBrief(id)?.proposal_policy, "direct_until_first_handoff_or_human_edit");
  writeMetadata(id, readMetadata(id), "lane_order");
  assert.equal(readAssemblyBrief(id)?.authority, "proposal_required");
  assert.equal(readAssemblyBrief(id)?.proposal_policy, "proposals_only");
});

test("a format variant starts from the source project's live cut without changing it", async () => {
  const { createProject, writeTimeline } = await import("./store");
  const { writePreparation, readPreparation } = await import("./media-preparation");
  const source = "variant-source";
  createProject(source, "web", "Landscape", { outputAspectRatio: "16:9" });
  fs.mkdirSync(path.join(root, source, "media", "sources"), { recursive: true });
  fs.mkdirSync(path.join(root, source, "media", ".prepared", "p"), { recursive: true });
  fs.writeFileSync(path.join(root, source, "media", "sources", "a.mov"), "source");
  fs.writeFileSync(path.join(root, source, "media", "sources", "unused.mov"), "unused");
  for (const name of ["preview.mp4", "render.mov"]) fs.writeFileSync(path.join(root, source, "media", ".prepared", "p", name), name);
  const stat = fs.statSync(path.join(root, source, "media", "sources", "a.mov"));
  writePreparation(source, { recipe: "editor-media-v1", source: "sources/a.mov", size: stat.size, mtime: stat.mtimeMs,
    state: "ready", preview: ".prepared/p/preview.mp4", render: ".prepared/p/render.mov" });
  const url = (rel: string) => `/api/projects/${source}/media/${rel}`;
  const base = { project_id: source, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    lane_index: 0, position_locked: false, beat_id: null, voice_clip_id: null, character_id: null };
  const before = { transitions: [], elements: [
    { ...base, id: "11111111-1111-4111-8111-111111111111", type: "video_clip", lane_key: "visual_0", timeline_start: 0, duration: 1,
      source_url: url(".prepared/p/render.mov"), props: { archival_source_url: url("sources/a.mov"), preview_source_url: url(".prepared/p/preview.mp4") } },
    { ...base, id: "22222222-2222-4222-8222-222222222222", type: "caption_text", lane_key: "captions_0", timeline_start: 0, duration: 1,
      source_url: null, props: { text: "Hi" }, removed_at: "2026-10-13T00:00:00.000Z" },
  ] };
  writeTimeline(source, before as never, "seed fixture");
  const sourceTimeline = fs.readFileSync(path.join(root, source, "timeline.json"), "utf8");

  const brief = createAssemblyWorkspace({ ...request, project_id: "variant-vertical", source_project_id: source, copy_source_timeline: true });
  const seed = (brief as { seed?: { elements: number; copy_mode: string } }).seed;
  assert.equal(seed?.elements, 1);
  if (process.platform === "darwin") assert.equal(seed?.copy_mode, "clone");
  const copied = readTimeline("variant-vertical");
  assert.equal(copied.elements.length, 1);
  assert.equal(copied.elements[0].source_url, "/api/projects/variant-vertical/media/.prepared/p/render.mov");
  assert.equal(copied.elements[0].project_id, "variant-vertical");
  assert.equal(readMetadata("variant-vertical").output_aspect_ratio, "9:16");
  assert.equal(readMetadata("variant-vertical").agent_workspace, true);
  assert.equal(readPreparation("variant-vertical", "sources/a.mov")?.state, "ready");
  assert.equal(fs.existsSync(path.join(root, "variant-vertical", "media", "sources", "unused.mov")), false);
  assert.equal(fs.readFileSync(path.join(root, source, "timeline.json"), "utf8"), sourceTimeline);
});

test("copying a source cut requires a source project", () => {
  assert.throws(() => createAssemblyWorkspace({ ...request, project_id: "variant-missing", copy_source_timeline: true }), /source_project_id/);
  assert.equal(fs.existsSync(path.join(root, "variant-missing")), false);
});
