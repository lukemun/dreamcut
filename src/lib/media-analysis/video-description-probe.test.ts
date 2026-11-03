import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { videoDescriptionDurationFromProbe, probeVideoDescriptionDuration } from "./video-description-probe";
import { videoDescriptionTimes } from "./video-descriptions";

test("description sampling uses video duration ahead of a longer container audio tail", () => {
  assert.equal(videoDescriptionDurationFromProbe({ streams: [{ duration: "7.75" }], format: { duration: "7.786667" } }), 7.75);
  assert.equal(videoDescriptionDurationFromProbe({ streams: [{ nb_frames: "186", avg_frame_rate: "24/1" }], format: { duration: "7.786667" } }), 7.75);
  assert.equal(videoDescriptionDurationFromProbe({ streams: [{}], format: { duration: "2.5" } }), 2.5);
  assert.throws(() => videoDescriptionDurationFromProbe({ streams: [], format: { duration: "2.5" } }), /No video stream/);
  assert.throws(() => videoDescriptionDurationFromProbe({ streams: [{}] }), /Could not read/);
});

test("the final planned seek decodes when audio extends beyond a real 24fps video", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "description-tail-"));
  try {
    const source = path.join(dir, "source.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=24:d=1", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "1.05", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", source]);
    const sample = (seconds: number, name: string) => {
      const image = path.join(dir, name);
      execFileSync("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", source, "-frames:v", "1", image]);
      return fs.existsSync(image);
    };
    assert.equal(sample(1, "old.png"), false, "old container-based ending seeks beyond the picture");
    const duration = await probeVideoDescriptionDuration(source);
    assert.equal(duration, 1);
    assert.equal(sample(videoDescriptionTimes(duration).at(-1)!, "new.png"), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
