import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { prepareFixture as bundle } from "@/lib/render/fixture-renderer";
import { renderFixtureVideo as renderMedia, renderFixtureStill as renderStill, selectFixture as selectComposition } from "@/lib/render/fixture-renderer";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const nonce = `${process.pid}-${Date.now()}`;
const identityPath = path.join(tmpdir(), `color-grade-identity-${nonce}.png`);
const warmPath = path.join(tmpdir(), `color-grade-warm-${nonce}.png`);
const advancedPath = path.join(tmpdir(), `color-grade-advanced-${nonce}.png`);
const jpegPath = path.join(tmpdir(), `color-grade-identity-${nonce}.jpg`);
const videoPath = path.join(tmpdir(), `color-grade-advanced-${nonce}.mp4`);
const identityVideoPath = path.join(tmpdir(), `color-grade-identity-${nonce}.mp4`);
const videoFramePath = path.join(tmpdir(), `color-grade-advanced-frame-${nonce}.png`);
const reportPath = path.resolve("testing/results/color-grade/latest.json");

async function pixelAt(file: string, x: number, y: number) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * 4;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, data[offset + 3] ?? 0] as const;
}

async function main() {
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/lib/remotion/ColorGradeFixture.tsx"),
    onProgress: () => undefined,
  });

  try {
    const stillTimings: Record<string, number> = {};
    for (const [id, output] of [
      ["ColorGradeIdentityFixture", identityPath],
      ["ColorGradeWarmFixture", warmPath],
      ["ColorGradeAdvancedFixture", advancedPath],
    ] as const) {
      const composition = await selectComposition({ serveUrl, id, inputProps: {} });
      const startedAt = performance.now();
      await renderStill({ composition, serveUrl, output, imageFormat: "png" });
      stillTimings[id] = Number((performance.now() - startedAt).toFixed(1));
    }

    const jpegComposition = await selectComposition({ serveUrl, id: "ColorGradeIdentityFixture", inputProps: {} });
    const jpegStartedAt = performance.now();
    await renderStill({ composition: jpegComposition, serveUrl, output: jpegPath, imageFormat: "jpeg", jpegQuality: 90 });
    const jpegMs = Number((performance.now() - jpegStartedAt).toFixed(1));

    const identity = await pixelAt(identityPath, 50, 50);
    const warm = await pixelAt(warmPath, 50, 50);
    const advanced = await pixelAt(advancedPath, 50, 50);
    const jpeg = await pixelAt(jpegPath, 50, 50);
    const transparent = await pixelAt(warmPath, 10, 10);

    if (identity.some((value, index) => index < 3 && Math.abs(value - 120) > 2) || identity[3] < 250) {
      throw new Error(`Identity render changed source pixels: ${identity.join("/")}`);
    }
    if (!(warm[0] > warm[1] && warm[1] > warm[2] && warm[3] > 250)) {
      throw new Error(`Warm render did not shift neutral gray toward red: ${warm.join("/")}`);
    }
    if (transparent[3] > 5) throw new Error(`Color grade changed transparent pixels: ${transparent.join("/")}`);
    if (advanced.slice(0, 3).every((value, index) => Math.abs(value - identity[index]!) < 3)) {
      throw new Error(`Advanced render did not change source pixels: ${advanced.join("/")}`);
    }

    const renderBenchmark = async (id: string, outputLocation: string) => {
      const composition = await selectComposition({ serveUrl, id, inputProps: {} });
      composition.width = 1920;
      composition.height = 1080;
      composition.durationInFrames = 900;
      const startedAt = performance.now();
      await renderMedia({
        composition,
        serveUrl,
        outputLocation,
        codec: "h264",
        imageFormat: "png",
        concurrency: 2,
        chromiumOptions: { gl: "angle" },
      });
      return Number((performance.now() - startedAt).toFixed(1));
    };

    const identityMediaMs = await renderBenchmark("ColorGradeIdentityFixture", identityVideoPath);
    const mediaMs = await renderBenchmark("ColorGradeAdvancedFixture", videoPath);
    await execFileAsync("ffmpeg", ["-y", "-ss", "15", "-i", videoPath, "-frames:v", "1", videoFramePath, "-loglevel", "error"]);
    const videoPixel = await pixelAt(videoFramePath, 960, 540);
    const encodedDelta = Math.max(...videoPixel.slice(0, 3).map((value, index) => Math.abs(value - advanced[index]!)));
    if (encodedDelta > 8) throw new Error(`Encoded render diverged from renderStill by ${encodedDelta} levels.`);

    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { dependencies?: Record<string, string> };
    const report = {
      generated_at: new Date().toISOString(),
      fixture: "30 seconds, 1920x1080, 30fps",
      thresholds: { identity_channel_delta: 2, transparent_alpha_max: 5, encoded_channel_delta_max: 8 },
      runtime: { engine: "dreamcut-react-chromium-ffmpeg", playwright: packageJson.dependencies?.["playwright-core"], open_gl: "browser-default", concurrency: 2, intermediate: "png", node_max_rss_kb: process.resourceUsage().maxRSS },
      pixels: { identity, warm, advanced, transparent, encoded: videoPixel, encoded_max_channel_delta: encodedDelta },
      timings_ms: {
        still_png: stillTimings,
        still_jpeg_quality_90: jpegMs,
        render_media_identity_30s: identityMediaMs,
        render_media_advanced_30s: mediaMs,
        advanced_render_ratio: Number((mediaMs / identityMediaMs).toFixed(3)),
      },
      jpeg_experiment: {
        pixel: jpeg,
        max_channel_delta: Math.max(...jpeg.slice(0, 3).map((value, index) => Math.abs(value - identity[index]!))),
        decision: "Keep PNG intermediates for deterministic color and alpha.",
      },
    };
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Color grade render verified. 30s export ${(mediaMs / 1000).toFixed(2)}s; encoded delta ${encodedDelta}; report ${reportPath}`);
  } finally {
    await rm(identityPath, { force: true });
    await rm(warmPath, { force: true });
    await rm(advancedPath, { force: true });
    await rm(jpegPath, { force: true });
    await rm(videoPath, { force: true });
    await rm(identityVideoPath, { force: true });
    await rm(videoFramePath, { force: true });
    await rm(serveUrl, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
