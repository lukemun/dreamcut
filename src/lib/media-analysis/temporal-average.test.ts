import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runBackgroundCommand } from "../local-store/background-worker";
import { sha256 } from "./custom-cutout";
import { temporalClock, temporalKernel, prepareTemporalAverage } from "./temporal-average";

function fixture() {
  return { streams: [{ width: 64, height: 64, codec_name: "h264", pix_fmt: "yuv420p", avg_frame_rate: "24/1", nb_frames: "9", color_transfer: "bt709" }], frames: Array.from({ length: 9 }, (_, i) => ({ best_effort_timestamp_time: String(i / 24) })) };
}
test("centred preparation rejects unpreservable source clocks and colour", () => {
  assert.equal(temporalClock(fixture()).frameCount, 9);
  for (const patch of [{ color_transfer: "smpte2084" }, { color_range: "pc" }, { pix_fmt: "yuv420p10le" }, { width: 63 }, { tags: { rotate: "90" } }, { side_data_list: [{ rotation: -90 }] }])
    assert.throws(() => temporalClock({ ...fixture(), streams: [{ ...fixture().streams[0], ...patch }] }));
  const vfr = fixture(); vfr.frames[4]!.best_effort_timestamp_time = "0.2";
  assert.throws(() => temporalClock(vfr), /constant-rate/);
  const tail = fixture(); tail.streams[0]!.nb_frames = "10";
  assert.throws(() => temporalClock(tail), /frame count/);
  assert.deepEqual(temporalKernel(5), [1, 2, 4, 2, 1]);
  for (const invalid of [0, 2, 4, 16, NaN, 5.5]) assert.throws(() => temporalKernel(invalid));
});

test("actual native centred average preserves every frame and PTS with extended handles and authenticated source", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "temporal-average-test-"));
  try {
    const raw = path.join(dir, "source.yuv"), source = path.join(dir, "source.mp4"), output = path.join(dir, "average.mp4");
    const frames = Array.from({ length: 9 }, (_, i) => Buffer.concat([Buffer.alloc(64 * 64, 16 + i * 24), Buffer.alloc(64 * 64 / 2, 128)]));
    fs.writeFileSync(raw, Buffer.concat(frames));
    await runBackgroundCommand("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", "64x64", "-r", "24", "-i", raw, "-c:v", "libx264", "-qp", "0", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", source]);
    const hash = await sha256(source);
    await assert.rejects(prepareTemporalAverage(source, source, 5, hash), /preserve the original/);
    await assert.rejects(prepareTemporalAverage(source, output, 5, "0".repeat(64)), /fingerprint/);
    assert.equal(fs.existsSync(output), false);
    const receipt = await prepareTemporalAverage(source, output, 5, hash);
    assert.equal(receipt.frame_count, 9);
    assert.deepEqual(receipt.source_pts, receipt.output_pts);
    assert.equal(receipt.source_sha256, hash);
    assert.equal(await sha256(source), hash);
    assert.equal(await sha256(output), receipt.output_sha256);
    const decoded = path.join(dir, "decoded.yuv");
    await runBackgroundCommand("ffmpeg", ["-v", "error", "-i", output, "-f", "rawvideo", "-pix_fmt", "yuv420p", decoded]);
    const bytes = fs.readFileSync(decoded), stride = 64 * 64 * 3 / 2;
    assert.equal(bytes.length, 9 * stride);
    const weights = temporalKernel(5);
    for (let i = 0; i < 9; i++) {
      const expected = weights.reduce((sum, w, j) => sum + w * (16 + Math.max(0, Math.min(8, i + j - 2)) * 24), 0) / 10;
      assert.ok(Math.abs(bytes[i * stride]! - expected) <= 3, `frame ${i}: ${bytes[i * stride]} versus ${expected}; no trailing pose bias`);
    }
    assert.equal(fs.readdirSync(dir).some(name => /average\.mp4\..*\.mp4/.test(name)), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
