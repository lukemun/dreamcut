import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runBackgroundCommand } from "../local-store/background-worker";
import { sha256 } from "./custom-cutout";

export const TEMPORAL_AVERAGE_RECIPE = "centered-temporal-average-v1";
export type TemporalClock = { width: number; height: number; fps: number; frameCount: number; pts: number[]; color: Record<string, string> };
type Probe = { streams?: Array<Record<string, unknown>>; frames?: Array<Record<string, unknown>> };
const rates = (value: unknown) => {
  const [n, d = "1"] = String(value ?? "").split("/");
  return Number(n) / Number(d);
};

/** Refuse clocks/colour that this first recipe cannot preserve; never resample a VFR take. */
export function temporalClock(probe: Probe): TemporalClock {
  const stream = probe.streams?.[0];
  if (!stream) throw new Error("Temporal average requires a video stream");
  const width = Number(stream.width), height = Number(stream.height), fps = rates(stream.avg_frame_rate);
  if (![width, height, fps].every(Number.isFinite) || width < 2 || height < 2 || width % 2 || height % 2 || width * height > 3840 * 2160 || fps < 1 || fps > 60)
    throw new Error("Temporal average requires even video dimensions up to 4K and 1-60 fps");
  if (!["h264", "hevc"].includes(String(stream.codec_name)) || !["yuv420p"].includes(String(stream.pix_fmt)) || stream.color_range === "pc" || ![undefined, "unknown", "bt709"].includes(stream.color_transfer as string | undefined) || ![undefined, "unknown", "bt709"].includes(stream.color_primaries as string | undefined) || ![undefined, "unknown", "bt709"].includes(stream.color_space as string | undefined))
    throw new Error("Temporal average currently requires 8-bit SDR Rec.709 H.264 or HEVC; HDR, full-range and other colour encodings are not supported");
  const tags = stream.tags as Record<string, unknown> | undefined;
  const side = stream.side_data_list as Array<Record<string, unknown>> | undefined;
  if (Number(tags?.rotate ?? 0) % 360 || side?.some(row => Number(row.rotation ?? 0) % 360))
    throw new Error("Temporal average requires footage without rotation metadata");
  const pts = (probe.frames ?? []).map(row => Number(row.best_effort_timestamp_time));
  if (!pts.length || pts.length > fps * 60 || pts.some((t, i) => !Number.isFinite(t) || Math.abs(t - i / fps) > 0.00002))
    throw new Error("Temporal average requires a zero-based constant-rate source up to 60 seconds; variable or discontinuous PTS must not be silently resampled");
  if (stream.nb_frames && Number(stream.nb_frames) !== pts.length)
    throw new Error("Temporal average source frame count does not match decoded timestamps");
  const color: Record<string, string> = {};
  for (const key of ["color_primaries", "color_transfer", "color_space", "color_range"])
    if (typeof stream[key] === "string" && stream[key] !== "unknown") color[key] = stream[key] as string;
  return { width, height, fps, frameCount: pts.length, pts, color };
}

export function temporalKernel(sampleFrames: number) {
  if (!Number.isInteger(sampleFrames) || sampleFrames < 3 || sampleFrames > 15 || sampleFrames % 2 !== 1)
    throw new Error("sample_frames must be an odd integer from 3 through 15");
  const half = (sampleFrames - 1) / 2;
  return Array.from({ length: sampleFrames }, (_, i) => 2 ** (half - Math.abs(i - half)));
}

export function temporalAverageFilter(sampleFrames: number, frameCount: number) {
  const weights = temporalKernel(sampleFrames), half = (sampleFrames - 1) / 2;
  // tmix is trailing. Extend both boundaries, then discard its warm-up so each
  // output frame's weighted centre is the corresponding original source frame.
  return `tpad=start_mode=clone:start=${half}:stop_mode=clone:stop=${half},tmix=frames=${sampleFrames}:weights='${weights.join(" ")}',trim=start_frame=${half * 2}:end_frame=${frameCount + half * 2},setpts=PTS-STARTPTS`;
}

async function probe(file: string) {
  const result = await runBackgroundCommand("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_streams", "-show_frames", "-show_entries", "stream:frame=best_effort_timestamp_time", "-of", "json", file], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  return temporalClock(JSON.parse(result.stdout));
}

/** Internal native preparation worker. Caller owns project containment and unique output path. */
export async function prepareTemporalAverage(source: string, output: string, sampleFrames: number, expectedSourceHash: string) {
  temporalKernel(sampleFrames);
  if (path.resolve(source) === path.resolve(output)) throw new Error("Temporal preparation must preserve the original source");
  if (await sha256(source) !== expectedSourceHash) throw new Error("Temporal average source fingerprint changed before preparation");
  const input = await probe(source);
  const estimatedBytes = input.width * input.height * input.frameCount * 3;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const free = fs.statfsSync(path.dirname(output));
  if (free.bavail * free.bsize < Math.max(512 * 1024 * 1024, estimatedBytes)) throw new Error("Insufficient free space for bounded temporal preparation");
  const staged = `${output}.${randomUUID()}.mp4`;
  try {
    const colorArgs = Object.entries(input.color).flatMap(([key, value]) => [key === "color_space" ? "-colorspace" : key === "color_transfer" ? "-color_trc" : `-${key}`, value]);
    await runBackgroundCommand("ffmpeg", ["-v", "error", "-nostdin", "-y", "-noautorotate", "-i", source, "-map", "0:v:0", "-an", "-vf", temporalAverageFilter(sampleFrames, input.frameCount), "-fps_mode", "cfr", "-r", String(input.fps), "-frames:v", String(input.frameCount), "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", ...colorArgs, "-movflags", "+faststart", staged], { timeout: 20 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 });
    const actual = await probe(staged);
    if (actual.width !== input.width || actual.height !== input.height || actual.frameCount !== input.frameCount || Math.abs(actual.fps - input.fps) > 1e-8 || actual.pts.some((t, i) => Math.abs(t - input.pts[i]!) > 0.00002))
      throw new Error("Temporal average output failed full frame/PTS/geometry parity");
    if (await sha256(source) !== expectedSourceHash) throw new Error("Temporal average source fingerprint changed during preparation");
    const outputHash = await sha256(staged);
    fs.renameSync(staged, output);
    return { recipe: TEMPORAL_AVERAGE_RECIPE, source_sha256: expectedSourceHash, output_sha256: outputHash, width: input.width, height: input.height, frame_rate: input.fps, frame_count: input.frameCount, source_duration_seconds: input.frameCount / input.fps, sample_frames: sampleFrames, weights: temporalKernel(sampleFrames), boundary: "nearest-frame extension", source_pts: input.pts, output_pts: actual.pts, audio: "none", visual_verification: "not_performed" };
  } finally {
    // This worker owns only its unique unpublished partial output.
    fs.rmSync(staged, { force: true });
  }
}
