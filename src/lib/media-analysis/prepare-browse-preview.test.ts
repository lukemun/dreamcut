import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createProject } from "../local-store/store";
import { ingestMediaPath, importedMediaUrl } from "../local-store/media-ingest";
import { readPreparation, preparedPlacement, requestRenderAuthorities, writePreparation } from "../local-store/media-preparation";
import { deferredRenderAuthorities, sdrExportSources, sourcesAwaitingRenderAuthority } from "../local-store/export-render-sources";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { storyboardAssets, readStoryboard, updateStoryboard } from "../local-store/storyboard";
import { prepareBrowsePreview } from "./prepare-browse-preview";
import { prepareEditorMedia, prepareRenderAuthority } from "./prepare-editor-media";
import { GET as previewSource } from "../../app/api/projects/[projectId]/storyboard/preview/route";
import { probeVideo } from "../../../scripts/lib/color-managed-video";
import { probeHasAlphaChannel } from "./alpha-channel";
import { validatePreviewProxy } from "../local-store/preview-proxy-validation";

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

// hlg-hevc-10bit: runs on every platform with FFmpeg (no macOS avconvert since ffmpeg-hdr-code-authority-v1).
test("HDR browsing is ready before full quality, retains failed-job playback, and cannot authorize placement", async () => {
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
    // Placeable from the fast proxy alone: no full-resolution authority yet.
    assert.equal(ready.preview_color_management?.recipe_id, "ffmpeg-hdr-code-preview-v1");
    assert.ok(ready.preview_color_management?.parity_samples.every(s => s.ssim_all >= .97));
    assert.deepEqual(ready.render_authority, { state: "deferred" });
    assert.equal(ready.render, imported.media_path, "the original stands in until an export asks for the authority");
    assert.equal(ready.color_management, undefined);
    const placed = preparedPlacement("fixture", url, {});
    assert.equal(placed.source_url, url);
    assert.deepEqual(placed.props.source_color_space, { transfer: "hlg", primaries: "rec2020", max_cll_nits: null }, "the clip decodes HLG in the grade shader");
    assert.ok(validatePreviewProxy(placed.props.preview_source_url, false).ok, "the code-value proxy is a valid SDR-tagged preview");
    const mediaFile = (relative: string) => path.join(root, "projects/fixture/media", relative);
    assert.equal(ready.browse_preview?.color_stage, undefined, "no full-resolution colour stage");
    assert.ok(fs.existsSync(mediaFile(ready.browse_preview!.preview)), "small browsing preview kept");
    assert.equal(ready.audio, browse.browse_preview!.audio, "browsing audio reused, not extracted twice");
    // Export asks for the authority; the worker makes it next to the proxy and every renderer reads it.
    const clip = { id: "clip", type: "video_clip", source_url: placed.source_url, props: placed.props } as unknown as TimelineElement;
    assert.deepEqual(sourcesAwaitingRenderAuthority("fixture", [clip]), [imported.media_path]);
    assert.deepEqual(requestRenderAuthorities("fixture", [imported.media_path], true), { waiting: [imported.media_path], failed: [] });
    const requested = readPreparation("fixture", imported.media_path)!;
    assert.equal(requested.render_authority?.state, "requested");
    assert.equal(preparedPlacement("fixture", url, {}).source_url, url, "requesting the authority does not take the clip out of placement");
    const authority = prepareRenderAuthority("fixture", requested);
    assert.equal(authority.render_authority, undefined, authority.render_authority?.error);
    assert.equal(authority.color_management?.recipe_id, "ffmpeg-hdr-code-authority-v1");
    assert.ok(authority.color_management?.parity_samples.every(s => s.ssim_all >= .97), "kept proxy matches the new authority");
    assert.equal(authority.preview, ready.preview, "the proxy is kept, not made again");
    assert.equal(path.posix.dirname(authority.render!), path.posix.dirname(ready.preview!));
    assert.ok(fs.existsSync(mediaFile(authority.render!)), "render authority kept");
    assert.deepEqual(sourcesAwaitingRenderAuthority("fixture", [clip]), []);
    const authorityUrl = `/api/projects/fixture/media/${authority.render!.split("/").map(encodeURIComponent).join("/")}`;
    assert.equal(deferredRenderAuthorities("fixture", [clip])[0]!.source_url, authorityUrl);
    assert.equal(sdrExportSources("fixture", [clip])[0]!.source_url, authorityUrl);
    assert.equal(preparedPlacement("fixture", url, {}).source_url, authorityUrl, "later placements bind the authority");
    assert.equal(readPreparation("fixture", imported.media_path)?.browse_preview?.preview, ready.browse_preview?.preview);
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
