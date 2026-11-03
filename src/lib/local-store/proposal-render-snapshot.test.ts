import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { createProject, readMetadata, readTimeline, readTimelineSnapshot, writeMetadata, writeTimeline } from "./store";
import { saveProposal } from "./proposals";
import { saveProposalTuning } from "./proposal-tuning";
import { projectDir, projectProposalPath } from "./paths";
import { readProposalRenderSnapshot } from "./proposal-render-snapshot";
import { writePreparation, type PreparedMedia } from "./media-preparation";
import { buildCompositionElements } from "@/lib/render/composition-adapters";
import { evaluateGpuScene } from "@/lib/gpu-preview/scene";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-render-snapshot-"));
process.env.TIMELINE_PROJECTS_DIR = root;
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
function projectBytes(id: string) {
  const dir = projectDir(id);
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => {
      const file = path.join(entry.parentPath, entry.name);
      return [path.relative(dir, file), createHash("sha256").update(fs.readFileSync(file)).digest("hex")];
    }).sort((a, b) => a[0]!.localeCompare(b[0]!));
}
function fixture(id: string, video?: { source: string; props: Record<string, unknown>; trim: number; frameRate?: number }) {
  createProject(id, "web");
  const element: TimelineElement = {
    id: A, project_id: id, type: "video_clip", source_url: "/api/projects/fixture/media/shot.mp4",
    props: video?.props ?? {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: video?.trim ?? 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };
  if (video) element.source_url = video.source;
  writeTimeline(id, { elements: [element, { ...element, id: B, removed_at: "2026-01-01T00:00:01Z" }], transitions: [] }, "fixture");
  const metadata = readMetadata(id);
  writeMetadata(id, { ...metadata, hidden_lane_keys: video ? [] : ["visual_0"], muted_lane_keys: ["visual_0"], frame_rate: video?.frameRate ?? 24 }, "fixture");
  const proposal = validateEditorAgentProposalAgainstProject({
    schema_version: 2, project_id: id, expected_revision: readTimelineSnapshot(id).revision,
    mode: "workshop", decision: "propose", summary: "Shorter opening", assumptions: [], unresolved_gaps: [],
    caps: { max_mutations: 24, requested_mutations: 5, max_renders: 0 },
    options: [
      { id: "short", label: "Short", recommended: true, summary: "Trim", requested_mutations: 1,
        operations: [{ element_id: A, patch: { duration: 3 } }] },
      { id: "long", label: "Long", recommended: false, summary: "Keep more", requested_mutations: 5,
        operations: [{ element_id: A, patch: { duration: 3.5 } },
          { element_id: "33333333-3333-4333-8333-333333333333", set_lane_order: { lane_order_keys: ["visual_0"], muted_lane_keys: [], expected_muted_lane_keys: ["visual_0"] } },
          { element_id: "44444444-4444-4444-8444-444444444444", set_output_format: { aspect_ratio: "9:16", frame_rate: 30 } }] },
    ],
  }, 24, id);
  return saveProposal(id, proposal).proposal_id;
}

test("snapshot preserves complete render state, excludes removed media and leaves authority bytes unchanged", () => {
  const id = "snapshot-state", proposal = fixture(id);
  const before = JSON.stringify({ timeline: readTimeline(id), metadata: readMetadata(id), proposal: fs.readFileSync(projectProposalPath(id, proposal), "utf8") });
  const bytesBefore = projectBytes(id);
  const first = readProposalRenderSnapshot(id, proposal, "short");
  const second = readProposalRenderSnapshot(id, proposal, "short", first.identity);
  // Derivation stamps edited rows at call time; these are not picture/audio inputs.
  const withoutAuditTimes = (value: unknown) => JSON.parse(JSON.stringify(value), (key, item) => key === "updated_at" || key === "created_at" ? undefined : item);
  assert.deepEqual(withoutAuditTimes(first), withoutAuditTimes(second));
  assert.equal(first.identity.kind, "unapproved_proposal_preview");
  assert.equal(first.composition.elements.length, 1);
  assert.equal(first.composition.elements[0]!.duration, 3);
  assert.deepEqual(first.composition.hiddenLaneKeys, ["visual_0"]);
  assert.deepEqual(first.composition.mutedLaneKeys, ["visual_0"]);
  assert.equal(first.composition.frameRate, 24);
  first.composition.elements[0]!.props!.opacity = 0;
  assert.equal(second.composition.elements[0]!.props!.opacity, undefined);
  assert.equal(JSON.stringify({ timeline: readTimeline(id), metadata: readMetadata(id), proposal: fs.readFileSync(projectProposalPath(id, proposal), "utf8") }), before);
  assert.throws(() => readProposalRenderSnapshot(id, proposal, "long", second.identity), /settings changed/);
  const alternative = readProposalRenderSnapshot(id, proposal, "long");
  assert.deepEqual(alternative.composition.laneOrderKeys, ["visual_0"]);
  assert.deepEqual(alternative.composition.mutedLaneKeys, []);
  assert.deepEqual(alternative.composition.hiddenLaneKeys, ["visual_0"]);
  assert.equal(alternative.composition.aspectRatio, "9:16");
  assert.equal(alternative.composition.frameRate, 30);
  assert.deepEqual(projectBytes(id), bytesBefore, "timeline, history, tuning and proposal files are unchanged; no output or event files are added");
});

test("native snapshot uses validated proxy cadence in the GPU fractional-source clock and invalidates changed preparation", () => {
  const id = "snapshot-cadence", url = `/api/projects/${id}/media/source.mp4`;
  const proposal = fixture(id, { source: url, trim: 1.3, frameRate: 30, props: { media_preparation_recipe: "editor-media-v1", preview_source_url: `/api/projects/${id}/media/proxy.mp4` } });
  const dir = path.join(projectDir(id), "media"); fs.mkdirSync(dir, { recursive: true });
  const source = path.join(dir, "source.mp4"), proxy = path.join(dir, "proxy.mp4");
  const encode = (file: string, rate: string) => {
    const result = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=size=32x32:rate=${rate}:duration=6`, "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
    assert.equal(result.status, 0, String(result.stderr));
  };
  encode(source, "30000/1001"); encode(proxy, "30");
  const stat = fs.statSync(source);
  const prepared: PreparedMedia = { recipe: "editor-media-v1", source: "source.mp4", size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs,
    state: "ready", preview: "proxy.mp4", render: "source.mp4", preview_frame_rate: 30, prepared_preview_quality: "prepared" };
  writePreparation(id, prepared);
  const first = readProposalRenderSnapshot(id, proposal, "short");
  const scene = evaluateGpuScene(buildCompositionElements(first.composition.elements, new Set(first.composition.mutedLaneKeys), new Set(first.composition.hiddenLaneKeys)), ["visual_0"], 0, 1080, 1920, "test", first.composition.frameRate, true);
  const layer = scene.layers.find(layer => layer.kind === "video");
  assert.ok(layer && layer.kind === "video");
  assert.equal(layer.source.url, url, "original remains the render authority");
  assert.equal(layer.timeUs, 1_316_666, "GPU source clock matches the verified 30fps proxy, rather than sampling1.300000");
  encode(proxy, "24");
  assert.throws(() => readProposalRenderSnapshot(id, proposal, "short", first.identity), /settings changed/);
  const changed = readProposalRenderSnapshot(id, proposal, "short");
  assert.equal((changed.composition.elements[0]!.props!.preview_proxy_validation as { frame_rate: number }).frame_rate, 24, "probe actual bytes, not stale declared30fps");
  writePreparation(id, { ...prepared, size: stat.size + 1 });
  const stale = readProposalRenderSnapshot(id, proposal, "short");
  assert.equal((stale.composition.elements[0]!.props!.preview_proxy_validation as { ok: boolean }).ok, false, "stale package cannot fall back to its still-existing proxy URL");
});

test("saved tuning is rendered and invalidates an earlier identity without changing the working cut", async () => {
  const id = "snapshot-tuning", proposal = fixture(id);
  const first = readProposalRenderSnapshot(id, proposal, "short");
  const before = JSON.stringify(readTimeline(id));
  await saveProposalTuning(id, proposal, "short", [{ operation_index: 0, target: "patch", field: "duration", value: 2.5 }]);
  assert.throws(() => readProposalRenderSnapshot(id, proposal, "short", first.identity), /settings changed/);
  assert.equal(readProposalRenderSnapshot(id, proposal, "short").composition.elements[0]!.duration, 2.5);
  assert.equal(JSON.stringify(readTimeline(id)), before);
});

test("metadata-only changes and timeline edits invalidate the captured request", () => {
  const id = "snapshot-stale", proposal = fixture(id);
  const first = readProposalRenderSnapshot(id, proposal, "short");
  writeMetadata(id, { ...readMetadata(id), hidden_lane_keys: [] }, "fixture");
  assert.throws(() => readProposalRenderSnapshot(id, proposal, "short", first.identity), /settings changed/);
  const timeline = readTimeline(id);
  timeline.elements[0]!.volume = 0.5;
  writeTimeline(id, timeline, "fixture");
  assert.throws(() => readProposalRenderSnapshot(id, proposal, "short"), /revision changed/);
});

test("resolved and superseded proposals cannot start a candidate render", () => {
  for (const status of ["approved", "rejected", "pending"]) {
    const id = `snapshot-${status}`, proposal = fixture(id);
    const file = projectProposalPath(id, proposal);
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify({ ...record, status,
      ...(status === "pending" ? { resolution: { at: "2026-01-01T00:00:00Z", superseded_by_proposal_id: "replacement" } } : {}) }));
    assert.throws(() => readProposalRenderSnapshot(id, proposal, "short"), /unresolved pending/);
  }
});
