import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createProject } from "./store";
import { ingestMediaPath, ingestMediaBuffer, importedMediaUrl } from "./media-ingest";
import { enqueueMediaPreparation, readPreparation, preparedPlacement, writePreparation } from "./media-preparation";
import { prepareEditorMedia } from "../media-analysis/prepare-editor-media";
import { validatePreviewProxy } from "./preview-proxy-validation";
import { resolveVideoPlaybackSource } from "../remotion/video-preview-source";
import { POST as placeVideo } from "../../app/api/projects/[projectId]/timeline/elements/route";
import { hydrateVideoPreview } from "./preview-media-hydration";
import { stripRuntimePreviewProps, mergeRuntimePreviewProps } from "../timeline/runtime-preview-props";
import { resolvePreviewAudioSource } from "../remotion/video-preview-audio";
import type { TimelineElement } from "../../components/studio/timeline/types";
import { appendCustomCutout, type CustomCutoutReceipt } from "./custom-cutouts";
import { HDR_CODE_ALPHA_VIDEO_RECIPE } from "../media-analysis/color-profile";

test("import prepares one complete source, gates placement, and preserves export authority", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "editor-preparation-"));
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  const previousAuto = process.env.MEDIA_PREPARATION_AUTOSTART;
  const previousProfile = process.env.DREAMCUT_PROFILE_DIR;
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  try {
    createProject("fixture", "web");
    const source = path.join(root, "take.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=1920x1080:r=30:d=0.5", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
    const original = fs.readFileSync(source);
    const imported = ingestMediaPath({ projectId: "fixture", sourcePath: source });
    const url = importedMediaUrl("fixture", imported);
    const pending = readPreparation("fixture", imported.media_path)!;
    assert.equal(hydrateVideoPreview("fixture", url, {}).runtime_preview_preparation?.state, "preparing");
    const place = () => placeVideo(new Request("http://localhost/api/projects/fixture/timeline/elements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "video_clip", source_url: url, timeline_start: 0, duration: 0.3, lane_key: "visual_0", lane_index: 0 }) }), { params: Promise.resolve({ projectId: "fixture" }) });
    assert.equal(pending.state, "preparing");
    assert.throws(() => preparedPlacement("fixture", url, {}), /not ready/);
    assert.equal((await place()).status, 409, "the placement API rejects preparing video");
    const ready = prepareEditorMedia("fixture", pending);
    assert.equal(ready.state, "ready", ready.error);
    assert.ok(ready.audio);
    assert.equal(ready.render, imported.media_path);
    const hydrated = hydrateVideoPreview("fixture", url, {});
    assert.equal(resolveVideoPlaybackSource({ type: "video_clip", props: hydrated }, url, false), hydrated.runtime_preview_source_url);
    assert.equal(resolveVideoPlaybackSource({ type: "video_clip", props: hydrated }, url, true), url);
    assert.equal(resolvePreviewAudioSource({ props: hydrated, volume: 1 }, false), hydrated.runtime_preview_audio_source_url);
    assert.deepEqual(stripRuntimePreviewProps(hydrated), {}, "preview recovery never becomes a timeline edit");
    assert.deepEqual(stripRuntimePreviewProps({
      runtime_compound_clip_id: "compound",
      runtime_compound_preview: { id: "compound" },
    }), {}, "compound preview caches never become timeline edits");
    const current = { id: "existing", source_url: url, timeline_start: 17, props: { media_scale: 0.4 } } as unknown as TimelineElement;
    const incoming = { ...current, timeline_start: 0, props: hydrated };
    const merged = mergeRuntimePreviewProps([current], [incoming])[0]!;
    assert.equal(merged.timeline_start, 17, "cache refresh preserves pending timing edits");
    assert.equal(merged.props?.media_scale, 0.4);
    assert.strictEqual(mergeRuntimePreviewProps([{ ...current, source_url: "changed" }], [incoming])[0]!.props, current.props);
    const placedResponse = await place();
    assert.equal(placedResponse.status, 200, await placedResponse.clone().text());
    const placedTimeline = JSON.parse(fs.readFileSync(path.join(root, "projects/fixture/timeline.json"), "utf8"));
    assert.equal(placedTimeline.elements[0].source_url, url);
    assert.match(placedTimeline.elements[0].props.preview_source_url, /\.prepared\//);
    assert.deepEqual(fs.readFileSync(source), original);
    assert.deepEqual(enqueueMediaPreparation("fixture", imported.media_path), ready);
    const placement = preparedPlacement("fixture", url, { source_interval: { start_seconds: 0.1, duration_seconds: 0.2 } });
    const props = { ...placement.props, preview_proxy_validation: validatePreviewProxy(placement.props.preview_source_url, false) };
    assert.equal(resolveVideoPlaybackSource({ type: "video_clip", props }, placement.source_url, false), placement.props.preview_source_url);
    assert.equal(resolveVideoPlaybackSource({ type: "video_clip", props }, placement.source_url, true), url);
    assert.ok(ready.duration! >= 0.5, "proxy represents the full source, not the editorial window");
    assert.equal(ready.preview_probe?.frame_count, Math.round(ready.preview_probe!.duration_seconds * 30));
    assert.ok(ready.preview_probe!.width <= 640);
    assert.deepEqual(preparedPlacement("fixture", placement.source_url, placement.props), placement, "copy/paste reuses the archival binding");
    assert.throws(() => preparedPlacement("fixture", url + "-unrelated", placement.props), /does not match/);
    const managed = path.join(root, "projects/fixture/media", imported.media_path);
    const stat = fs.statSync(managed);
    fs.utimesSync(managed, stat.atime, new Date(stat.mtimeMs + 2000));
    assert.equal(readPreparation("fixture", imported.media_path), null, "source changes invalidate readiness");
    fs.utimesSync(managed, stat.atime, stat.mtime);
    fs.unlinkSync(path.join(root, "projects/fixture/media", ready.preview!));
    assert.equal(readPreparation("fixture", imported.media_path), null);
    assert.throws(() => preparedPlacement("fixture", url, {}), /not ready/);
    assert.equal(hydrateVideoPreview("fixture", url, {}).runtime_preview_preparation?.state, "preparing", "deleted proxy is requeued before playback");

    const invalid = ingestMediaBuffer({ projectId: "fixture", originalFilename: "broken.mov", buffer: Buffer.from("invalid video") });
    const failed = prepareEditorMedia("fixture", readPreparation("fixture", invalid.media_path)!);
    assert.equal(failed.state, "failed");
    assert.ok(failed.error);
    const retry = enqueueMediaPreparation("fixture", invalid.media_path, true)!;
    assert.equal(retry.state, "preparing");
    assert.equal(retry.error, undefined, "a retry must not present the prior failure as its current error");
    assert.equal(readPreparation("fixture", invalid.media_path)?.error, undefined);
    assert.throws(() => enqueueMediaPreparation("fixture", "../../outside.mov"), /inside/);

    const alphaSource = path.join(root, "alpha.webm");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black@0.0:s=800x600:r=30:d=0.5,format=yuva420p,drawbox=x=200:y=200:w=200:h=200:color=red@1:t=fill", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", alphaSource]);
    const alphaImport = ingestMediaPath({ projectId: "fixture", sourcePath: alphaSource });
    const alphaReady = prepareEditorMedia("fixture", readPreparation("fixture", alphaImport.media_path)!);
    assert.equal(alphaReady.state, "ready", alphaReady.error);
    assert.equal(alphaReady.alpha, true);
    assert.equal(alphaReady.audio, undefined);
    assert.equal(alphaReady.preview_probe!.height, 540, "default alpha preserves viewer detail");
    writePreparation("fixture", {...alphaReady, preview_policy_version: undefined});
    const upgrade = enqueueMediaPreparation("fixture", alphaImport.media_path)!;
    assert.equal(upgrade.state, "preparing", "old default alpha policy upgrades automatically");
    assert.equal(upgrade.preview, alphaReady.preview, "keep the old verified proxy during upgrade");
    const upgraded = prepareEditorMedia("fixture", upgrade);
    assert.equal(upgraded.state, "ready");
    assert.equal(fs.existsSync(path.join(root, "projects/fixture/media", alphaReady.preview!)), false, "the upgrade supersedes the old proxy");
    assert.ok(upgraded.preview!.endsWith(".webm"));
    const alphaBytes = execFileSync("ffmpeg", ["-v", "error", "-c:v", "libvpx-vp9", "-i", path.join(root, "projects/fixture/media", upgraded.preview!), "-vf", "alphaextract", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]);
    assert.ok(alphaBytes[0]! <= 2, "transparent background survives lossy proxy decoding");
    const taggedSource = path.join(root, "tagged-alpha.webm");
    execFileSync("ffmpeg", ["-v", "error", "-i", alphaSource, "-c", "copy", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", taggedSource]);
    const tagged = ingestMediaPath({ projectId: "fixture", sourcePath: taggedSource });
    appendCustomCutout("fixture", { cutout_id: "registered-alpha", output_relative_path: tagged.media_path } as CustomCutoutReceipt);
    const taggedReady = prepareEditorMedia("fixture", readPreparation("fixture", tagged.media_path)!);
    assert.equal(taggedReady.state, "ready", taggedReady.error);
    assert.notEqual(taggedReady.render, tagged.media_path, "an HDR-tagged cutout is not its own render authority");
    assert.equal(taggedReady.color_management?.recipe_id, HDR_CODE_ALPHA_VIDEO_RECIPE, "HDR cutouts take the same code-value conversion as their source");
    assert.equal(taggedReady.alpha, true);
    const taggedUrl = `/api/projects/fixture/media/${tagged.media_path}`;
    assert.equal(validatePreviewProxy(taggedUrl, true).hdr, true);
    assert.equal(validatePreviewProxy(taggedUrl, true).ok, false, "GPU preview decodes SDR only, so an HDR file is never a valid proxy");
    assert.equal(validatePreviewProxy(`/api/projects/fixture/media/${taggedReady.preview}`, true).ok, true);
    writePreparation("fixture", { ...taggedReady, preview: tagged.media_path });
    assert.equal(enqueueMediaPreparation("fixture", tagged.media_path)!.state, "preparing", "a ready package with an HDR preview is prepared again");
    writePreparation("fixture", taggedReady);

    const tailSource = path.join(root, "audio-tail.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30000/1001:d=0.5", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.65", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", tailSource]);
    const tailImport = ingestMediaPath({ projectId: "fixture", sourcePath: tailSource });
    const tailReady = prepareEditorMedia("fixture", readPreparation("fixture", tailImport.media_path)!);
    assert.equal(tailReady.state, "ready", tailReady.error);
    assert.ok(tailReady.duration! > tailReady.preview_probe!.duration_seconds + 0.08, "audio tail does not falsely invalidate picture parity");

    // Exercise the actual import-triggered worker, without manually running preparation.
    delete process.env.MEDIA_PREPARATION_AUTOSTART;
    createProject("automatic", "web");
    const uploaded = ingestMediaBuffer({ projectId: "automatic", originalFilename: "upload.mp4", buffer: original });
    let automatic = readPreparation("automatic", uploaded.media_path);
    const deadline = Date.now() + 20000;
    while (automatic?.state === "preparing" && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      automatic = readPreparation("automatic", uploaded.media_path);
    }
    assert.equal(automatic?.state, "ready", automatic?.error);
    // Wait for the worker to relinquish ownership before deleting the fixture.
    const lock = path.join(root, "projects/automatic/preprocess/media-preparation/worker.lock");
    while (fs.existsSync(lock) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(fs.existsSync(lock), false);
  } finally {
    if (previousProfile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previousProfile;
    if (previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    if (previousAuto === undefined) delete process.env.MEDIA_PREPARATION_AUTOSTART; else process.env.MEDIA_PREPARATION_AUTOSTART = previousAuto;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
