import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readProjectSourceManifest } from "@/lib/local-store/media-ingest";
import { cutoutMediaPath } from "@/lib/media-analysis/cutout-preparation";
import { recordAgentVideoDescription } from "@/lib/local-store/media-import-jobs";
import { readVideoDescription } from "@/lib/local-store/video-descriptions";
import { videoDescriptionTimes } from "@/lib/media-analysis/video-descriptions";
import { withProjectLock } from "@/lib/local-store/store";

const text = (max: number) => z.string().trim().min(1).max(max);
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), asset_id: z.string().optional() }).strict(),
  z.object({ action: z.literal("record"), asset_id: z.string(), summary: text(4000), tags: z.array(text(100)).max(50).default([]),
    frames: z.array(z.object({ time_seconds: z.number().finite().nonnegative(), description: text(2000), tags: z.array(text(100)).max(24) }).strict()).min(1).max(10000),
    uncertainties: z.array(text(1000)).max(100).default([]), author: text(120).default("agent") }).strict(),
]);

const VIDEO = /\.(mov|mp4|m4v|webm)$/i;
async function duration(projectId: string, mediaPath: string) {
  const { stdout } = await promisify(execFile)("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", cutoutMediaPath(projectId, mediaPath)], { timeout: 60_000 });
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Could not read the duration of ${mediaPath}`);
  return seconds;
}

/**
 * Agent-written footage descriptions (MCP media_describe). plan lists each imported video still without a
 * description and the source times to look at; record saves one video's observations for video_search.
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const body = bodySchema.parse(await request.json());
    const videos = readProjectSourceManifest(projectId).assets.filter(asset => VIDEO.test(asset.media_path) && asset.source_sha256);
    if (body.action === "plan") {
      const chosen = body.asset_id ? videos.filter(asset => asset.asset_id === body.asset_id) : videos;
      if (body.asset_id && !chosen.length) throw new Error("No imported video has that asset_id");
      const items = [];
      for (const asset of chosen) {
        if (!body.asset_id && readVideoDescription(asset.source_sha256!)) continue;
        const seconds = await duration(projectId, asset.media_path);
        items.push({ asset_id: asset.asset_id, source_relative_path: asset.media_path, original_filename: asset.original_filename,
          duration_seconds: Number(seconds.toFixed(6)), times_seconds: videoDescriptionTimes(seconds) });
      }
      return NextResponse.json({ videos: items, next: items.length
        ? "Call source_evidence with up to 12 of each video's times_seconds at a time, look at every frame, then media_describe action record with one frame per time in order."
        : "Every imported video already has a description; video_search can find them." });
    }
    const asset = videos.find(item => item.asset_id === body.asset_id);
    if (!asset) throw new Error("No imported video has that asset_id");
    const seconds = await duration(projectId, asset.media_path);
    const job = await withProjectLock(projectId, () => recordAgentVideoDescription(projectId, {
      asset: { asset_id: asset.asset_id, media_path: asset.media_path, source_sha256: asset.source_sha256! },
      duration_seconds: seconds, summary: body.summary, tags: body.tags, frames: body.frames, uncertainties: body.uncertainties, author: body.author,
    }));
    return NextResponse.json({ asset_id: asset.asset_id, status: job.status, frames: body.frames.length, searchable: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
