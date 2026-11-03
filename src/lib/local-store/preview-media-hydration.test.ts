import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createProject } from "./store";
import { hydrateVideoPreview } from "./preview-media-hydration";
import { preparationDir, readPreparation } from "./media-preparation";
import { prepareEditorMedia } from "../media-analysis/prepare-editor-media";
import { stripRuntimePreviewProps } from "../timeline/runtime-preview-props";
import { resolveVideoPlaybackSource } from "../remotion/video-preview-source";

test("catalog preview repair preserves source authority and rejects remote/traversal sources", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-preview-repair-"));
  const keys = ["TIMELINE_PROJECTS_DIR", "TIMELINE_VISUAL_CATALOG_DIR", "MEDIA_PREPARATION_AUTOSTART"] as const;
  const previous = keys.map(key => process.env[key]);
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.TIMELINE_VISUAL_CATALOG_DIR = path.join(root, "catalog");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  try {
    createProject("fixture", "web");
    const media = path.join(root, "catalog/media");
    fs.mkdirSync(media, { recursive: true });
    const source = path.join(media, "money.mp4");
    const generate = (color: string) => execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=160x90:r=30:d=0.5`, "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
    generate("green");
    const original = fs.readFileSync(source);
    const timelinePath = path.join(root, "projects/fixture/timeline.json");
    const timeline = fs.readFileSync(timelinePath);
    const url = "/api/visual-catalog/media/money.mp4";
    const props = { chroma_key: { enabled: true } };
    assert.equal(hydrateVideoPreview("fixture", url, props).runtime_preview_preparation?.state, "preparing");
    const records = fs.readdirSync(preparationDir("fixture")).filter(p => p.endsWith(".json"));
    assert.equal(records.length, 1);
    const pending = JSON.parse(fs.readFileSync(path.join(preparationDir("fixture"), records[0]!), "utf8"));
    const ready = prepareEditorMedia("fixture", pending);
    assert.equal(ready.state, "ready", ready.error);
    const hydrated = hydrateVideoPreview("fixture", url, props);
    assert.equal(hydrated.preview_proxy_validation.ok, true);
    assert.equal(resolveVideoPlaybackSource({ type: "video_clip", props: hydrated }, url, true), url);
    assert.equal(resolveVideoPlaybackSource({ type: "video_clip", props: hydrated }, url, false), hydrated.runtime_preview_source_url);
    assert.deepEqual(stripRuntimePreviewProps(hydrated), props);
    assert.deepEqual(fs.readFileSync(source), original);
    assert.deepEqual(fs.readFileSync(timelinePath), timeline);
    assert.equal(hydrateVideoPreview("fixture", "https://example.com/a.mp4", {}).runtime_preview_preparation?.state, "failed");
    assert.equal(hydrateVideoPreview("fixture", "/api/visual-catalog/media/%2e%2e/money.mp4", {}).runtime_preview_preparation?.state, "failed");
    fs.copyFileSync(source, path.join(root, "outside.mp4"));
    fs.symlinkSync(path.join(root, "outside.mp4"), path.join(media, "escape.mp4"));
    assert.equal(hydrateVideoPreview("fixture", "/api/visual-catalog/media/escape.mp4", {}).runtime_preview_preparation?.state, "failed");
    generate("red");
    assert.equal(hydrateVideoPreview("fixture", url, props).runtime_preview_preparation?.state, "preparing", "changed catalog bytes cannot reuse stale preview");
    assert.equal(readPreparation("fixture", pending.source)?.state, "ready", "old immutable preview remains recoverable");
  } finally {
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
