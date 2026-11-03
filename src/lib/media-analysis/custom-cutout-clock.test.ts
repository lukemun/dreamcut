import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCustomCutoutEncodeArgs } from "./custom-cutout";

const cases = [
  ...["30", "29.998955", "30000/1001"].map(rate => ({ rate, format: "sdr-h264-709" })),
  { rate: "29.998955", format: "hlg-hevc-10bit" },
];
for (const { rate, format } of cases) {
  test(`${format}: cutout alpha frame N stays on picture frame N at ${rate} fps`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cutout-clock-"));
    try {
      const count = 80, width = 64, height = 64;
      const fps = rate.includes("/") ? 30000 / 1001 : Number(rate);
      const source = path.join(root, "source.mp4");
      const encoding = format === "hlg-hevc-10bit"
        ? ["-c:v", "libx265", "-x265-params", "log-level=error:pools=1:frame-threads=1", "-pix_fmt", "yuv420p10le", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc"]
        : ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=red:s=${width}x${height}:r=${rate}`, "-frames:v", String(count), ...encoding, source]);
      for (let frame = 0; frame < count; frame++) {
        const pixels = Buffer.alloc(width * height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          pixels[y * width + x] = (x < width / 2) === (frame % 2 === 0) ? 255 : 0;
        }
        fs.writeFileSync(path.join(root, `${String(frame).padStart(5, "0")}.pgm`), Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`), pixels]));
      }
      const output = path.join(root, "cutout.webm");
      execFileSync("ffmpeg", buildCustomCutoutEncodeArgs({ sourcePath: source, masksPattern: path.join(root, "%05d.pgm"), outputPath: output, width, height, startSeconds: 0, durationSeconds: count / fps, frameRateText: rate, frameCount: count }));
      const alpha = execFileSync("ffmpeg", ["-v", "error", "-c:v", "libvpx-vp9", "-i", output, "-vf", "alphaextract", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"]);
      assert.equal(alpha.length, count * width * height);
      for (let frame = 0; frame < count; frame++) {
        const left = alpha[frame * width * height + 32 * width + 16];
        assert.ok(frame % 2 === 0 ? left > 245 : left < 10, `alpha shifted at frame ${frame}: ${left}`);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
