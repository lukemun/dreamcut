import { previewDimensions } from "../preview-quality";
import { previewProxyFpsFilter } from "../timeline/source-sampling";
import { proxyDimensionsAllowed } from "../remotion/preview-proxy-contract";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { preparationSourcePath, readPreparation, writePreparation, type PreparedMedia } from "../local-store/media-preparation";
import { createColorManagedVideoPair, sourceNeedsSdrRenderAuthority } from "../../../scripts/lib/color-managed-video";

function hash(file: string) {
  const digest = createHash("sha256"); const fd = fs.openSync(file, "r"); const buffer = Buffer.alloc(1024 * 1024);
  try { for (;;) { const count = fs.readSync(fd, buffer); if (!count) break; digest.update(buffer.subarray(0, count)); } }
  finally { fs.closeSync(fd); }
  return digest.digest("hex");
}
function probe(file: string) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }));
}
function ffmpeg(args: string[]) { execFileSync("ffmpeg", ["-v", "error", "-nostdin", ...args], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 }); }
function hasAlphaTag(tags: Record<string, unknown> = {}) {
  return Object.entries(tags).some(([key, value]) => key.toLowerCase() === "alpha_mode" && String(value) === "1");
}

/** Runs in the preparation worker, never inside the request or render process. */
export function prepareEditorMedia(projectId: string, record: PreparedMedia): PreparedMedia {
  try {
    const latest = readPreparation(projectId, record.source);
    if (latest && latest.preview_quality !== record.preview_quality) return latest;
    writePreparation(projectId, { ...record, stage: "full_quality" });
    const source = preparationSourcePath(projectId, record.source);
    const sourceHash = hash(source);
    const info = probe(source);
    const video = info.streams.find((s: { codec_type: string }) => s.codec_type === "video");
    if (!video) throw new Error("Source has no video stream");
    const alpha = hasAlphaTag(video.tags) || /^(yuva|rgba|bgra|gbrap|argb|abgr)/.test(video.pix_fmt ?? "");
    // Selected quality controls preparation; alpha retains its stricter decode cap.
    const { edge: previewMaxEdge, short: previewShortEdge } = previewDimensions(record.preview_quality ?? "prepared", alpha);
    // Proxies run at the project's frame rate. HDR alpha authority is verified only at 30 fps,
    // so that path keeps 30 and export samples it exactly (source-sampling.ts).
    const requestedFps = record.preview_frame_rate ?? 30;
    const hdr = sourceNeedsSdrRenderAuthority({ color_transfer: video.color_transfer ?? null, color_primaries: video.color_primaries ?? null, pixel_format: video.pix_fmt ?? null });
    const proxyFps = hdr && alpha ? 30 : requestedFps;
    const relative = `.prepared/${record.recipe}/${sourceHash}/${randomUUID()}`;
    const dir = preparationSourcePath(projectId, relative);
    fs.mkdirSync(dir, { recursive: true });
    const preview = `${relative}/preview.${alpha ? "webm" : "mp4"}`;
    // A derived authority resampled at another rate cannot serve this project's frames.
    // HDR is never its own render authority: GPU preview and export need the SDR conversion.
    const reusableRender = record.render && fs.existsSync(preparationSourcePath(projectId, record.render))
      && (record.render === record.source ? !hdr : (record.render_frame_rate ?? 30) === (record.preview_frame_rate ?? 30)) ? record.render : undefined;
    let render = reusableRender ?? record.source;
    let colorManagement: PreparedMedia["color_management"];
    // HDR-tagged alpha, including a cutout cut straight from HDR phone footage, still carries HDR
    // pixels; it takes the same Apple color conversion as its opaque source so the subject matches
    // the plate behind it. SDR alpha keeps its own pixels in a scaled VP9 copy below.
    if (hdr && !reusableRender) {
      render = `${relative}/render.${alpha?"webm":"mov"}`;
      const rotated = Math.abs(video.side_data_list?.find((s: { rotation?: number }) => s.rotation != null)?.rotation ?? 0) % 180 === 90;
      const w = rotated ? video.height : video.width; const h = rotated ? video.width : video.height;
      const scale = Math.min(1, previewMaxEdge / Math.max(w, h), previewShortEdge / Math.min(w, h));
      const browse = record.browse_preview;
      const staged = browse && browse.source_hash === sourceHash && fs.existsSync(preparationSourcePath(projectId, browse.color_stage)) && hash(preparationSourcePath(projectId, browse.color_stage)) === browse.color_stage_hash ? preparationSourcePath(projectId, browse.color_stage) : undefined;
      colorManagement = createColorManagedVideoPair({ fps: proxyFps, sourcePath: source, preparedColorStage: staged, renderAuthorityPath: preparationSourcePath(projectId, render), previewProxyPath: preparationSourcePath(projectId, preview), previewWidth: Math.max(2, Math.floor(w * scale / 2) * 2), previewHeight: Math.max(2, Math.floor(h * scale / 2) * 2) });
    } else {
      ffmpeg(["-y", ...(alpha && video.codec_name === "vp9" ? ["-c:v", "libvpx-vp9"] : []), "-i", preparationSourcePath(projectId, render), "-map", "0:v:0", "-vf", `${previewProxyFpsFilter(proxyFps)},scale=w='trunc(iw*min(1,min(${previewMaxEdge}/max(iw,ih),${previewShortEdge}/min(iw,ih)))/2)*2':h='trunc(ih*min(1,min(${previewMaxEdge}/max(iw,ih),${previewShortEdge}/min(iw,ih)))/2)*2'`, "-an", ...(alpha ? ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "32", "-deadline", "realtime", "-cpu-used", "6"] : ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", previewMaxEdge >= 1920 ? "18" : "26", "-movflags", "+faststart"]), "-g", "30", preparationSourcePath(projectId, preview)]);
    }
    const existingAudio = record.audio && fs.existsSync(preparationSourcePath(projectId, record.audio)) ? record.audio : undefined;
    const audio = existingAudio ?? (info.streams.some((s: { codec_type: string }) => s.codec_type === "audio") ? `${relative}/audio.m4a` : undefined);
    if (audio && !existingAudio) ffmpeg(["-y", "-i", source, "-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", preparationSourcePath(projectId, audio)]);
    const result = probe(preparationSourcePath(projectId, preview));
    const output = result.streams.find((s: { codec_type: string }) => s.codec_type === "video");
    const duration = Number(info.format.duration);
    // Containers can run longer than their picture stream because of audio tails.
    // Compare picture with picture, while retaining the complete source duration.
    const pictureDuration = Number(video.duration) > 0 ? Number(video.duration) : duration;
    if (!output || !Number.isFinite(duration) || duration <= 0 || Math.max(output.width, output.height) > previewMaxEdge || !proxyDimensionsAllowed(output.width, output.height, alpha, record.preview_quality) || !Number.isFinite(Number(result.format.duration)) || Math.abs(Number(result.format.duration) - pictureDuration) > 0.08) throw new Error("Proxy dimensions or source duration validation failed");
    const [numerator, denominator] = String(output.avg_frame_rate).split("/").map(Number);
    if (Math.abs(numerator / denominator - proxyFps) > 0.001) throw new Error(`Proxy must have a ${proxyFps} fps source clock`);
    if (alpha && !hasAlphaTag(output.tags)) throw new Error("Proxy lost source transparency");
    ffmpeg([...(alpha ? ["-c:v", "libvpx-vp9"] : []), "-i", preparationSourcePath(projectId, preview), "-f", "null", "-"]);
    const stat = fs.statSync(source);
    if (stat.size !== record.size || stat.mtimeMs !== record.mtime || hash(source) !== sourceHash) throw new Error("Source changed during preparation");
    const counted = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "json", preparationSourcePath(projectId, preview)], { encoding: "utf8" }));
    const frameCount = Number(counted.streams?.[0]?.nb_read_frames);
    if (!Number.isFinite(frameCount) || Math.abs(frameCount - pictureDuration * proxyFps) > Math.max(3, proxyFps / 10)) throw new Error("Proxy frame count does not cover the source clock");
    const ready: PreparedMedia = { ...record, preview_frame_rate: requestedFps, ...(render !== record.source ? { render_frame_rate: reusableRender ? (record.render_frame_rate ?? 30) : proxyFps } : {}), prepared_preview_quality: record.preview_quality ?? "prepared", state: "ready", error: undefined, source_hash: sourceHash, preview_hash: hash(preparationSourcePath(projectId, preview)), preview, render, audio, duration, alpha,
      preview_probe: { width: output.width, height: output.height, frame_rate: output.avg_frame_rate, frame_count: frameCount, duration_seconds: Number(result.format.duration) },
      color_management: colorManagement,
      ...((record.color_management || record.render_color_management) && !colorManagement ? { render_color_management: record.color_management ?? record.render_color_management } : {}),
    };
    delete ready.error;
    delete ready.stage;
    if (!colorManagement) delete ready.color_management;
    const current = readPreparation(projectId, record.source);
    if (current && (current.preview_quality ?? "prepared") !== (record.preview_quality ?? "prepared")) return current;
    writePreparation(projectId, ready); return ready;
  } catch (error) {
    const failed: PreparedMedia = { ...record, state: "failed", error: error instanceof Error ? error.message : String(error) };
    const current = readPreparation(projectId, record.source);
    if (current && (current.preview_quality ?? "prepared") !== (record.preview_quality ?? "prepared")) return current;
    writePreparation(projectId, failed); return failed;
  }
}
