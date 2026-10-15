import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createProject } from "./store";
import { hydratePreviewQuality } from "./preview-quality";
import { enqueueMediaPreparation, prepareProjectPreviews, preparationSourcePath, writePreparation } from "./media-preparation";
import { prepareEditorMedia } from "../media-analysis/prepare-editor-media";
import { writePreviewSettings } from "./preview-settings";
import { parsePreviewQuality, type PreviewQuality } from "../preview-quality";

test("proxy tiers preserve source, timeline, frame clock and alpha; invalid requests stay bounded", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-quality-"));
  const previous = { ...process.env };
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("quality-test", "web");
    const media = path.join(root, "quality-test/media");
    fs.mkdirSync(media, { recursive: true });
    const file = path.join(media, "alpha.webm");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=red@0.5:s=800x800:r=30:d=0.3,format=yuva420p", "-c:v", "libvpx-vp9", "-auto-alt-ref", "0", file]);
    const before = fs.readFileSync(file), timelinePath = path.join(root, "quality-test/timeline.json"), timeline = fs.readFileSync(timelinePath);
    const props = { has_alpha: true, preview_audio_source_url: "/audio-clock.m4a" };
    for (const quality of ["economy", "balanced", "detail"] as PreviewQuality[]) {
      writePreviewSettings(quality);
      const queued = enqueueMediaPreparation("quality-test", "alpha.webm")!;
      assert.equal(queued.preview_quality, quality);
      assert.equal(queued.state, "preparing");
      const pending = hydratePreviewQuality("quality-test", "/api/projects/quality-test/media/alpha.webm", props, quality);
      assert.equal((pending.preview_proxy_validation as {ok: boolean}).ok, quality !== "economy", "An existing verified proxy stays playable during an upgrade");
      if (quality !== "economy") {
        assert.equal((pending.runtime_preview_preparation as {using_previous: boolean}).using_previous, true);
        writePreparation("quality-test", { ...queued, state: "failed", error: "Upgrade failed" });
        const fallback = hydratePreviewQuality("quality-test", "/api/projects/quality-test/media/alpha.webm", props, quality);
        assert.equal((fallback.preview_proxy_validation as {ok: boolean}).ok, true);
        assert.equal((fallback.runtime_preview_preparation as {state: string}).state, "ready");
        writePreparation("quality-test", queued);
      }
      const ready = prepareEditorMedia("quality-test", queued);
      assert.equal(ready.state, "ready", ready.error);
      assert.equal(ready.preview_probe?.frame_count, 9);
      assert.equal(ready.render, "alpha.webm");
      assert.equal(prepareProjectPreviews("quality-test")[0]?.state, "ready");
      const hydrated = hydratePreviewQuality("quality-test", "/api/projects/quality-test/media/alpha.webm", props, quality);
      assert.equal((hydrated.runtime_preview_preparation as { state: string }).state, "ready", JSON.stringify(hydrated));
      const proof = hydrated.preview_proxy_validation as { width: number; height: number; ok: boolean };
      assert.equal(proof.ok, true);
      assert.equal(proof.width, quality === "economy" ? 360 : 540);
      assert.equal(proof.height, proof.width);
      const output = path.join(media, (hydrated.runtime_preview_source_url as string).split("/media/")[1]!);
      assert.equal(output, preparationSourcePath("quality-test", ready.preview!));
      const alpha = execFileSync("ffmpeg", ["-v", "error", "-c:v", "libvpx-vp9", "-i", output, "-vf", "alphaextract", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
      assert.ok(alpha[0]! > 100 && alpha[0]! < 155, "Partial alpha was not retained");
      assert.equal(hydrated.preview_audio_source_url, props.preview_audio_source_url);
    }
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(fs.readFileSync(timelinePath), timeline);
    assert.equal(parsePreviewQuality("original"), "prepared");
    assert.equal(parsePreviewQuality("toString"), "prepared");
    fs.copyFileSync(file, path.join(media, "future-import.webm"));
    assert.equal(enqueueMediaPreparation("quality-test", "future-import.webm")?.preview_quality, "detail");
    writePreviewSettings("economy");
    const shelf = prepareProjectPreviews("quality-test");
    assert.equal(shelf.length, 2);
    assert.ok(shelf.every(record => record?.preview_quality === "economy" && record.state === "preparing"));
  } finally {
    for (const key of ["TIMELINE_PROJECTS_DIR", "DREAMCUT_PROFILE_DIR", "MEDIA_PREPARATION_AUTOSTART"]) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

 test("HD and UHD preparation retains source authority and survives a failed downgrade", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-hd-"));
  const previous = { ...process.env };
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
   createProject("hd-test", "web");
   const file = preparationSourcePath("hd-test", "source.mp4");
   fs.mkdirSync(path.dirname(file), { recursive: true });
   execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=3840x2160:r=30:d=0.1", "-c:v", "libx264", "-preset", "ultrafast", file]);
   const original = fs.readFileSync(file);
   const timelinePath = path.join(root, "hd-test/timeline.json"), timeline = fs.readFileSync(timelinePath);
   for (const quality of ["hd", "uhd"] as const) {
    writePreviewSettings(quality);
    const ready = prepareEditorMedia("hd-test", enqueueMediaPreparation("hd-test", "source.mp4")!);
    assert.equal(ready.state, "ready", ready.error);
    assert.equal(ready.preview_probe?.width, quality === "hd" ? 1920 : 3840);
    assert.equal(ready.preview_probe?.height, quality === "hd" ? 1080 : 2160);
    assert.equal(ready.preview_probe?.frame_count, 3);
    assert.equal(ready.render, "source.mp4");
    const hydrated = hydratePreviewQuality("hd-test", "/api/projects/hd-test/media/source.mp4", {}, quality);
    assert.equal((hydrated.preview_proxy_validation as {ok:boolean}).ok, true);
   }
   writePreviewSettings("economy");
   const pending = enqueueMediaPreparation("hd-test", "source.mp4")!;
   writePreparation("hd-test", {...pending, state:"failed", error:"Synthetic downgrade failure"});
   const retained = hydratePreviewQuality("hd-test", "/api/projects/hd-test/media/source.mp4", {}, "economy");
   assert.equal((retained.preview_proxy_validation as {ok:boolean}).ok, true);
   assert.equal((retained.preview_proxy_validation as {quality:string}).quality, "uhd");
   assert.deepEqual(fs.readFileSync(file), original);
   assert.deepEqual(fs.readFileSync(timelinePath), timeline);
  } finally {
   for (const key of ["TIMELINE_PROJECTS_DIR", "DREAMCUT_PROFILE_DIR", "MEDIA_PREPARATION_AUTOSTART"]) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
   fs.rmSync(root, { recursive:true, force:true });
  }
 });
