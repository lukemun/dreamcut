import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { enqueueCutout, readCutoutJob, verifyCutout } from "./cutout-preparation";
import { run, sha256 } from "./custom-cutout";
import { prepareGridMatteBinding } from "./grid-matte-preparation";
import { normalizeStaticMaskRequest, regionSvg, staticMaskFrameCount, type StaticMaskReceipt } from "./static-subject-mask";
import { subjectWindowBindingIssue, subjectWindowMaskSchema } from "../timeline/subject-window";

const base = { source_relative_path: "source.mp4", start_seconds: 0, end_seconds: 2, subject: "the floor", tracking: "static" };

test("static mask requests are traced from points or drawn as a region, never both", () => {
  assert.equal(normalizeStaticMaskRequest({ ...base, region: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1, y: 1 }] }).from, "drawn");
  assert.equal(normalizeStaticMaskRequest({ ...base, positive_points: [{ x: 0.5, y: 0.9 }] }).promptSeconds, 0);
  assert.throws(() => normalizeStaticMaskRequest({ ...base, positive_points: [{ x: 0.5, y: 0.9 }], region: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }), /not both/);
  assert.throws(() => normalizeStaticMaskRequest(base), /positive_points/);
  assert.throws(() => normalizeStaticMaskRequest({ ...base, region: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }), /3 points/);
  assert.throws(() => normalizeStaticMaskRequest({ ...base, end_seconds: 601, region: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }), /600 seconds/);
  // Every source second of the window has a frame, including a fractional last one.
  assert.equal(staticMaskFrameCount(52, 67.5, 29.9742069776913), 465);
  assert.equal(staticMaskFrameCount(0, 1, 3), 3);
  assert.match(regionSvg([{ x: 0, y: 0.5 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 10, 20), /points="0.00,10.00 10.00,20.00 0.00,20.00"/);
});

test("a drawn static mask completes at once, binds as a subject window and matches a still tracked mask", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "static-mask-"));
  const saved = { TIMELINE_PROJECTS_DIR: process.env.TIMELINE_PROJECTS_DIR, CUTOUT_WORKER_AUTOSTART: process.env.CUTOUT_WORKER_AUTOSTART, MEDIA_PREPARATION_AUTOSTART: process.env.MEDIA_PREPARATION_AUTOSTART };
  process.env.TIMELINE_PROJECTS_DIR = root; process.env.CUTOUT_WORKER_AUTOSTART = "0"; process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  try {
    const projectId = "fixture", project = path.join(root, projectId), media = path.join(project, "media");
    fs.mkdirSync(media, { recursive: true });
    const source = path.join(media, "source.mp4");
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=gray:s=64x32:r=3:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
    const request = { ...base, region: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1, y: 1 }, { x: 0, y: 1 }] };

    const job = await enqueueCutout(projectId, request);
    assert.equal(job.state, "completed", job.error);
    assert.equal(job.reused, false);
    const receipt = job.receipt as StaticMaskReceipt;
    assert.equal(receipt.kind, "static_mask");
    assert.equal(receipt.frame_count, 6);
    assert.equal(job.preview, null);
    await verifyCutout(projectId, receipt);
    // One mask, every frame: the bottom half is kept.
    assert.equal(new Set(receipt.preparation.masks.map(m => m.sha256)).size, 1);
    const pixels = await sharp(path.join(project, receipt.evidence_directory, "masks/00005.png")).greyscale().raw().toBuffer();
    assert.equal(pixels[2 * 64 + 5], 0);
    assert.equal(pixels[30 * 64 + 5], 255);

    // The grid-matte binding is a valid subject window mask covering the clip's whole window.
    const mask = job.grid_matte_mask!;
    assert.ok(subjectWindowMaskSchema.safeParse(mask).success);
    assert.deepEqual({ ...mask, source_url: "" }, { source_url: "", source_start_seconds: 0, fps: 3, frame_count: 6, width: 64, height: 32, source_sha256: await sha256(source) });
    const manifest = JSON.parse(fs.readFileSync(path.join(project, "instruments/grid-mattes", receipt.cutout_id, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.binding, mask);
    const subject = { id: "subject", type: "video_clip", timeline_start: 0, duration: 2, trim_start: 0, trim_end: null, playback_rate: 1, props: { source_sha256: mask.source_sha256 } };
    assert.equal(subjectWindowBindingIssue({ id: "fill", props: { subject_window_parent_id: "subject", subject_window_mask: mask } }, subject, 30), null);

    // A tracked mask of a still subject (the same mask in every frame) publishes the same frames.
    const trackedDir = path.join(project, "instruments/custom-cutouts/tracked/masks");
    fs.mkdirSync(trackedDir, { recursive: true });
    for (const item of receipt.preparation.masks) fs.copyFileSync(path.join(project, receipt.evidence_directory, "masks", item.name), path.join(trackedDir, item.name));
    const tracked = prepareGridMatteBinding(projectId, { ...receipt, cutout_id: "tracked", evidence_directory: "instruments/custom-cutouts/tracked" });
    assert.deepEqual({ ...tracked, source_url: "" }, { ...mask, source_url: "" });
    for (const item of receipt.preparation.masks) {
      assert.equal(await sha256(path.join(project, "instruments/grid-mattes/tracked", item.name)), await sha256(path.join(project, "instruments/grid-mattes", receipt.cutout_id, item.name)));
    }

    // Identical requests reuse the verified result; status re-reads it.
    const again = await enqueueCutout(projectId, request);
    assert.equal(again.id, job.id);
    assert.equal(again.reused, true);
    assert.equal(readCutoutJob(projectId, job.id).receipt?.cutout_id, receipt.cutout_id);
    await assert.rejects(() => enqueueCutout(projectId, { ...request, parent_cutout_id: receipt.cutout_id }), /tracked cutout/);

    // Changed evidence fails verification and the next request prepares afresh.
    const first = path.join(project, receipt.evidence_directory, "masks/00000.png");
    fs.rmSync(first);
    fs.writeFileSync(first, "changed");
    await assert.rejects(() => verifyCutout(projectId, receipt), /changed/);
    const fresh = await enqueueCutout(projectId, request);
    assert.notEqual(fresh.id, job.id);
    assert.equal(fresh.state, "completed", fresh.error);
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
