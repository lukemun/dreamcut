/**
 * Prepares a video or audio reference for a provider: only its chosen window, re-encoded to what the model
 * accepts. Video becomes H.264 MP4 at 30 fps with the movie header first (the Cloud reads its length from the
 * header); audio becomes 16-bit WAV. Outputs are job scratch (docs/standards/storage-lifecycle.md): one file per
 * reference in the job's scratch folder, removed once uploaded and when the job ends.
 */
import fs from "node:fs";
import path from "node:path";
import type { AssetDraft, AssetJob } from "./assets";
import { getAssetModel, windowSeconds } from "./asset-models";
import { execMedia, generationDir, probeGenerationSource, resolveGenerationSource } from "../local-store/asset-generation";

/** Free space kept on the project's volume beyond a reference's estimated size. */
const RESERVE_BYTES = 5 * 1024 ** 3;
/** Generous estimate of an encoded reference: about 2 MB per second plus container overhead. */
const estimateBytes = (seconds: number) => Math.ceil(seconds * 2 * 1024 ** 2) + 16 * 1024 ** 2;

type Bounds = { minShort: number; maxShort: number; maxLong: number; maxArea: number; minArea: number };
/** Pixel bounds each provider accepts for a reference video. */
export function videoBounds(draft: AssetDraft): Bounds {
  const m = getAssetModel(draft);
  if (m.id === "seedance-2-reference") return { minShort: 0, maxShort: 1112, maxLong: 1112, minArea: 640 * 640, maxArea: 834 * 1112 };
  if (m.adapter === "o1-edit") return { minShort: 720, maxShort: 2160, maxLong: 2160, minArea: 0, maxArea: Infinity };
  return { minShort: 300, maxShort: 1080, maxLong: 1920, minArea: 0, maxArea: Infinity };
}
/** Even output size inside `bounds`, keeping the source's shape. */
export function fitVideo(width: number, height: number, bounds: Bounds) {
  let scale = 1;
  const short = Math.min(width, height), long = Math.max(width, height);
  scale = Math.min(scale, bounds.maxShort / short, bounds.maxLong / long, Math.sqrt(bounds.maxArea / (width * height)));
  scale = Math.max(scale, bounds.minShort / short, Math.sqrt(bounds.minArea / (width * height)));
  const even = (n: number) => Math.max(2, Math.round(n * scale / 2) * 2);
  return { width: even(width), height: even(height) };
}

export const referenceScratchDir = (projectId: string, jobId: string) => path.join(generationDir(projectId), `${jobId}.references`);

/** The file to upload for reference `index`: the original image, or a prepared window of video or audio. */
export async function referenceUploadFile(job: AssetJob, index: number): Promise<string> {
  const ref = job.references[index], file = resolveGenerationSource(job.projectId, ref.source);
  if (!ref.window) return file;
  const dir = referenceScratchDir(job.projectId, job.id);
  fs.mkdirSync(dir, { recursive: true });
  const seconds = windowSeconds(ref);
  const { bavail, bsize } = fs.statfsSync(dir);
  if (bavail * bsize < estimateBytes(seconds) + RESERVE_BYTES) throw new Error("Not enough free disk space to prepare this reference. Free some space, then resume.");
  const audio = ref.role === "audio";
  const target = path.join(dir, `reference-${index + 1}.${audio ? "wav" : "mp4"}`), partial = `${target}.partial${audio ? ".wav" : ".mp4"}`;
  const window = ["-ss", ref.window.start.toFixed(3), "-t", seconds.toFixed(3), "-i", file];
  if (audio) {
    await execMedia("ffmpeg", ["-v", "error", "-y", ...window, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", partial], { timeout: 300000, maxBuffer: 1024 * 1024 });
  } else {
    const probe = await probeGenerationSource(file);
    const size = fitVideo(probe.width, probe.height, videoBounds(job.request));
    await execMedia("ffmpeg", ["-v", "error", "-y", ...window,
      "-vf", `scale=${size.width}:${size.height}:flags=lanczos,fps=30,format=yuv420p`,
      // Capped so a 30 s reference stays near 30 MB: under Seedance's 50 MB total and the storage project's file limit.
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-maxrate", "8M", "-bufsize", "16M", "-c:a", "aac", "-b:a", "192k", "-ac", "2",
      "-movflags", "+faststart", partial], { timeout: 900000, maxBuffer: 1024 * 1024 });
  }
  fs.renameSync(partial, target);
  return target;
}

/** Removes a prepared reference once uploaded; the source media is untouched. */
export function releaseReferenceFile(job: AssetJob, file: string) {
  const dir = referenceScratchDir(job.projectId, job.id);
  if (path.dirname(file) === dir) fs.rmSync(file, { force: true });
}
/** Removes the job's whole scratch folder (every terminal path). */
export function releaseReferenceScratch(projectId: string, jobId: string) {
  fs.rmSync(referenceScratchDir(projectId, jobId), { recursive: true, force: true });
}
