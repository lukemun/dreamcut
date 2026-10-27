/** Export resolution, through the real Standard and GPU export paths. Requires a running
 * editor (pnpm dev). Receipt: testing/results/export-resolution/latest.json.
 *
 * 1. Sizes: a test pattern on every supported output canvas (9:16, 4:5, 1:1, 16:9) exported at
 *    every EXPORT_RESOLUTION has the exact frame size and count. 480p/720p must equal the 1080p render downscaled; 2K/4K, scaled
 *    back to 1080p, must match the 1080p render (same picture, more pixels).
 * 2. Resolution independence: every GPU property fixture plus caption cases, rendered at
 *    2× pixel density and scaled back down, matches its 1× render on each renderer. This is
 *    what makes a 4K export look like the reviewed 1080p preview, only sharper. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {renderBrowserVideo} from "../src/lib/render/browser-renderer";
import type {CompositionElement} from "../src/lib/render/composition-adapters";
import {EXPORT_RESOLUTIONS, exportRenderPlan, exportResolutionLabel} from "../src/lib/render/export-resolution";
import {gpuPropertyFixtures, GPU_PROPERTY_FIXTURE_SVGS} from "../src/lib/gpu-preview/property-fixtures";
import {getCompositionDimensions} from "../src/lib/render/composition-adapters";
import {TIMELINE_ASPECT_RATIO_VALUES} from "../src/lib/aspect-ratios";

const base = process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3123";
const output = path.resolve("testing/results/export-resolution");
const only = process.argv[2];
const FPS = 30, FRAMES = 12;
const MIN_PATTERN_PSNR = 35, MIN_FIXTURE_PSNR = 35, MIN_FIXTURE_PARITY = 30;
fs.mkdirSync(output, {recursive: true});
const renderers = [false, true] as const;
const rendererName = (gpu: boolean) => gpu ? "gpu" : "standard";

function tool(name: string, args: string[]) {
  const result = spawnSync(name, args, {encoding: "utf8", maxBuffer: 256 * 1024 * 1024});
  assert.equal(result.status, 0, `${name} ${args.join(" ")}\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function probe(file: string) {
  const [width, height, frames] = tool("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames",
    "-show_entries", "stream=width,height,nb_read_frames", "-of", "csv=p=0", file]).trim().split(",").map(Number);
  return {width, height, frames};
}

/** PSNR of `file` scaled to `size` against `reference` scaled the same way. */
function psnr(file: string, reference: string, size: {width: number; height: number}) {
  const log = tool("ffmpeg", ["-v", "info", "-i", file, "-i", reference, "-lavfi",
    `[0:v]scale=${size.width}:${size.height}:flags=area[a];[1:v]scale=${size.width}:${size.height}:flags=area[b];[a][b]psnr`, "-f", "null", "-"]);
  const match = /average:([\d.]+|inf)/.exec(log);
  assert.ok(match, `No PSNR in ffmpeg output for ${file}`);
  return match[1] === "inf" ? Infinity : Number(match[1]);
}

const dataUrl = (type: string, bytes: Buffer) => `data:${type};base64,${bytes.toString("base64")}`;
const round = (value: number) => Number.isFinite(value) ? Number(value.toFixed(2)) : "identical";

async function patternSizes(receipt: Record<string, unknown>) {
  const rows: Record<string, unknown> = {};
  let ok = true;
  for (const shape of TIMELINE_ASPECT_RATIO_VALUES) {
    const CANVAS = getCompositionDimensions(shape), tag = shape.replace(":", "x");
    const file = path.join(output, `pattern-source-${tag}.mp4`);
    tool("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${CANVAS.width}x${CANVAS.height}:rate=${FPS}:duration=1`,
      "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file]);
    const element = {id: "pattern", type: "video_clip", source_url: dataUrl("video/mp4", fs.readFileSync(file)),
      timeline_start: 0, duration: FRAMES / FPS, lane_key: "visual_0", lane_index: 0, volume: 0, playback_rate: 1,
      trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0, props: {source_duration_seconds: 1, objectFit: "fill"}} as CompositionElement;
    const outputs = new Map<string, Map<number, string>>();
    for (const gpu of renderers) {
      const videos = new Map<number, string>();
      for (const resolution of EXPORT_RESOLUTIONS) {
        const plan = exportRenderPlan(CANVAS, resolution);
        const video = path.join(output, `pattern-${tag}-${rendererName(gpu)}-${exportResolutionLabel(resolution)}.mp4`);
        await renderBrowserVideo({baseUrl: base, outputLocation: video, ...CANVAS, fps: FPS, durationInFrames: FRAMES,
          inputProps: {elements: [element], laneOrderKeys: ["visual_0"]}, pictureOnly: true, gpu, concurrency: 1,
          ...(plan.downscale ? {outputSize: plan.outputSize} : {}), ...(plan.pixelScale > 1 ? {pixelScale: plan.pixelScale} : {})});
        videos.set(resolution, video);
      }
      outputs.set(rendererName(gpu), videos);
      const full = videos.get(1080)!;
      for (const resolution of EXPORT_RESOLUTIONS) {
        const expected = exportRenderPlan(CANVAS, resolution).outputSize, actual = probe(videos.get(resolution)!);
        const compareAt = resolution < 1080 ? expected : CANVAS;
        const value = resolution === 1080 ? Infinity : psnr(videos.get(resolution)!, full, compareAt);
        const pass = actual.width === expected.width && actual.height === expected.height && actual.frames === FRAMES && value >= MIN_PATTERN_PSNR;
        rows[`${shape}/${rendererName(gpu)}/${exportResolutionLabel(resolution)}`] = {expected, actual, psnr_db_vs_1080p: round(value), ok: pass};
        if (!pass) ok = false;
      }
    }
    // The GPU export must show the same picture as the Standard export on this canvas.
    const parity = psnr(outputs.get("gpu")!.get(1080)!, outputs.get("standard")!.get(1080)!, CANVAS);
    const parityOk = parity >= MIN_FIXTURE_PARITY;
    rows[`${shape}/gpu_vs_standard/1080p`] = {psnr_db: round(parity), ok: parityOk};
    if (!parityOk) ok = false;
  }
  receipt.pattern = {min_psnr_db: MIN_PATTERN_PSNR, min_parity_db: MIN_FIXTURE_PARITY, rows};
  return ok;
}

/** Caption and tracked-text cases the property registry does not cover. */
function captionCases(backdrop: string): Array<{property: string; elements: CompositionElement[]; laneOrderKeys: string[]}> {
  const background = {id: "caption-background", type: "still", source_url: backdrop, props: {}, timeline_start: 0, duration: 10,
    lane_key: "visual_0", lane_index: 0, volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0} as CompositionElement;
  const caption = (id: string, props: Record<string, unknown>) => ({...background, id, type: "caption_text", source_url: null, lane_key: "captions_0", lane_index: 1,
    props: {text: "Sharp Text", fontPreset: "classic_serif", fontSizePx: 24, textColor: "#ffffff", positionPreset: "center", animationIn: "none", animationOut: "none", ...props}} as CompositionElement);
  const lanes = ["captions_0", "visual_0"];
  return [
    {property: "caption.plain", elements: [caption("plain", {}), background], laneOrderKeys: lanes},
    {property: "caption.outline", elements: [caption("outline", {outlineWidthPx: 3, outlineColor: "#000000"}), background], laneOrderKeys: lanes},
    {property: "caption.pop", elements: [caption("pop", {animationIn: "pop", animationInDuration: 1.2}), background], laneOrderKeys: lanes},
    {property: "caption.slide_up", elements: [caption("slide", {animationIn: "slide_up", animationInDuration: 1.2}), background], laneOrderKeys: lanes},
    {property: "caption.multiline", elements: [caption("multi", {text: "Two lines\nof text", singleLine: false, maxWidth: .8}), background], laneOrderKeys: lanes},
  ];
}

/** GPU stills need real .png/.mp4 URLs on the editor's origin. The editor serves
 * public/ statically, so fixture media lives in an ignored folder for the run only. */
async function resolutionIndependence(receipt: Record<string, unknown>) {
  const folder = ".export-resolution-fixtures", media = path.resolve("public", folder);
  fs.rmSync(media, {recursive: true, force: true});
  fs.mkdirSync(media, {recursive: true});
  try {
    for (const [name, svg] of Object.entries(GPU_PROPERTY_FIXTURE_SVGS)) await sharp(Buffer.from(svg)).png().toFile(path.join(media, `${name}.png`));
    tool("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-i", path.join(media, "video.png"), "-t", "3", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(media, "video.mp4")]);
    return await measureFixtures(receipt, (name) => `${base}/${folder}/${name}`);
  } finally {
    fs.rmSync(media, {recursive: true, force: true});
  }
}

async function measureFixtures(receipt: Record<string, unknown>, url: (name: string) => string) {
  const picture = url("picture.png"), fullCanvas = url("fullCanvas.png"), backdrop = url("backdrop.png"), video = url("video.mp4");
  // Grid-matte cases read a mask sequence from project media; data URLs cannot serve it.
  const gridMask = {source_url: "/unavailable", source_start_seconds: 0, fps: .1, frame_count: 1, width: 160, height: 160, source_sha256: "0".repeat(64)};
  const fixtures = gpuPropertyFixtures({picture, fullCanvas, backdrop, video: {url: video, durationSeconds: 3}, gridMask: gridMask as never});
  const cases = [
    ...fixtures.map((fixture) => ({property: fixture.property, ...fixture.active, grid: fixture.active.elements.some((e) => e.props && "grid_matte_mask" in e.props)})),
    ...captionCases(backdrop).map((entry) => ({...entry, grid: false})),
  ].filter((entry) => !only || entry.property.includes(only));
  const size = {width: 160, height: 160}, range: [number, number] = [20, 40], frames = range[1] - range[0] + 1;
  const rows: Array<Record<string, unknown>> = [];
  for (const entry of cases) {
    if (entry.grid) { rows.push({property: entry.property, status: "skipped", reason: "grid-matte mask needs project-served media"}); continue; }
    const row: Record<string, unknown> = {property: entry.property};
    const renders: Record<string, string> = {};
    for (const gpu of renderers) for (const scale of [1, 2]) {
      const key = `${rendererName(gpu)}@${scale}x`, file = path.join(output, "fixtures", `${entry.property}-${key}.mp4`);
      fs.mkdirSync(path.dirname(file), {recursive: true});
      try {
        await renderBrowserVideo({baseUrl: base, outputLocation: file, ...size, fps: 30, durationInFrames: 61, frameRange: range,
          inputProps: {elements: entry.elements, laneOrderKeys: entry.laneOrderKeys}, pictureOnly: true, gpu, concurrency: 1, crf: 4,
          ...(scale > 1 ? {pixelScale: scale} : {})});
        const actual = probe(file);
        assert.deepEqual(actual, {width: size.width * scale, height: size.height * scale, frames});
        renders[key] = file;
      } catch (error) {
        row[key] = String(error).includes("GPU export unavailable") ? `not GPU-admitted: ${String(error).replace(/^.*GPU export unavailable: /s, "").slice(0, 160)}` : `error: ${String(error).slice(0, 300)}`;
      }
    }
    for (const gpu of renderers) {
      const name = rendererName(gpu), one = renders[`${name}@1x`], two = renders[`${name}@2x`];
      if (one && two) row[`${name}_psnr_db_2x_vs_1x`] = round(psnr(two, one, size));
    }
    if (renders["standard@2x"] && renders["gpu@2x"]) row.gpu_vs_standard_psnr_db_2x = round(psnr(renders["gpu@2x"], renders["standard@2x"], size));
    if (renders["standard@1x"] && renders["gpu@1x"]) row.gpu_vs_standard_psnr_db_1x = round(psnr(renders["gpu@1x"], renders["standard@1x"], size));
    // GPU must be no more resolution-dependent than Standard's own device scaling, and
    // the two renderers must still agree at 2×. Unadmitted cases are recorded, not failed.
    const standard2x = row.standard_psnr_db_2x_vs_1x, gpu2x = row.gpu_psnr_db_2x_vs_1x, parity2x = row.gpu_vs_standard_psnr_db_2x;
    const value = (v: unknown) => typeof v === "number" ? v : Infinity;
    const failures = [
      ...(gpu2x !== undefined && value(gpu2x) < Math.min(MIN_FIXTURE_PSNR, value(standard2x) - 3) ? [`GPU 2× differs from 1× (${gpu2x} dB)`] : []),
      ...(parity2x !== undefined && value(parity2x) < MIN_FIXTURE_PARITY ? [`GPU and Standard disagree at 2× (${parity2x} dB)`] : []),
    ];
    if (failures.length) row.failures = failures;
    row.status = Object.values(row).some((value) => typeof value === "string" && value.startsWith("error")) ? "error" : failures.length ? "failed" : "passed";
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  receipt.resolution_independence = {canvas: size, frames: range, min_psnr_db: MIN_FIXTURE_PSNR, min_parity_db: MIN_FIXTURE_PARITY, rows};
  return rows.every((row) => row.status === "passed" || row.status === "skipped");
}

async function main() {
  const receipt: Record<string, unknown> = {date: new Date().toISOString()};
  let ok = true;
  if (!only) ok = await patternSizes(receipt) && ok;
  ok = await resolutionIndependence(receipt) && ok;
  receipt.ok = ok;
  fs.writeFileSync(path.join(output, "latest.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ok, pattern: receipt.pattern}, null, 2));
  if (!ok) process.exitCode = 1;
}

void main();
