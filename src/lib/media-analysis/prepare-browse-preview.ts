import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { hdrSourceEncoding, probeVideo, sha256File, sourceNeedsSdrRenderAuthority } from "../../../scripts/lib/color-managed-video";
import { filterPath, hdrToSdrDisplayCube, writeCube } from "../color/ffmpeg-cubes";
import { discardPreparationGeneration, preparationSourcePath, readPreparation, writePreparation, type PreparedMedia } from "../local-store/media-preparation";
import { probeHasAlphaChannel } from "./alpha-channel";

/**
 * Browsing only: never establishes render/placement readiness. An SDR picture of an HDR source, made with
 * the editor's own output transform (a cube from src/lib/color), so browsing matches the timeline at identity.
 */
export function prepareBrowsePreview(projectId: string, record: PreparedMedia): PreparedMedia {
  if (record.browse_preview || record.state !== "preparing") return record;
  let root: string | undefined;
  try {
    const source = preparationSourcePath(projectId, record.source);
    const input = probeVideo(source);
    // VP9 alpha commonly probes as yuv420p; its alpha_mode tag is authoritative.
    // The opaque browsing conversion cannot preserve that channel.
    if (!sourceNeedsSdrRenderAuthority(input) || probeHasAlphaChannel(input)) return record;
    const sourceHash = sha256File(source);
    root = `.prepared/${record.recipe}/${sourceHash}/${randomUUID()}`;
    const generation = root;
    const file = (name: string) => preparationSourcePath(projectId, `${generation}/${name}`);
    fs.mkdirSync(path.dirname(file("browse.mp4")), { recursive: true });
    const pending = { ...record, stage: "preview" as const };
    writePreparation(projectId, pending);
    const encoding = hdrSourceEncoding(source, input);
    const cube = writeCube(file("to-sdr.cube"), hdrToSdrDisplayCube({ transfer: encoding.transfer, primaries: encoding.primaries }, encoding.max_cll_nits, 33));
    const matrix = input.color_space === "bt2020nc" || input.color_space === "bt2020c" ? "bt2020" : "bt709";
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", source, "-map", "0:v:0", "-an", "-vf", `fps=30,scale=w='trunc(iw*min(1,640/max(iw,ih))/2)*2':h='trunc(ih*min(1,640/max(iw,ih))/2)*2':in_color_matrix=${matrix}:in_range=${input.color_range === "pc" ? "pc" : "tv"}:flags=area,format=gbrp16le,lut3d=file='${filterPath(cube)}':interp=tetrahedral,scale=out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", "30", "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709", "-movflags", "+faststart", file("browse.mp4")], { stdio: "pipe" });
    fs.rmSync(cube, { force: true });
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
    if (!current || current.preview_quality !== record.preview_quality) { discardPreparationGeneration(projectId, root); return current ?? record; }
    const next: PreparedMedia = { ...record, stage: "full_quality", browse_preview: { source_hash: sourceHash, audio, preview: `${root}/browse.mp4`, preview_hash: sha256File(file("browse.mp4")), duration: input.duration_seconds, width: p.width, height: p.height, frame_count: p.frame_count } };
    writePreparation(projectId, next);
    return next;
  } catch (error) {
    // Full preparation remains the fallback; it reports any durable failure.
    if (root) discardPreparationGeneration(projectId, root);
    console.error("Browsing preview unavailable", record.source, error);
    return record;
  }
}
