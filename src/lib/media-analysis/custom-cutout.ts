import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { appendCustomCutout, type CustomCutoutPoint, type CustomCutoutReceipt } from "@/lib/local-store/custom-cutouts";
import { projectInstrumentsDir, projectMediaDir } from "@/lib/local-store/paths";

// Long windows track in bounded SAM 2 sessions (scripts/matting/hand_cutout.py --chunk-frames), so the
// limit is set by job time, not device memory: three minutes covers a typical talking-head take.
const MAX_INTERVAL_SECONDS = 180;
// SAM 2 tracks roughly one 1080p frame per second on Apple silicon; allow headroom over that.
const SAM_SECONDS_PER_FRAME = 3;
const MIN_SUBPROCESS_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_POINTS_PER_KIND = 16;
const DEFAULT_MAX_HOLE_AREA_RATIO = 0.001;

type Probe = {
  width: number;
  height: number;
  frameRate: number;
  duration: number;
};

export type CustomCutoutRequest = {
  sourceRelativePath: string;
  startSeconds: number;
  endSeconds: number;
  promptSeconds: number;
  positivePoints: CustomCutoutPoint[];
  negativePoints: CustomCutoutPoint[];
};

type CommandResult = { stdout: string; stderr: string };

function finiteNumber(value: unknown, name: string): number {
  const number = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number`);
  return number;
}

function normalizePoints(value: unknown, name: string): CustomCutoutPoint[] {
  if (!Array.isArray(value) || value.length > MAX_POINTS_PER_KIND) {
    throw new Error(`${name} must contain at most ${MAX_POINTS_PER_KIND} points`);
  }
  return value.map((point, index) => {
    if (!point || typeof point !== "object" || Array.isArray(point)) throw new Error(`${name}[${index}] is invalid`);
    const x = finiteNumber((point as { x?: unknown }).x, `${name}[${index}].x`);
    const y = finiteNumber((point as { y?: unknown }).y, `${name}[${index}].y`);
    if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error(`${name}[${index}] must be normalized from 0 to 1`);
    return { x, y };
  });
}

export function normalizeCustomCutoutRequest(value: unknown): CustomCutoutRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid custom cutout request");
  const body = value as Record<string, unknown>;
  const sourceRelativePath = String(body.source_relative_path ?? "").trim();
  if (!sourceRelativePath || path.isAbsolute(sourceRelativePath) || sourceRelativePath.split(/[\\/]/).includes("..")) {
    throw new Error("source_relative_path must identify a project media file");
  }
  const startSeconds = finiteNumber(body.start_seconds, "start_seconds");
  const endSeconds = finiteNumber(body.end_seconds, "end_seconds");
  const promptSeconds = finiteNumber(body.prompt_seconds, "prompt_seconds");
  if (startSeconds < 0 || endSeconds <= startSeconds || endSeconds - startSeconds > MAX_INTERVAL_SECONDS) {
    throw new Error(`Cutout interval must be greater than zero and no longer than ${MAX_INTERVAL_SECONDS} seconds`);
  }
  if (promptSeconds < startSeconds || promptSeconds > endSeconds) throw new Error("prompt_seconds must fall inside the cutout interval");
  const positivePoints = normalizePoints(body.positive_points, "positive_points");
  const negativePoints = normalizePoints(body.negative_points ?? [], "negative_points");
  if (positivePoints.length === 0) throw new Error("Click the object at least once before creating the cutout");
  return { sourceRelativePath, startSeconds, endSeconds, promptSeconds, positivePoints, negativePoints };
}

export function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: options.env ?? process.env, detached: process.platform !== "win32" });
    const timeout = setTimeout(() => {
      try { if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch { /* already exited */ }
    }, options.timeoutMs ?? MIN_SUBPROCESS_TIMEOUT_MS);
    timeout.unref();
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout = (stdout + chunk).slice(-20_000); });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = (stderr + chunk).slice(-20_000); });
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} failed (${code ?? signal}): ${(stderr || stdout).slice(-2_000)}`));
    });
  });
}

/** A long window legitimately runs past the flat 30 minutes; a hung one is still killed. */
export function samTimeoutMs(frameCount: number) {
  return Math.max(MIN_SUBPROCESS_TIMEOUT_MS, (frameCount * SAM_SECONDS_PER_FRAME + 10 * 60) * 1000);
}

function parseRate(value: string | undefined): number {
  if (!value) return 0;
  const [numerator, denominator = "1"] = value.split("/");
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) ? result : 0;
}

export function resolveDisplayDimensions(width: number, height: number, rotation: number) {
  const swapsAxes = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  return swapsAxes ? { width: height, height: width } : { width, height };
}

export async function probeSource(sourcePath: string): Promise<Probe> {
  const result = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate:stream_tags=rotate:stream_side_data=rotation:format=duration",
    "-of", "json", sourcePath,
  ]);
  const parsed = JSON.parse(result.stdout) as {
    streams?: Array<{
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
      tags?: { rotate?: string };
      side_data_list?: Array<{ rotation?: number }>;
    }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const storedWidth = Number(stream?.width);
  const storedHeight = Number(stream?.height);
  // ffmpeg autorotates phone footage while decoding. The mask pipeline must
  // therefore use display dimensions, not the encoded raster dimensions, or
  // alphamerge receives portrait RGB and landscape masks.
  const rotation = Number(stream?.side_data_list?.find((entry) => Number.isFinite(entry.rotation))?.rotation
    ?? stream?.tags?.rotate
    ?? 0);
  const { width, height } = resolveDisplayDimensions(storedWidth, storedHeight, rotation);
  const frameRate = parseRate(stream?.avg_frame_rate) || parseRate(stream?.r_frame_rate);
  const duration = Number(parsed.format?.duration);
  if (!(width > 0) || !(height > 0) || !(frameRate > 0) || !(duration > 0)) throw new Error("Source video probe is incomplete");
  return { width, height, frameRate, duration };
}

export async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function formatPoints(points: CustomCutoutPoint[], probe: Probe): string {
  return points.map((point) => `${Math.round(point.x * (probe.width - 1))},${Math.round(point.y * (probe.height - 1))}`).join(";");
}

function safeStem(relativePath: string): string {
  const stem = path.basename(relativePath, path.extname(relativePath)).replace(/[^A-Za-z0-9._-]/g, "-");
  return stem || "video";
}

export function buildCustomCutoutEncodeArgs(input: {
  sourcePath: string;
  masksPattern: string;
  outputPath: string;
  width: number;
  height: number;
  startSeconds: number;
  durationSeconds: number;
  frameRateText: string;
  frameCount: number;
}): string[] {
  const durationText = input.durationSeconds.toFixed(6);
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", input.startSeconds.toFixed(6), "-t", durationText, "-i", input.sourcePath,
    "-framerate", input.frameRateText, "-start_number", "0", "-i", input.masksPattern,
    "-filter_complex",
    // Decoding already rotated phone footage upright. A multi-input graph would
    // otherwise copy the source display matrix onto these upright pixels, and
    // every player would rotate the cutout a second time.
    `[0:v]fps=${input.frameRateText},trim=end_frame=${input.frameCount},setpts=N/(${input.frameRateText}*TB),sidedata=mode=delete:type=DISPLAYMATRIX[rgb];`
      + `[1:v]trim=end_frame=${input.frameCount},setpts=N/(${input.frameRateText}*TB),scale=${input.width}:${input.height}:flags=lanczos,format=gray,boxblur=1[m];`
      + "[rgb][m]alphamerge,format=yuva420p[out]",
    "-map", "[out]",
    "-frames:v", String(input.frameCount),
    "-c:v", "libvpx-vp9", "-lossless", "1", "-pix_fmt", "yuva420p",
    "-auto-alt-ref", "0", "-row-mt", "1",
    "-metadata:s:v:0", "alpha_mode=1",
    "-map_metadata", "-1",
    "-t", durationText,
    "-an", input.outputPath,
  ];
}

export async function createCustomCutout(input: {
  projectId: string;
  sourcePath: string;
  request: CustomCutoutRequest;
  persist?: boolean;
}): Promise<CustomCutoutReceipt> {
  const { projectId, sourcePath, request } = input;
  const initialSourceHash = await sha256(sourcePath);
  const probe = await probeSource(sourcePath);
  if (request.endSeconds > probe.duration + 0.001) throw new Error("Cutout interval exceeds the source duration");

  const cutoutId = randomUUID();
  const evidenceDir = path.join(projectInstrumentsDir(projectId), "custom-cutouts", cutoutId);
  const framesDir = path.join(evidenceDir, "frames");
  const masksDir = path.join(evidenceDir, "masks");
  const outputDir = path.join(projectMediaDir(projectId), "cutouts");
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(masksDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const intervalDuration = request.endSeconds - request.startSeconds;
  const frameRateText = probe.frameRate.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  const trackingScale = Math.min(1, 960 / Math.max(probe.width, probe.height));
  const trackingWidth = Math.max(2, Math.round((probe.width * trackingScale) / 2) * 2);
  const trackingHeight = Math.max(2, Math.round((probe.height * trackingScale) / 2) * 2);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", request.startSeconds.toFixed(6), "-t", intervalDuration.toFixed(6), "-i", sourcePath,
    "-vf", `fps=${frameRateText},scale=${trackingWidth}:${trackingHeight}:flags=lanczos`,
    "-q:v", "2", "-start_number", "0", path.join(framesDir, "%05d.jpg"),
  ]);

  const frameNames = fs.readdirSync(framesDir).filter((name) => /^\d{5}\.jpg$/.test(name)).sort();
  if (frameNames.length === 0) throw new Error("No frames were extracted for the selected interval");
  const promptFrame = Math.min(
    frameNames.length - 1,
    Math.max(0, Math.round((request.promptSeconds - request.startSeconds) * probe.frameRate)),
  );

  // The subprocess wrapper keeps the machine-local SAM 2 virtualenv and its
  // Homebrew interpreter symlink outside Next/Turbopack's server asset graph.
  const runner = path.resolve(process.cwd(), "scripts", "run-sam2-cutout.mjs");
  const samArgs = [
    "--frames", framesDir,
    "--out", masksDir,
    "--prompt-frame", String(promptFrame),
    "--points", formatPoints(request.positivePoints, { ...probe, width: trackingWidth, height: trackingHeight }),
    "--max-hole-area-ratio", String(DEFAULT_MAX_HOLE_AREA_RATIO),
  ];
  if (request.negativePoints.length > 0) {
    samArgs.push("--negatives", formatPoints(request.negativePoints, { ...probe, width: trackingWidth, height: trackingHeight }));
  }
  await run(process.execPath, [runner, ...samArgs], {
    env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "1" },
    timeoutMs: samTimeoutMs(frameNames.length),
  });

  const outputName = `${safeStem(request.sourceRelativePath)}-cutout-${cutoutId.slice(0, 8)}.webm`;
  const outputPath = path.join(outputDir, outputName);
  await run("ffmpeg", buildCustomCutoutEncodeArgs({
    sourcePath,
    masksPattern: path.join(masksDir, "%05d.png"),
    outputPath,
    width: probe.width,
    height: probe.height,
    startSeconds: request.startSeconds,
    durationSeconds: intervalDuration,
    frameRateText,
    frameCount: frameNames.length,
  }));

  const alphaProbe = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream_tags=alpha_mode", "-of", "json", outputPath,
  ]);
  const alphaTags = (JSON.parse(alphaProbe.stdout) as {
    streams?: Array<{ tags?: Record<string, string> }>;
  }).streams?.[0]?.tags;
  const alphaMode = Object.entries(alphaTags ?? {}).find(
    ([key]) => key.toLowerCase() === "alpha_mode",
  )?.[1];
  if (alphaMode !== "1") throw new Error("Generated cutout did not retain an alpha channel");

  const sourceSha256 = await sha256(sourcePath);
  if (sourceSha256 !== initialSourceHash) throw new Error("Source changed during cutout preparation");
  const outputRelativePath = path.relative(projectMediaDir(projectId), outputPath);
  const receipt: CustomCutoutReceipt = {
    cutout_id: cutoutId,
    recipe_id: "sam2-custom-cutout/v5",
    rgb_source_strategy: "direct-source-decode",
    mask_postprocessing: {
      fill_small_enclosed_holes: true,
      max_hole_area_ratio: DEFAULT_MAX_HOLE_AREA_RATIO,
    },
    source_relative_path: request.sourceRelativePath,
    source_sha256: sourceSha256,
    source_interval_seconds: [request.startSeconds, request.endSeconds],
    prompt_seconds: request.promptSeconds,
    prompt_frame: promptFrame,
    positive_points_normalized: request.positivePoints,
    negative_points_normalized: request.negativePoints,
    output_relative_path: outputRelativePath,
    output_duration_seconds: frameNames.length / probe.frameRate,
    width: probe.width,
    height: probe.height,
    frame_rate: probe.frameRate,
    frame_count: frameNames.length,
    alpha_mode: "1",
    evidence_directory: path.relative(path.dirname(projectInstrumentsDir(projectId)), evidenceDir),
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(evidenceDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  if (input.persist !== false) appendCustomCutout(projectId, receipt);
  return receipt;
}
