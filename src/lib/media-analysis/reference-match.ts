import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { projectInstrumentsDir } from "../local-store/paths";
import { cutoutMediaPath } from "./cutout-preparation";
import { spawn } from "node:child_process";
import { probeSource, sha256 } from "./custom-cutout";
import { toolError } from "../agent/tool-error";

/**
 * Reference matching: which part of which supplied take a finished reference shows, frame by frame and
 * region by region, and how closely a candidate edit's frames match the reference at the same times.
 * Measures grayscale mean absolute difference on a small fixed grid; it reads identity and timing, not
 * colour grading, sound or motion between the sampled frames.
 */
export const REFERENCE_MATCH_RECIPE = "reference-match/v1";
/** Analysis grid width; height follows the reference's aspect. */
const GRID_WIDTH = 108;
const MAX_REFERENCE_FRAMES = 900;
const MAX_TAKE_FRAMES = 3600;
/** Frames within this error (0-255) of the best match count as tied. */
const TIE_ERROR = 0.5;
/** A run whose frames mostly tie with this many take frames shows a still region. */
const STILL_TIES = 5;

export type Box = { left: number; top: number; right: number; bottom: number };
export type Region = { name: string; box: Box };
export type Frames = { width: number; height: number; fps: number; frames: Uint8Array[] };
export type FrameMatch = { reference_frame: number; take: number; take_frame: number; error: number; margin: number; ties: number };
export type Segment = {
  take: number; reference_frames: [number, number]; take_frames: [number, number];
  speed: number; static: boolean; mean_error: number; max_error: number;
};

const round = (value: number, places = 3) => Math.round(value * 10 ** places) / 10 ** places;

function pixelBox(box: Box, width: number, height: number) {
  const x0 = Math.max(0, Math.floor(box.left * width)), x1 = Math.min(width, Math.ceil(box.right * width));
  const y0 = Math.max(0, Math.floor(box.top * height)), y1 = Math.min(height, Math.ceil(box.bottom * height));
  if (x1 - x0 < 2 || y1 - y0 < 2) throw toolError("INVALID_REGION", "Each region must cover at least 2% of the frame each way.", { action: "fix_arguments" });
  return { x0, x1, y0, y1 };
}

/** Mean absolute difference (0-255) of two grid frames inside one region. */
export function regionError(a: Uint8Array, b: Uint8Array, width: number, region: ReturnType<typeof pixelBox>) {
  let sum = 0, count = 0;
  for (let y = region.y0; y < region.y1; y++) {
    const row = y * width;
    for (let x = region.x0; x < region.x1; x++) { sum += Math.abs(a[row + x]! - b[row + x]!); count++; }
  }
  return sum / count;
}

/** Best take frame for every reference frame in one region, with the margin to the best frame of any other take. */
export function matchRegion(reference: Frames, takes: Frames[], box: Box): FrameMatch[] {
  const region = pixelBox(box, reference.width, reference.height);
  return reference.frames.map((frame, index) => {
    const perTake = takes.map(take => {
      const errors = take.frames.map(candidate => regionError(frame, candidate, reference.width, region));
      let best = Infinity, at = 0;
      errors.forEach((error, frameIndex) => { if (error < best) { best = error; at = frameIndex; } });
      // Frames of this take that match about as well: many means the region does not move in it.
      return { best, at, ties: errors.filter(error => error <= best + TIE_ERROR).length };
    });
    const order = perTake.map((entry, take) => ({ ...entry, take })).sort((a, b) => a.best - b.best);
    const winner = order[0]!;
    return { reference_frame: index, take: winner.take, take_frame: winner.at, error: round(winner.best, 2), margin: round((order[1]?.best ?? Infinity) - winner.best, 2), ties: winner.ties };
  });
}

/** Least-squares line through a run of take frames: slope (speed), worst and summed squared residuals. */
function lineFit(ys: number[]) {
  const n = ys.length;
  if (n < 2) return { slope: 1, worst: 0, sse: 0 };
  const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  const slope = ys.reduce((sum, y, x) => sum + (x - mx) * (y - my), 0) / ys.reduce((sum, _, x) => sum + (x - mx) ** 2, 0);
  const residuals = ys.map((y, x) => my + slope * (x - mx) - y);
  return { slope, worst: Math.max(...residuals.map(Math.abs)), sse: residuals.reduce((sum, r) => sum + r * r, 0) };
}

/**
 * Group consecutive reference frames that show one take at one steady speed. Frames of one take within
 * 0.6 frames of a straight line are one run (so 1.5x, which alternates steps of 1 and 2, is one run);
 * otherwise the run splits where the two sides fit best, earliest on a tie (a speed change's first
 * frame often lies on both lines). A run that splinters into pieces that are mostly static or one or two
 * frames long, while its frames tie with many take frames, is a still region (an empty plate, a static cup) and reads as one static segment.
 */
export function fitSegments(matches: FrameMatch[], maxError: number): Segment[] {
  const segments: Segment[] = [];
  const emit = (from: number, to: number) => {
    const run = matches.slice(from, to + 1), fit = lineFit(run.map(item => item.take_frame)), errors = run.map(item => item.error);
    segments.push({
      take: run[0]!.take, reference_frames: [from, to], take_frames: [run[0]!.take_frame, run.at(-1)!.take_frame],
      speed: round(fit.slope, 2), static: run.length > 2 && Math.abs(fit.slope) < 0.15,
      mean_error: round(errors.reduce((a, b) => a + b, 0) / errors.length, 2), max_error: round(Math.max(...errors), 2),
    });
  };
  // A region that does not move in its take ties with many take frames, so its best frame jitters: one static segment.
  const emitStill = (from: number, to: number) => {
    const run = matches.slice(from, to + 1), frames = run.map(item => item.take_frame), errors = run.map(item => item.error);
    segments.push({ take: run[0]!.take, reference_frames: [from, to], take_frames: [Math.min(...frames), Math.max(...frames)], speed: 0, static: true,
      mean_error: round(errors.reduce((a, b) => a + b, 0) / errors.length, 2), max_error: round(Math.max(...errors), 2) });
  };
  const split = (from: number, to: number) => {
    const ys = matches.slice(from, to + 1).map(item => item.take_frame);
    const whole = lineFit(ys);
    if (whole.worst <= 0.6 && whole.slope > -0.1) { emit(from, to); return; }
    let best = from, bestCost = Infinity;
    for (let k = from; k < to; k++) {
      const cost = lineFit(ys.slice(0, k - from + 1)).sse + lineFit(ys.slice(k - from + 1)).sse;
      if (cost < bestCost - 1e-9) { bestCost = cost; best = k; }
    }
    split(from, best); split(best + 1, to);
  };
  let start = 0;
  while (start < matches.length) {
    if (matches[start]!.error > maxError) { start++; continue; }
    let end = start;
    while (end + 1 < matches.length && matches[end + 1]!.take === matches[start]!.take && matches[end + 1]!.error <= maxError) end++;
    // Fit lines first; a run that only splinters into short pieces while its frames tie widely is still.
    const before = segments.length;
    split(start, end);
    const pieces = segments.slice(before), length = (piece: Segment) => piece.reference_frames[1] - piece.reference_frames[0] + 1;
    const stillFrames = pieces.filter(piece => piece.static || length(piece) <= 2).reduce((sum, piece) => sum + length(piece), 0);
    const ties = matches.slice(start, end + 1).map(item => item.ties).sort((a, b) => a - b);
    if (pieces.length >= 3 && stillFrames >= 0.7 * (end - start + 1) && ties[Math.floor(ties.length / 2)]! >= STILL_TIES) {
      segments.length = before;
      emitStill(start, end);
    }
    start = end + 1;
  }
  return segments;
}

async function decodeGrid(file: string, width: number, height: number, window?: { start?: number; end?: number }) {
  const args = ["-v", "error", ...(window?.start ? ["-ss", String(window.start)] : []), "-i", file, ...(window?.end !== undefined ? ["-t", String(window.end - (window.start ?? 0))] : []),
    "-vf", `scale=${width}:${height}:flags=area`, "-f", "rawvideo", "-pix_fmt", "gray", "-threads", "1", "-"];
  const stdout = await ffmpegBytes(args);
  const size = width * height, frames: Uint8Array[] = [];
  for (let offset = 0; offset + size <= stdout.length; offset += size) frames.push(new Uint8Array(stdout.subarray(offset, offset + size)));
  return frames;
}

/** ffmpeg's binary output, bounded in time and size. */
function ffmpegBytes(args: string[], timeoutMs = 120_000, maxBytes = 1 << 30): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = []; let size = 0, stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) child.kill("SIGKILL"); else chunks.push(chunk); });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr = (stderr + chunk).slice(-2_000); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); code === 0 && size <= maxBytes ? resolve(Buffer.concat(chunks)) : reject(new Error(`Could not decode the video${stderr ? `: ${stderr.trim().split("\n").at(-1)}` : ""}`)); });
  });
}

type TakeInput = { source_relative_path: string; start_seconds?: number; end_seconds?: number };
type RegionInput = { name: string; box: [number, number, number, number] };

function readRegions(raw: unknown): Region[] {
  if (raw === undefined) return [{ name: "whole frame", box: { left: 0, top: 0, right: 1, bottom: 1 } }];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 6) throw toolError("INVALID_REGION", "Give 1-6 regions.", { action: "fix_arguments" });
  return (raw as RegionInput[]).map(region => {
    const box = region?.box;
    if (typeof region?.name !== "string" || !region.name.trim() || !Array.isArray(box) || box.length !== 4 || box.some(v => typeof v !== "number" || v < 0 || v > 1) || box[2] <= box[0] || box[3] <= box[1]) {
      throw toolError("INVALID_REGION", "Each region needs a name and box [left, top, right, bottom] as fractions of the frame, right > left and bottom > top.", { action: "fix_arguments" });
    }
    return { name: region.name.trim().slice(0, 60), box: { left: box[0], top: box[1], right: box[2], bottom: box[3] } };
  });
}

async function cached<T>(projectId: string, kind: string, key: unknown[], build: (dir: string) => Promise<T>): Promise<T & { manifest_path: string; reused: boolean }> {
  const hash = createHash("sha256").update(JSON.stringify([REFERENCE_MATCH_RECIPE, kind, ...key])).digest("hex");
  const dir = path.join(projectInstrumentsDir(projectId), "reference-match", hash), manifestPath = path.join(dir, "manifest.json");
  try { return { ...JSON.parse(fs.readFileSync(manifestPath, "utf8")) as T, manifest_path: manifestPath, reused: true }; } catch { /* Build below. */ }
  fs.mkdirSync(dir, { recursive: true });
  const result = await build(dir);
  fs.writeFileSync(manifestPath, JSON.stringify(result, null, 2));
  return { ...result, manifest_path: manifestPath, reused: false };
}

/** Which takes, source windows and speeds a reference shows, per region. */
export async function matchReferenceToTakes(projectId: string, body: Record<string, unknown>) {
  if (typeof body.reference_relative_path !== "string") throw toolError("INVALID_INPUT", "reference_relative_path is required: the finished reference imported into this project.", { action: "fix_arguments" });
  const takesInput = body.takes as TakeInput[] | undefined;
  if (!Array.isArray(takesInput) || takesInput.length < 1 || takesInput.length > 6 || takesInput.some(take => typeof take?.source_relative_path !== "string")) {
    throw toolError("INVALID_INPUT", "Give 1-6 takes, each {source_relative_path, optional start_seconds/end_seconds}.", { action: "fix_arguments" });
  }
  const regions = readRegions(body.regions);
  const maxError = typeof body.max_error === "number" && body.max_error > 0 ? body.max_error : 12;
  const referenceFile = cutoutMediaPath(projectId, body.reference_relative_path);
  const takeFiles = takesInput.map(take => cutoutMediaPath(projectId, take.source_relative_path));
  const referenceProbe = await probeSource(referenceFile);
  const aspect = referenceProbe.height / referenceProbe.width;
  const height = Math.max(2, Math.round(GRID_WIDTH * aspect / 2) * 2);
  const takeProbes = await Promise.all(takeFiles.map(file => probeSource(file)));
  takeProbes.forEach((probe, index) => {
    if (Math.abs(probe.height / probe.width - aspect) > 0.01) throw toolError("ASPECT_MISMATCH", `Take ${index + 1} has a different shape from the reference; matching needs the same framing.`, { action: "fix_arguments" });
  });
  const hashes = [await sha256(referenceFile), ...await Promise.all(takeFiles.map(file => sha256(file)))];
  return cached(projectId, "takes", [hashes, takesInput.map(take => [take.start_seconds ?? null, take.end_seconds ?? null]), regions, maxError], async () => {
    const reference: Frames = { width: GRID_WIDTH, height, fps: referenceProbe.frameRate, frames: await decodeGrid(referenceFile, GRID_WIDTH, height) };
    if (reference.frames.length > MAX_REFERENCE_FRAMES) throw toolError("TOO_LONG", `The reference has ${reference.frames.length} frames; trim it to the effect (at most ${MAX_REFERENCE_FRAMES}).`, { action: "fix_arguments" });
    const takes: Frames[] = [];
    for (let i = 0; i < takeFiles.length; i++) {
      const window = { start: takesInput[i]!.start_seconds, end: takesInput[i]!.end_seconds };
      takes.push({ width: GRID_WIDTH, height, fps: takeProbes[i]!.frameRate, frames: await decodeGrid(takeFiles[i]!, GRID_WIDTH, height, window) });
    }
    if (takes.reduce((sum, take) => sum + take.frames.length, 0) > MAX_TAKE_FRAMES) throw toolError("TOO_LONG", `The takes have more than ${MAX_TAKE_FRAMES} frames together; give start_seconds/end_seconds windows.`, { action: "fix_arguments" });
    const takeOffset = takesInput.map(take => take.start_seconds ?? 0);
    const seconds = (take: number, frame: number) => round(takeOffset[take]! + frame / takes[take]!.fps, 4);
    return {
      recipe: REFERENCE_MATCH_RECIPE, mode: "takes",
      reference: { source_relative_path: body.reference_relative_path, sha256: hashes[0], fps: reference.fps, frames: reference.frames.length },
      takes: takesInput.map((take, index) => ({ index, source_relative_path: take.source_relative_path, sha256: hashes[index + 1], fps: takes[index]!.fps, frames: takes[index]!.frames.length, window_start_seconds: takeOffset[index] })),
      max_error: maxError,
      regions: regions.map(region => {
        const matches = matchRegion(reference, takes, region.box);
        const segments = fitSegments(matches, maxError).map(segment => ({
          ...segment,
          take_source_relative_path: takesInput[segment.take]!.source_relative_path,
          reference_seconds: [round(segment.reference_frames[0] / reference.fps, 4), round((segment.reference_frames[1] + 1) / reference.fps, 4)],
          take_source_seconds: [seconds(segment.take, segment.take_frames[0]), seconds(segment.take, segment.take_frames[1])],
        }));
        return {
          name: region.name, box: [region.box.left, region.box.top, region.box.right, region.box.bottom], segments,
          unmatched_reference_frames: matches.filter(item => item.error > maxError).map(item => item.reference_frame),
          frames: matches.map(item => ({ ...item, take_source_seconds: seconds(item.take, item.take_frame) })),
        };
      }),
      limits: `Grayscale mean absolute difference on a ${GRID_WIDTH}x${height} grid (0-255; about 1-3 is the same frame through re-encoding). A static plate matches any of its frames: a static segment's take frames are the range its best matches jittered over; read it as a place, not a time. Segment speed is a straight-line fit within 0.6 take frames; where a speed change starts can read one frame either way. Not colour, sound or motion between frames.`,
    };
  });
}

/** How closely a frame-state report's stills match the reference at the same times, per region, with a side-by-side image. */
export async function compareCandidateToReference(projectId: string, body: Record<string, unknown>) {
  if (typeof body.reference_relative_path !== "string") throw toolError("INVALID_INPUT", "reference_relative_path is required.", { action: "fix_arguments" });
  if (typeof body.frame_state_report !== "string" || path.isAbsolute(body.frame_state_report) || body.frame_state_report.split(/[\\/]/).includes("..")) {
    throw toolError("INVALID_REPORT", "frame_state_report must be a frame-state report relative to the project's instruments folder, e.g. frame-state/frame-state.json.", { action: "select_frame_state_report" });
  }
  const regions = readRegions(body.regions);
  const offset = typeof body.reference_offset_seconds === "number" ? body.reference_offset_seconds : 0;
  const root = fs.realpathSync(projectInstrumentsDir(projectId));
  let reportFile: string;
  try { reportFile = fs.realpathSync(path.join(root, body.frame_state_report)); } catch { throw toolError("INVALID_REPORT", "No frame-state report at that path; run frame-state first.", { action: "regenerate_frame_state", tool: "run_instrument" }); }
  if (!reportFile.startsWith(root + path.sep)) throw toolError("INVALID_REPORT", "The report must be inside the project's instruments folder.", { action: "select_frame_state_report" });
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as { projectId?: string; states?: Array<{ atSeconds: number; frame: number; stillPath: string; read?: { stillSha256?: string } }>; preview?: unknown };
  if (report.projectId !== projectId || !Array.isArray(report.states) || !report.states.length) throw toolError("INVALID_REPORT", "That report is not a frame-state report for this project.", { action: "regenerate_frame_state", tool: "run_instrument" });
  const states = report.states.slice(0, 48);
  const referenceFile = cutoutMediaPath(projectId, body.reference_relative_path);
  const probe = await probeSource(referenceFile);
  const height = Math.max(2, Math.round(GRID_WIDTH * probe.height / probe.width / 2) * 2);
  const stills = await Promise.all(states.map(async state => {
    const file = fs.realpathSync(state.stillPath);
    if (!file.startsWith(root + path.sep)) throw toolError("INVALID_REPORT", "A still escapes the project's instruments folder.", { action: "regenerate_frame_state" });
    const hash = await sha256(file);
    if (state.read?.stillSha256 && state.read.stillSha256 !== hash) throw toolError("CHANGED_IMAGE", "A still changed after frame-state captured it; regenerate the report.", { action: "regenerate_frame_state", tool: "run_instrument" });
    return { file, hash };
  }));
  const referenceHash = await sha256(referenceFile);
  return cached(projectId, "candidate", [referenceHash, stills.map(still => still.hash), states.map(state => state.atSeconds), regions, offset], async dir => {
    const reference = await decodeGrid(referenceFile, GRID_WIDTH, height);
    const boxes = regions.map(region => pixelBox(region.box, GRID_WIDTH, height));
    const whole = pixelBox({ left: 0, top: 0, right: 1, bottom: 1 }, GRID_WIDTH, height);
    const pairs: { input: Buffer; left: number; top: number }[] = [];
    const rows = [];
    for (let i = 0; i < states.length; i++) {
      const state = states[i]!;
      const frame = Math.round((state.atSeconds - offset) * probe.frameRate);
      const candidate = new Uint8Array(await sharp(stills[i]!.file).resize(GRID_WIDTH, height, { fit: "fill" }).grayscale().raw().toBuffer());
      if (frame < 0 || frame >= reference.length) { rows.push({ at_seconds: state.atSeconds, reference_frame: frame, outside_reference: true }); continue; }
      // Best reference frame near the expected one, for timing: a run of offsets shows a slip.
      let best = frame, bestError = Infinity;
      for (let near = Math.max(0, frame - 15); near <= Math.min(reference.length - 1, frame + 15); near++) {
        const error = regionError(candidate, reference[near]!, GRID_WIDTH, whole);
        if (error < bestError) { bestError = error; best = near; }
      }
      rows.push({
        at_seconds: state.atSeconds, reference_frame: frame, best_reference_frame: best, timing_offset_frames: best - frame,
        errors: Object.fromEntries(regions.map((region, r) => [region.name, round(regionError(candidate, reference[frame]!, GRID_WIDTH, boxes[r]!), 2)])),
      });
      if (pairs.length < 36) {
        const cell = pairs.length / 3, left = (cell % 4) * 330, top = Math.floor(cell / 4) * 330;
        const referenceStill = await sharp(await referenceStillPng(referenceFile, frame / probe.frameRate)).resize(160, 284, { fit: "contain", background: "#202020" }).toBuffer();
        const candidateStill = await sharp(stills[i]!.file).resize(160, 284, { fit: "contain", background: "#202020" }).toBuffer();
        pairs.push({ input: referenceStill, left, top }, { input: candidateStill, left: left + 166, top });
        pairs.push({ input: Buffer.from(`<svg width="326" height="40"><text x="4" y="16" fill="white" font-size="13">ref ${frame} | candidate ${Number(state.atSeconds).toFixed(3)} s</text><text x="4" y="34" fill="#bbb" font-size="12">reference left, candidate right</text></svg>`), left, top: top + 286 });
      }
    }
    const cells = Math.ceil(pairs.length / 3);
    const sheet = await sharp({ create: { width: 4 * 330, height: Math.max(1, Math.ceil(cells / 4)) * 330, channels: 3, background: "#202020" } }).composite(pairs).jpeg({ quality: 80 }).toBuffer();
    fs.writeFileSync(path.join(dir, "sheet.jpg"), sheet);
    return {
      recipe: REFERENCE_MATCH_RECIPE, mode: "candidate",
      reference: { source_relative_path: body.reference_relative_path, sha256: referenceHash, fps: probe.frameRate, frames: reference.length },
      frame_state_report: body.frame_state_report, preview: report.preview ?? null, reference_offset_seconds: offset,
      rows, sheet: "sheet.jpg",
      limits: `Grayscale mean absolute difference on a ${GRID_WIDTH}x${height} grid (0-255); the same picture through a render and a re-encoded reference reads about 1-4, so compare rows with each other and look for outliers. timing_offset_frames compares the whole frame within 15 frames. Sampled stills only: not motion between them, sound or colour.`,
    };
  });
}

async function referenceStillPng(file: string, seconds: number) {
  return ffmpegBytes(["-v", "error", "-ss", String(Math.max(0, seconds)), "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]);
}

/** Tool entry: mode takes (default) or candidate. Adds the side-by-side image for candidate mode. */
export async function referenceMatch(projectId: string, body: Record<string, unknown>) {
  const mode = body.mode ?? "takes";
  if (mode === "takes") {
    const result = await matchReferenceToTakes(projectId, body);
    return body.include_frames === true ? result : { ...result, regions: result.regions.map(({ frames: _frames, ...region }) => region) };
  }
  if (mode !== "candidate") throw toolError("INVALID_INPUT", "mode is takes or candidate.", { action: "fix_arguments" });
  const result = await compareCandidateToReference(projectId, body);
  const sheet = path.join(path.dirname(result.manifest_path), "sheet.jpg");
  return { ...result, image: { type: "image", mimeType: "image/jpeg", data: fs.readFileSync(sheet).toString("base64") } };
}
