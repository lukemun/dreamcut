import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createProject } from "../local-store/store";
import { ingestMediaPath, importedMediaUrl } from "../local-store/media-ingest";
import { readPreparation, preparedPlacement, writePreparation } from "../local-store/media-preparation";
import { storyboardAssets, readStoryboard, updateStoryboard } from "../local-store/storyboard";
import { prepareBrowsePreview } from "./prepare-browse-preview";
import { prepareEditorMedia } from "./prepare-editor-media";
import { GET as previewSource } from "../../app/api/projects/[projectId]/storyboard/preview/route";
import { probeVideo } from "../../../scripts/lib/color-managed-video";
import { probeHasAlphaChannel } from "./alpha-channel";

test("HDR-tagged VP9 alpha skips opaque browsing conversion even with yuv420p probe format", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alpha-browse-preparation-"));
  const oldRoot = process.env.TIMELINE_PROJECTS_DIR, oldAuto = process.env.MEDIA_PREPARATION_AUTOSTART, oldImport = process.env.DREAMCUT_IMPORT_AUTOSTART;
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0"; process.env.DREAMCUT_IMPORT_AUTOSTART = "0";
  try {
    createProject("fixture", "web");
    const source = path.join(root, "alpha.webm");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=red@0.5:size=32x32:rate=30:duration=0.2,format=yuva420p", "-c:v", "libvpx-vp9", "-auto-alt-ref", "0", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc", path.join(root,"encoded.webm")]);
    execFileSync("ffmpeg", ["-v","error","-i",path.join(root,"encoded.webm"),"-c","copy","-color_primaries","bt2020","-color_trc","arib-std-b67","-colorspace","bt2020nc",source]);
    const probe = probeVideo(source);
    assert.equal(probe.color_transfer, "arib-std-b67");
    assert.equal(probe.color_primaries, "bt2020");
    assert.equal(probe.pixel_format, "yuv420p");
    assert.equal(probe.video_alpha_mode, "1");
    assert.equal(probeHasAlphaChannel(probe), true);
    const imported = ingestMediaPath({ projectId: "fixture", sourcePath: source });
    const record = readPreparation("fixture", imported.media_path)!;
    const before = readPreparation("fixture", imported.media_path);
    assert.equal(prepareBrowsePreview("fixture", record), record);
    assert.deepEqual(readPreparation("fixture", imported.media_path), before);
    assert.equal(record.browse_preview, undefined);
  } finally {
    if (oldRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = oldRoot;
    if (oldAuto === undefined) delete process.env.MEDIA_PREPARATION_AUTOSTART; else process.env.MEDIA_PREPARATION_AUTOSTART = oldAuto;
    if (oldImport === undefined) delete process.env.DREAMCUT_IMPORT_AUTOSTART; else process.env.DREAMCUT_IMPORT_AUTOSTART = oldImport;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("HDR browsing is ready before full quality, retains failed-job playback, and cannot authorize placement", { skip: process.platform !== "darwin" }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "browse-preparation-"));
  const oldRoot = process.env.TIMELINE_PROJECTS_DIR, oldAuto = process.env.MEDIA_PREPARATION_AUTOSTART, oldImport = process.env.DREAMCUT_IMPORT_AUTOSTART;
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects"); process.env.MEDIA_PREPARATION_AUTOSTART = "0"; process.env.DREAMCUT_IMPORT_AUTOSTART = "0";
  try {
    createProject("fixture", "web");
    const source = path.join(root, "hdr.mov");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx265", "-x265-params", "log-level=error", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc", "-c:a", "aac", "-shortest", source]);
    const imported = ingestMediaPath({ projectId: "fixture", sourcePath: source });
    const start = performance.now();
    const browse = prepareBrowsePreview("fixture", readPreparation("fixture", imported.media_path)!);
    const browseMs = performance.now() - start;
    assert.ok(browse.browse_preview, "validated browse stage published");
    assert.equal(browse.state, "preparing");
    assert.equal(browse.stage, "full_quality");
    const asset = storyboardAssets("fixture").find(a => a.source === imported.media_path)!;
    assert.equal(asset.previewReady, true); assert.equal(asset.ready, false);
    const board = readStoryboard("fixture");
    await updateStoryboard("fixture", { action: "save", revision: board.revision, content: { ...board.content, sources: [asset.source], marks: [{ id: "a6d12835-6fdc-43f6-a762-5615182ee67b", source: asset.source, label: "Review range", start: .2, end: .7 }] } });
    assert.equal(readStoryboard("fixture").content.marks.length, 1);
    const url = importedMediaUrl("fixture", imported);
    assert.throws(() => preparedPlacement("fixture", url, {}), /not ready/);
    const request = new Request(`http://localhost/api/projects/fixture/storyboard/preview?source=${encodeURIComponent(imported.media_path)}&start=0.2&duration=0.5`);
    const response = await previewSource(request, { params: Promise.resolve({ projectId: "fixture" }) });
    assert.equal(response.status, 200, await response.clone().text());
    const payload = await response.json();
    assert.equal(payload.durationInFrames, 15);
    assert.equal(payload.elements[0].trim_start, .2);
    assert.ok(payload.elements[0].props.preview_proxy_validation.ok);
    assert.match(payload.elements[0].props.preview_audio_source_url, /audio.m4a$/);
    writePreparation("fixture", { ...browse, state: "failed", error: "Simulated full-quality failure" });
    assert.equal(storyboardAssets("fixture").find(a => a.source === imported.media_path)?.previewReady, true);
    assert.throws(() => preparedPlacement("fixture", url, {}), /not ready/);
    const ready = prepareEditorMedia("fixture", { ...browse, state: "preparing" });
    assert.equal(ready.state, "ready", ready.error);
    assert.ok(ready.color_management?.parity_samples.every(s => s.ssim_all >= .97));
    assert.ok(preparedPlacement("fixture", url, {}).source_url);
    console.log(JSON.stringify({ browseMs: Math.round(browseMs), fullPackageMs: Math.round(performance.now() - start) }));
    const file = path.join(root, "projects/fixture/media", imported.media_path);
    fs.appendFileSync(file, "changed");
    assert.equal(readPreparation("fixture", imported.media_path), null);
  } finally {
    if (oldRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = oldRoot;
    if (oldAuto === undefined) delete process.env.MEDIA_PREPARATION_AUTOSTART; else process.env.MEDIA_PREPARATION_AUTOSTART = oldAuto;
    if (oldImport === undefined) delete process.env.DREAMCUT_IMPORT_AUTOSTART; else process.env.DREAMCUT_IMPORT_AUTOSTART = oldImport;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
