import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { CustomCutoutPoint } from "../local-store/custom-cutouts";
import { portableRelative, projectDir, projectInstrumentsDir } from "../local-store/paths";
import { finiteNumber, formatPoints, normalizePoints, probeSource, run, sha256, trackingSize } from "./custom-cutout";

/**
 * Static subject mask: one traced (SAM points) or drawn (polygon) mask, repeated for every
 * frame of the source window. For subjects that never move in frame (a floor, a wall, a fixed
 * region), it replaces per-frame SAM tracking. The result has the tracked cutout's mask manifest
 * and source clock, so the grid matte and subject window bind to it unchanged. It prepares no
 * cut-out video.
 */
export const STATIC_MASK_RECIPE = "static-subject-mask/v1";
// No tracking cost, so the window may span a whole long take; frames are hard links to one mask.
const MAX_STATIC_INTERVAL_SECONDS = 600;
const MAX_REGION_POINTS = 64;

export type StaticMaskRequest = {
  sourceRelativePath: string;
  startSeconds: number;
  endSeconds: number;
  promptSeconds: number;
  from: "traced" | "drawn";
  positivePoints: CustomCutoutPoint[];
  negativePoints: CustomCutoutPoint[];
  region: CustomCutoutPoint[];
};

export type StaticMaskReceipt = {
  cutout_id: string;
  recipe_id: typeof STATIC_MASK_RECIPE;
  kind: "static_mask";
  from: "traced" | "drawn";
  source_relative_path: string;
  source_sha256: string;
  source_interval_seconds: [number, number];
  prompt_seconds: number;
  prompt_frame: number;
  positive_points_normalized: CustomCutoutPoint[];
  negative_points_normalized: CustomCutoutPoint[];
  region_normalized: CustomCutoutPoint[];
  width: number;
  height: number;
  frame_rate: number;
  frame_count: number;
  evidence_directory: string;
  created_at: string;
  preparation: {
    cache_key: string;
    masks: Array<{ name: string; sha256: string }>;
    tracking_width: number;
    tracking_height: number;
    subject: string;
  };
};

export function isStaticMaskReceipt(receipt: unknown): receipt is StaticMaskReceipt {
  return !!receipt && typeof receipt === "object" && (receipt as { recipe_id?: unknown }).recipe_id === STATIC_MASK_RECIPE;
}

export function normalizeStaticMaskRequest(body: Record<string, unknown>): StaticMaskRequest {
  const sourceRelativePath = String(body.source_relative_path ?? "").trim();
  if (!sourceRelativePath || path.isAbsolute(sourceRelativePath) || sourceRelativePath.split(/[\\/]/).includes("..")) {
    throw new Error("source_relative_path must identify a project media file");
  }
  const startSeconds = finiteNumber(body.start_seconds, "start_seconds");
  const endSeconds = finiteNumber(body.end_seconds, "end_seconds");
  if (startSeconds < 0 || endSeconds <= startSeconds || endSeconds - startSeconds > MAX_STATIC_INTERVAL_SECONDS) {
    throw new Error(`Static mask interval must be greater than zero and no longer than ${MAX_STATIC_INTERVAL_SECONDS} seconds`);
  }
  const promptSeconds = body.prompt_seconds === undefined ? startSeconds : finiteNumber(body.prompt_seconds, "prompt_seconds");
  if (promptSeconds < startSeconds || promptSeconds > endSeconds) throw new Error("prompt_seconds must fall inside the cutout interval");
  const positivePoints = normalizePoints(body.positive_points ?? [], "positive_points");
  const negativePoints = normalizePoints(body.negative_points ?? [], "negative_points");
  const region = normalizePoints(body.region ?? [], "region", MAX_REGION_POINTS);
  if (region.length > 0 && (positivePoints.length > 0 || negativePoints.length > 0)) {
    throw new Error("A static mask is either traced from positive_points or drawn as a region, not both");
  }
  if (region.length === 0 && positivePoints.length === 0) {
    throw new Error("A static mask needs positive_points to trace on the prompt frame, or a region polygon of at least 3 points");
  }
  if (region.length > 0 && region.length < 3) throw new Error("region needs at least 3 points");
  return { sourceRelativePath, startSeconds, endSeconds, promptSeconds, from: region.length ? "drawn" : "traced", positivePoints, negativePoints, region };
}

/** Same coverage as a tracked window: every source second in [start, end) has a mask frame. */
export function staticMaskFrameCount(startSeconds: number, endSeconds: number, frameRate: number) {
  return Math.max(1, Math.ceil((endSeconds - startSeconds) * frameRate - 1e-6));
}

export function regionSvg(region: CustomCutoutPoint[], width: number, height: number) {
  const points = region.map(({ x, y }) => `${(x * width).toFixed(2)},${(y * height).toFixed(2)}`).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/><polygon points="${points}" fill="#fff"/></svg>`;
}

const hashFile = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/**
 * Trace or draw one mask, then repeat it for every frame. Writes only the static mask's own
 * evidence directory; the caller publishes the grid matte and owns the job record.
 */
export async function createStaticMask(input: {
  projectId: string;
  sourcePath: string;
  request: StaticMaskRequest;
  subject: string;
  cacheKey: string;
}): Promise<StaticMaskReceipt> {
  const { projectId, sourcePath, request } = input;
  const initialSourceHash = await sha256(sourcePath);
  const probe = await probeSource(sourcePath);
  if (request.endSeconds > probe.duration + 0.001) throw new Error("Cutout interval exceeds the source duration");
  const { trackingWidth, trackingHeight } = trackingSize(probe);
  const frameCount = staticMaskFrameCount(request.startSeconds, request.endSeconds, probe.frameRate);
  const promptFrame = Math.min(frameCount - 1, Math.max(0, Math.round((request.promptSeconds - request.startSeconds) * probe.frameRate)));

  const id = randomUUID();
  const dir = path.join(projectInstrumentsDir(projectId), "static-masks", id);
  const masks = path.join(dir, "masks"), frames = path.join(dir, "frames");
  fs.mkdirSync(masks, { recursive: true });
  fs.mkdirSync(frames, { recursive: true });
  // The prompt frame is kept as evidence of what the mask was traced or drawn against.
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", (request.startSeconds + promptFrame / probe.frameRate).toFixed(6), "-i", sourcePath,
    "-frames:v", "1", "-vf", `scale=${trackingWidth}:${trackingHeight}:flags=lanczos`,
    "-q:v", "2", path.join(frames, "00000.jpg"),
  ]);
  if (!fs.existsSync(path.join(frames, "00000.jpg"))) throw new Error("Could not extract the prompt frame");

  const first = path.join(masks, "00000.png");
  if (request.from === "drawn") {
    await sharp(Buffer.from(regionSvg(request.region, trackingWidth, trackingHeight))).greyscale().png().toFile(first);
  } else {
    const traced = path.join(dir, "traced");
    fs.mkdirSync(traced);
    const size = { width: trackingWidth, height: trackingHeight };
    const args = [path.resolve(process.cwd(), "scripts", "run-sam2-cutout.mjs"),
      "--frames", frames, "--out", traced, "--prompt-frame", "0",
      "--points", formatPoints(request.positivePoints, size)];
    if (request.negativePoints.length) args.push("--negatives", formatPoints(request.negativePoints, size));
    await run(process.execPath, args, { env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "1" } });
    fs.renameSync(path.join(traced, "00000.png"), first);
    fs.rmSync(traced, { recursive: true, force: true });
  }
  const meta = await sharp(first).metadata();
  if (meta.width !== trackingWidth || meta.height !== trackingHeight) throw new Error("Static mask geometry differs from the tracking frame");

  const maskSha = hashFile(first);
  const manifest = [{ name: "00000.png", sha256: maskSha }];
  for (let i = 1; i < frameCount; i++) {
    const name = `${String(i).padStart(5, "0")}.png`, dest = path.join(masks, name);
    try { fs.linkSync(first, dest); } catch { fs.copyFileSync(first, dest); }
    manifest.push({ name, sha256: maskSha });
  }
  if (await sha256(sourcePath) !== initialSourceHash) throw new Error("Source changed during static mask preparation");
  const receipt: StaticMaskReceipt = {
    cutout_id: id,
    recipe_id: STATIC_MASK_RECIPE,
    kind: "static_mask",
    from: request.from,
    source_relative_path: request.sourceRelativePath,
    source_sha256: initialSourceHash,
    source_interval_seconds: [request.startSeconds, request.endSeconds],
    prompt_seconds: request.promptSeconds,
    prompt_frame: promptFrame,
    positive_points_normalized: request.positivePoints,
    negative_points_normalized: request.negativePoints,
    region_normalized: request.region,
    width: probe.width,
    height: probe.height,
    frame_rate: probe.frameRate,
    frame_count: frameCount,
    evidence_directory: portableRelative(projectDir(projectId), dir),
    created_at: new Date().toISOString(),
    preparation: { cache_key: input.cacheKey, masks: manifest, tracking_width: trackingWidth, tracking_height: trackingHeight, subject: input.subject },
  };
  fs.writeFileSync(path.join(dir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export function readStaticMask(projectId: string, id: unknown): StaticMaskReceipt {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("Unknown static mask");
  const file = path.join(projectInstrumentsDir(projectId), "static-masks", id, "receipt.json");
  const receipt = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) as unknown : null;
  if (!isStaticMaskReceipt(receipt) || receipt.cutout_id !== id) throw new Error("Unknown static mask");
  return receipt;
}

/** Source bytes and every mask frame must still match the receipt. */
export async function verifyStaticMask(projectId: string, receipt: StaticMaskReceipt, sourcePath: string) {
  if (await sha256(sourcePath) !== receipt.source_sha256) throw new Error("Static mask source changed");
  const root = fs.realpathSync(projectInstrumentsDir(projectId));
  const masks = fs.realpathSync(path.join(projectDir(projectId), receipt.evidence_directory, "masks"));
  if (!masks.startsWith(root + path.sep)) throw new Error("Mask evidence must be inside project instruments");
  const { masks: manifest } = receipt.preparation;
  if (manifest.length !== receipt.frame_count) throw new Error("Incomplete mask manifest");
  // Frames are links to one file; hash each distinct inode once.
  const seen = new Map<string, string>();
  for (let i = 0; i < manifest.length; i++) {
    const item = manifest[i]!, file = path.join(masks, item.name);
    if (item.name !== `${String(i).padStart(5, "0")}.png`) throw new Error("Mask evidence changed or missing");
    let stat: fs.Stats;
    try { stat = fs.statSync(file); } catch { throw new Error("Mask evidence changed or missing"); }
    const inode = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    const hash = seen.get(inode) ?? hashFile(file);
    seen.set(inode, hash);
    if (hash !== item.sha256) throw new Error("Mask evidence changed or missing");
  }
}
