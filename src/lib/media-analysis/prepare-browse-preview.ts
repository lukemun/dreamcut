import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createAppleColorStage, probeVideo, sha256File, sourceNeedsSdrRenderAuthority } from "../../../scripts/lib/color-managed-video";
import { preparationSourcePath, readPreparation, writePreparation, type PreparedMedia } from "../local-store/media-preparation";
import { probeHasAlphaChannel } from "./alpha-channel";

/** Browsing only: never establishes render/placement readiness. Uses the same Apple color conversion as final preparation. */
export function prepareBrowsePreview(projectId: string, record: PreparedMedia): PreparedMedia {
  if (record.browse_preview || record.state !== "preparing") return record;
  try {
    const source = preparationSourcePath(projectId, record.source);
    const input = probeVideo(source);
    // VP9 alpha commonly probes as yuv420p; its alpha_mode tag is authoritative.
    // The opaque browsing conversion cannot preserve that channel.
    if (!sourceNeedsSdrRenderAuthority(input) || probeHasAlphaChannel(input)) return record;
    const sourceHash = sha256File(source);
    const root = `.prepared/${record.recipe}/${sourceHash}/${randomUUID()}`;
    const file = (name: string) => preparationSourcePath(projectId, `${root}/${name}`);
    fs.mkdirSync(path.dirname(file("browse.mp4")), { recursive: true });
    const pending = { ...record, stage: "preview" as const };
    writePreparation(projectId, pending);
    createAppleColorStage(source, file("color-stage.mov"));
    const stage = probeVideo(file("color-stage.mov"));
    if ([stage.color_space, stage.color_transfer, stage.color_primaries].some(v => v !== "bt709")) throw new Error("Browsing color conversion is not BT.709");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file("color-stage.mov"), "-map", "0:v:0", "-an", "-vf", "fps=30,scale=w='trunc(iw*min(1,640/max(iw,ih))/2)*2':h='trunc(ih*min(1,640/max(iw,ih))/2)*2',setsar=1,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", "30", "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709",  "-movflags", "+faststart", file("browse.mp4")], { stdio: "pipe" });
    const streams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", source], { encoding: "utf8" })).streams;
    const audio = streams.some((s: { codec_type: string }) => s.codec_type === "audio") ? `${root}/audio.m4a` : undefined;
    if (audio) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", source, "-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", file("audio.m4a")], { stdio: "pipe" });
    const p = probeVideo(file("browse.mp4"));
    const [n, d] = (p.frame_rate ?? "0/1").split("/").map(Number);
    if (!p.width || !p.height || Math.max(p.width, p.height) > 640 || p.pixel_format !== "yuv420p" || Math.abs(n / d - 30) > .001 || Math.abs(p.duration_seconds - input.duration_seconds) > .08 || !p.frame_count || Math.abs(p.frame_count - input.duration_seconds * 30) > 3) throw new Error("Browsing preview failed size/timing validation");
    execFileSync("ffmpeg", ["-v", "error", "-i", file("browse.mp4"), "-f", "null", "-"], { stdio: "pipe" });
    const stat = fs.statSync(source);
    if (stat.size !== record.size || stat.mtimeMs !== record.mtime || sha256File(source) !== sourceHash) throw new Error("Source changed during browsing preparation");
    const current = readPreparation(projectId, record.source);
    if (!current || current.preview_quality !== record.preview_quality) return current ?? record;
    const next: PreparedMedia = { ...record, stage: "full_quality", browse_preview: { source_hash: sourceHash, audio, preview: `${root}/browse.mp4`, preview_hash: sha256File(file("browse.mp4")), duration: input.duration_seconds, width: p.width, height: p.height, frame_count: p.frame_count, color_stage: `${root}/color-stage.mov`, color_stage_hash: sha256File(file("color-stage.mov")) } };
    writePreparation(projectId, next);
    return next;
  } catch (error) {
    // Full preparation remains the fallback; it reports any durable failure.
    console.error("Browsing preview unavailable", record.source, error);
    return record;
  }
}
