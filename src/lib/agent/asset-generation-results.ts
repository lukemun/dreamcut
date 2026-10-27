import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ACTIVE_ASSET_STATUSES, type AssetJob, type AssetOutput } from "@/lib/generation/assets";
import { listAssetJobs, probeMediaDuration, readAssetJob, resolveGenerationSource } from "@/lib/local-store/asset-generation";
import { run } from "@/lib/media-analysis/custom-cutout";

export const MAX_WAIT_SECONDS = 120;
const MAX_PREVIEWS = 6, IMAGE_EDGE = 768, VIDEO_CELL_WIDTH = 256;
type ImageContent = { type: "image"; mimeType: "image/jpeg"; data: string };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A generation job's state plus its outputs as MCP images, so the agent and creator see results in chat. Read-only. */
export async function assetGenerationResults(projectId: string, input: { job_id?: string; wait_seconds?: number }) {
  const wait = Math.min(Math.max(input.wait_seconds ?? 0, 0), MAX_WAIT_SECONDS);
  const pick = () => input.job_id ? readAssetJob(projectId, input.job_id) : latestJob(projectId);
  let job = pick();
  for (const deadline = Date.now() + wait * 1000; ACTIVE_ASSET_STATUSES.includes(job.status) && Date.now() < deadline;) {
    await sleep(Math.min(2000, Math.max(deadline - Date.now(), 0)));
    job = readAssetJob(projectId, job.id);
  }
  const images: ImageContent[] = [], outputs = [];
  for (const [index, output] of job.outputs.entries()) {
    const preview = index < MAX_PREVIEWS ? await previewOf(projectId, output).catch(() => null) : null;
    if (preview) images.push(preview.image);
    outputs.push({ id: output.id, kind: output.kind, source: output.source, sha256: output.sha256, kept: Boolean(output.keptSource), ...(preview ? { preview: `image ${images.length}`, preview_shows: preview.shows } : {}) });
  }
  const active = ACTIVE_ASSET_STATUSES.includes(job.status);
  return {
    job: { id: job.id, status: job.status, task: job.request.task, model: job.model ?? job.request.modelId ?? job.request.route, credits: job.quote && "credits" in job.quote ? job.quote.credits : null,
      approval: job.approval?.source ?? null, created_at: job.createdAt, updated_at: job.updatedAt, ...(job.error ? { error: job.error } : {}), ...(job.progress && active ? { progress: job.progress } : {}) },
    outputs,
    ...(job.outputs.length > MAX_PREVIEWS ? { previews_omitted: job.outputs.length - MAX_PREVIEWS } : {}),
    review_url: `/p/${encodeURIComponent(projectId)}/library?generate=results`,
    next_action: active ? "Still generating; call again with wait_seconds to keep waiting. Do not submit again." : job.status === "ready" ? "Show the creator the results in Generate › Results; they keep outputs into Library. Keeping and timeline placement are separate steps." : "No results to review.",
    limits: "Previews are downscaled stills; a video preview is three frames, not playback or sound.",
    images,
  };
}

function latestJob(projectId: string): AssetJob {
  const job = listAssetJobs(projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!job) throw new Error("This project has no generation requests yet.");
  return job;
}

async function previewOf(projectId: string, output: AssetOutput): Promise<{ image: ImageContent; shows: string } | null> {
  const file = resolveGenerationSource(projectId, output.source);
  if (output.kind === "image") return { image: jpeg(await sharp(file).rotate().resize(IMAGE_EDGE, IMAGE_EDGE, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()), shows: "the image" };
  if (output.kind !== "video") return null;
  const duration = await probeMediaDuration(file);
  if (!duration) return null;
  const times = [0.1, 0.5, 0.9].map(f => f * duration), dir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-gen-preview-"));
  try {
    const cells: Buffer[] = [];
    for (const [i, t] of times.entries()) {
      const frame = path.join(dir, `${i}.png`);
      await run("ffmpeg", ["-v", "error", "-y", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-vf", `scale=${VIDEO_CELL_WIDTH}:-2`, "-threads", "1", frame]);
      cells.push(await sharp(frame).toBuffer());
    }
    const { height = VIDEO_CELL_WIDTH } = await sharp(cells[0]).metadata();
    const sheet = await sharp({ create: { width: VIDEO_CELL_WIDTH * cells.length, height, channels: 3, background: "#202020" } })
      .composite(cells.map((input, i) => ({ input, left: i * VIDEO_CELL_WIDTH, top: 0 }))).jpeg({ quality: 82 }).toBuffer();
    return { image: jpeg(sheet), shows: `frames at ${times.map(t => `${t.toFixed(1)}s`).join(", ")}` };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const jpeg = (buffer: Buffer): ImageContent => ({ type: "image", mimeType: "image/jpeg", data: buffer.toString("base64") });
