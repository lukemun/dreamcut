import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { applyLaneVisibility, buildCompositionElements } from "@/lib/render/composition-adapters";
import { admitGpuScene } from "@/lib/gpu-preview/scene";
import { captionSafeAreaVisuals } from "@/lib/timeline/caption-coordinate-space";
import { resolveHiddenLaneKeys } from "@/lib/timeline/metadata";
import { checkTimeline } from "@/lib/qc/check-timeline";
import { createProject, readMetadata, restoreProjectHistorySnapshot, writeTimeline, newRowTimestamps } from "./store";
import { projectMetadataPath } from "./paths";
import { PATCH as laneRoute } from "../../app/api/projects/[projectId]/timeline/muted-lanes/route";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lane-visibility-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");

function element(id: string, type: string, lane_key: string, extra: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id, project_id: "p", type, lane_key, lane_index: 0, source_url: `/media/${id}.mp4`,
    timeline_start: 0, duration: 2, volume: 1, playback_rate: 1, trim_start: 0, trim_end: null,
    fade_in: 0, fade_out: 0, props: {}, removed_at: null, removed_reason: null, ...newRowTimestamps(), ...extra,
  } as unknown as TimelineElement;
}

const video = element("v", "video_clip", "visual_0", { props: { volume_envelope: [{ time_seconds: 0, volume: 1 }, { time_seconds: 2, volume: 0.5 }] } });
const still = element("s", "still", "visual_1");
const caption = element("c", "caption_text", "captions_0", { source_url: null, props: { text: "Hi" } });
const music = element("m", "music", "music_0");

test("legacy migration: a muted lane holding visuals is also hidden; audio-only lanes are not", () => {
  const elements = [video, still, caption, music];
  assert.deepEqual(resolveHiddenLaneKeys(undefined, ["visual_0", "captions_0", "music_0"], elements), ["visual_0", "captions_0"]);
  assert.deepEqual(resolveHiddenLaneKeys(undefined, ["music_0"], elements), []);
  // Once the field exists it is authoritative and sanitised; re-reading is idempotent.
  const migrated = resolveHiddenLaneKeys(undefined, ["visual_0", "music_0"], elements);
  assert.deepEqual(resolveHiddenLaneKeys(migrated, ["visual_0", "music_0"], elements), migrated);
  assert.deepEqual(resolveHiddenLaneKeys(["visual_0", "visual_0", "Bad Key", 3], ["visual_0"], elements), ["visual_0"]);
  assert.deepEqual(resolveHiddenLaneKeys([], ["visual_0"], elements), []);
  let reads = 0;
  assert.deepEqual(resolveHiddenLaneKeys(undefined, [], () => { reads++; return elements; }), []);
  assert.equal(reads, 0, "projects without muted lanes never read the timeline");
});

test("readMetadata migrates legacy files lazily without rewriting them", () => {
  createProject("legacy", "web");
  writeTimeline("legacy", { elements: [{ ...video, project_id: "legacy" }, { ...music, project_id: "legacy" }], transitions: [] }, "fixture");
  const file = projectMetadataPath("legacy");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  delete raw.hidden_lane_keys;
  raw.muted_lane_keys = ["visual_0", "music_0"];
  fs.writeFileSync(file, JSON.stringify(raw));
  const before = fs.readFileSync(file, "utf8");
  const metadata = readMetadata("legacy");
  assert.deepEqual(metadata.muted_lane_keys, ["visual_0", "music_0"]);
  assert.deepEqual(metadata.hidden_lane_keys, ["visual_0"]);
  assert.deepEqual(readMetadata("legacy").hidden_lane_keys, ["visual_0"]);
  assert.equal(fs.readFileSync(file, "utf8"), before, "opening a project does not rewrite metadata");
  createProject("fresh", "web");
  assert.deepEqual(readMetadata("fresh").hidden_lane_keys, []);
});

test("legacy result is preserved exactly: muted+hidden removes the actor as the old mute did", () => {
  const legacyMuted = new Set(["visual_0", "visual_1", "captions_0", "music_0"]);
  const hidden = new Set(resolveHiddenLaneKeys(undefined, [...legacyMuted], [video, still, caption, music]));
  assert.deepEqual(buildCompositionElements([video, still, caption, music], legacyMuted, hidden), []);
});

test("mute silences sound and keeps pictures; hide removes pictures and keeps video sound", () => {
  const all = [video, still, caption, music];
  const muted = buildCompositionElements(all, new Set(["visual_0", "visual_1", "captions_0", "music_0"]));
  assert.deepEqual(muted.map((e) => e.id), ["v", "s", "c"]);
  const silentVideo = muted.find((e) => e.id === "v")!;
  assert.equal(silentVideo.volume, 0);
  assert.equal(silentVideo.props?.volume_envelope, undefined);
  assert.equal(silentVideo.picture_hidden, undefined);
  assert.equal(video.props?.volume_envelope !== undefined, true, "source element is not mutated");

  const hidden = buildCompositionElements(all, new Set(), new Set(["visual_0", "visual_1", "captions_0", "music_0"]));
  assert.deepEqual(hidden.map((e) => e.id), ["v", "m"]);
  const soundOnly = hidden.find((e) => e.id === "v")!;
  assert.equal(soundOnly.picture_hidden, true);
  assert.equal(soundOnly.volume, 1);
  assert.ok(soundOnly.props?.volume_envelope);

  // Renderers: Browser GPU draws no hidden picture; captions do not anchor to it.
  const admission = admitGpuScene(hidden, "lane-visibility", "canvaskit");
  assert.equal(admission.supported && admission.elements.length, 0);
  assert.deepEqual(captionSafeAreaVisuals(hidden), []);
  assert.equal(applyLaneVisibility(music, new Set(), new Set(["music_0"])), music);
});

test("QC judges what ships: muted music and hidden captions drop out", () => {
  const input = { canvas: { width: 1080, height: 1920 }, target: "web" as const };
  const base = checkTimeline({ ...input, elements: [caption, music] as never }).findings.length;
  const both = checkTimeline({ ...input, elements: [caption, music] as never, mutedLaneKeys: ["music_0", "captions_0"], hiddenLaneKeys: ["captions_0", "music_0"] });
  assert.ok(both.findings.length <= base);
});

const patch = (projectId: string, body: unknown) => laneRoute(new Request(`http://localhost:3123/api/projects/${projectId}/timeline/muted-lanes`, {
  method: "PATCH", headers: { "content-type": "application/json", "x-dreamcut-client": "editor" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ projectId }) });

test("route sets mute and hide independently with undoable history", async () => {
  createProject("route", "web");
  const muted = await patch("route", { muted_lane_keys: ["music_0"] });
  assert.equal(muted.status, 200);
  assert.deepEqual(await muted.json().then((b) => [b.muted_lane_keys, b.hidden_lane_keys]), [["music_0"], []]);

  const hidden = await patch("route", { hidden_lane_keys: ["visual_0", "visual_0", "BAD"] });
  const body = await hidden.json();
  assert.deepEqual([body.muted_lane_keys, body.hidden_lane_keys], [["music_0"], ["visual_0"]]);
  assert.ok(body.history?.before?.id && body.history?.after?.id);
  assert.deepEqual(readMetadata("route").hidden_lane_keys, ["visual_0"]);

  restoreProjectHistorySnapshot("route", body.history.before.id);
  assert.deepEqual(readMetadata("route").hidden_lane_keys, []);
  assert.deepEqual(readMetadata("route").muted_lane_keys, ["music_0"]);

  const both = await patch("route", { muted_lane_keys: [], hidden_lane_keys: ["captions_0"] });
  assert.deepEqual(await both.json().then((b) => [b.muted_lane_keys, b.hidden_lane_keys]), [[], ["captions_0"]]);
  assert.equal((await patch("route", {})).status, 400);
});
