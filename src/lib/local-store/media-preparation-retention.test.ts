import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createProject } from "./store";
import { ingestMediaPath } from "./media-ingest";
import { discardPreparationGeneration, readPreparation, type PreparedMedia } from "./media-preparation";
import { prepareEditorMedia } from "../media-analysis/prepare-editor-media";

function withProjects(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preparation-retention-"));
  const previous = { projects: process.env.TIMELINE_PROJECTS_DIR, auto: process.env.MEDIA_PREPARATION_AUTOSTART, imports: process.env.DREAMCUT_IMPORT_AUTOSTART, profile: process.env.DREAMCUT_PROFILE_DIR };
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  process.env.DREAMCUT_IMPORT_AUTOSTART = "0";
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  try { run(root); } finally {
    for (const [key, value] of [["TIMELINE_PROJECTS_DIR", previous.projects], ["MEDIA_PREPARATION_AUTOSTART", previous.auto], ["DREAMCUT_IMPORT_AUTOSTART", previous.imports], ["DREAMCUT_PROFILE_DIR", previous.profile]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function importClip(root: string): string {
  createProject("fixture", "web");
  const source = path.join(root, "take.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=30:d=0.5", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
  return ingestMediaPath({ projectId: "fixture", sourcePath: source }).media_path;
}

const media = (relative: string) => path.join(process.env.TIMELINE_PROJECTS_DIR!, "fixture", "media", relative);
const reprepare = (source: string, frameRate: number) => prepareEditorMedia("fixture", { ...readPreparation("fixture", source)!, state: "preparing", preview_frame_rate: frameRate } as PreparedMedia);

test("a ready package removes the preview it superseded and keeps what it still uses", () => withProjects(root => {
  const source = importClip(root);
  const first = prepareEditorMedia("fixture", readPreparation("fixture", source)!);
  assert.equal(first.state, "ready", first.error);
  const second = reprepare(source, 25);
  assert.equal(second.state, "ready", second.error);
  assert.notEqual(second.preview, first.preview);
  assert.equal(fs.existsSync(media(first.preview!)), false, "superseded preview removed");
  assert.equal(second.audio, first.audio, "unchanged audio is reused, not re-extracted");
  assert.ok(fs.existsSync(media(second.audio!)));
  assert.ok(fs.existsSync(media(second.preview!)));
  assert.ok(fs.existsSync(media(source)), "original untouched");
  assert.equal(readPreparation("fixture", source)?.state, "ready");
}));

test("a superseded file any project still names is retained", () => withProjects(root => {
  const source = importClip(root);
  const first = prepareEditorMedia("fixture", readPreparation("fixture", source)!);
  assert.equal(first.state, "ready", first.error);
  createProject("other", "web");
  const url = `/api/projects/fixture/media/${first.preview!.split("/").map(encodeURIComponent).join("/")}`;
  fs.writeFileSync(path.join(root, "projects", "other", "timeline.json"), JSON.stringify({ elements: [{ props: { preview_source_url: url } }] }));
  const second = reprepare(source, 25);
  assert.equal(second.state, "ready", second.error);
  assert.ok(fs.existsSync(media(first.preview!)), "a cross-project reference keeps the file");
}));

test("discarding an unpublished generation only accepts a generation directory", () => withProjects(root => {
  importClip(root);
  const generation = `.prepared/editor-media-v1/${"a".repeat(64)}/00000000-0000-4000-8000-000000000000`;
  fs.mkdirSync(media(generation), { recursive: true });
  fs.writeFileSync(media(`${generation}/preview.mp4`), "partial");
  discardPreparationGeneration("fixture", ".prepared/editor-media-v1");
  assert.ok(fs.existsSync(media(generation)));
  discardPreparationGeneration("fixture", generation);
  assert.equal(fs.existsSync(media(generation)), false);
}));
