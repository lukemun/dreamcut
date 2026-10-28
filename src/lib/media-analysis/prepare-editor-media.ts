import { previewDimensions } from "../preview-quality";
import { previewProxyFpsFilter } from "../timeline/source-sampling";
import { proxyDimensionsAllowed } from "../remotion/preview-proxy-contract";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { awaitsRenderAuthority, currentHdrCodeReceipt, discardPreparationGeneration, preparationSourcePath, readPreparation, retireSupersededPreparation, writePreparation, type PreparedMedia } from "../local-store/media-preparation";
import { customCutoutByRelativePath } from "../local-store/custom-cutouts";
import { createColorManagedVideoPair, createHdrCodePreviewProxy, sourceNeedsSdrRenderAuthority } from "../../../scripts/lib/color-managed-video";

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
/**
 * Fill the colour of fully transparent pixels with the colour of the nearest drawn pixels, keeping the
 * alpha as it was. Transparent areas usually hold black, and scaling, 4:2:0 chroma and lossy encoding of
 * the proxy blend that black into every visible edge, which composites as a dark fringe that the
 * render authority does not have.
 */
export const ALPHA_COLOR_BLEED = "format=rgba,split=3[o][m][al];[m]premultiply=inplace=1,gblur=sigma=6:steps=2,unpremultiply=inplace=1,format=rgb24[fill];[fill][o]overlay=format=auto,format=rgb24[c];[al]alphaextract[a];[c][a]alphamerge";

function hasAlphaTag(tags: Record<string, unknown> = {}) {
  return Object.entries(tags).some(([key, value]) => key.toLowerCase() === "alpha_mode" && String(value) === "1");
}

/** Runs in the preparation worker, never inside the request or render process. */
export function prepareEditorMedia(projectId: string, record: PreparedMedia): PreparedMedia {
  let relative: string | undefined;
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
    relative = `.prepared/${record.recipe}/${sourceHash}/${randomUUID()}`;
    const dir = preparationSourcePath(projectId, relative);
    fs.mkdirSync(dir, { recursive: true });
    const preview = `${relative}/preview.${alpha ? "webm" : "mp4"}`;
    // A derived authority resampled at another rate cannot serve this project's frames.
    // HDR is never its own render authority: GPU preview and export need the code-value conversion,
    // and an HDR authority is reused only when a current recipe made it and its receipt says how to
    // decode it. One made by a superseded recipe (such as an SDR tone map) is made again, so it matches its footage.
    const reusableRender = record.render && fs.existsSync(preparationSourcePath(projectId, record.render))
      && (record.render === record.source ? !hdr : (record.render_frame_rate ?? 30) === (record.preview_frame_rate ?? 30) && (!hdr || currentHdrCodeReceipt(record))) ? record.render : undefined;
    let render = reusableRender ?? record.source;
    let colorManagement: PreparedMedia["color_management"];
    let previewColorManagement: PreparedMedia["preview_color_management"];
    // HDR-tagged alpha, including a cutout cut straight from HDR phone footage, still carries HDR
    // pixels; it takes the same code-value conversion and `source_encoding` as its opaque source, so
    // the grade shader decodes the subject exactly as it decodes the footage. SDR alpha keeps its own
    // pixels in a scaled VP9 copy below.
    const rotated = Math.abs(video.side_data_list?.find((s: { rotation?: number }) => s.rotation != null)?.rotation ?? 0) % 180 === 90;
    const w = rotated ? video.height : video.width; const h = rotated ? video.width : video.height;
    const scale = Math.min(1, previewMaxEdge / Math.max(w, h), previewShortEdge / Math.min(w, h));
    const previewWidth = Math.max(2, Math.floor(w * scale / 2) * 2), previewHeight = Math.max(2, Math.floor(h * scale / 2) * 2);
    if (hdr && !reusableRender && !alpha) {
      // Placement and preview need only the size-limited proxy. A full-resolution authority of a long 4K
      // phone clip takes about as long as the clip itself to encode and tens of GB, so it waits for an export.
      previewColorManagement = createHdrCodePreviewProxy({ fps: proxyFps, sourcePath: source, sourceSha256: sourceHash, previewProxyPath: preparationSourcePath(projectId, preview), previewWidth, previewHeight });
    } else if (hdr && !reusableRender) {
      render = `${relative}/render.${alpha?"webm":"mov"}`;
      const browse = record.browse_preview;
      const staged = browse?.color_stage && browse.source_hash === sourceHash && fs.existsSync(preparationSourcePath(projectId, browse.color_stage)) && hash(preparationSourcePath(projectId, browse.color_stage)) === browse.color_stage_hash ? preparationSourcePath(projectId, browse.color_stage) : undefined;
      const cutoutParent = alpha ? customCutoutByRelativePath(projectId).get(record.source)?.source_relative_path : undefined;
      colorManagement = createColorManagedVideoPair({ fps: proxyFps, sourcePath: source, preparedColorStage: staged,
        ...(cutoutParent ? { encodingReferencePath: preparationSourcePath(projectId, cutoutParent) } : {}), renderAuthorityPath: preparationSourcePath(projectId, render), previewProxyPath: preparationSourcePath(projectId, preview), previewWidth, previewHeight });
    } else {
      ffmpeg(["-y", ...(alpha && video.codec_name === "vp9" ? ["-c:v", "libvpx-vp9"] : []), "-i", preparationSourcePath(projectId, render), "-map", "0:v:0", "-vf", `${previewProxyFpsFilter(proxyFps)},${alpha ? `${ALPHA_COLOR_BLEED},` : ""}scale=w='trunc(iw*min(1,min(${previewMaxEdge}/max(iw,ih),${previewShortEdge}/min(iw,ih)))/2)*2':h='trunc(ih*min(1,min(${previewMaxEdge}/max(iw,ih),${previewShortEdge}/min(iw,ih)))/2)*2'`, "-an", ...(alpha ? ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "32", "-deadline", "realtime", "-cpu-used", "6"] : ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", previewMaxEdge >= 1920 ? "18" : "26", "-movflags", "+faststart"]), "-g", "30", preparationSourcePath(projectId, preview)]);
    }
    // Browsing extracted the same AAC track from the same source bytes; keep one copy.
    const browseAudio = record.browse_preview?.source_hash === sourceHash ? record.browse_preview.audio : undefined;
    const existingAudio = [record.audio, browseAudio].find(file => file && fs.existsSync(preparationSourcePath(projectId, file)));
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
      ...((record.color_management || record.render_color_management) && !colorManagement && !previewColorManagement ? { render_color_management: record.color_management ?? record.render_color_management } : {}),
    };
    delete ready.error;
    delete ready.stage;
    if (previewColorManagement) {
      ready.preview_color_management = previewColorManagement;
      ready.render_authority = { state: "deferred" };
      delete ready.render_color_management; delete ready.render_frame_rate;
    } else { delete ready.preview_color_management; delete ready.render_authority; }
    // The full-resolution colour stage only fed this package; browsing keeps its small preview.
    if (ready.browse_preview) {
      const { color_stage: _stage, color_stage_hash: _stageHash, ...browse } = ready.browse_preview;
      ready.browse_preview = browse;
    }
    if (!colorManagement) delete ready.color_management;
    const current = readPreparation(projectId, record.source);
    if (current && (current.preview_quality ?? "prepared") !== (record.preview_quality ?? "prepared")) {
      discardPreparationGeneration(projectId, relative);
      return current;
    }
    writePreparation(projectId, ready);
    try {
      const retired = retireSupersededPreparation(projectId, ready);
      if (retired.removed.length || retired.retained.length) console.log(JSON.stringify({ source: ready.source, superseded: retired }));
    } catch (error) { console.error("Superseded preparation files were kept", ready.source, error); }
    return ready;
  } catch (error) {
    if (relative) discardPreparationGeneration(projectId, relative);
    const failed: PreparedMedia = { ...record, state: "failed", error: error instanceof Error ? error.message : String(error) };
    const current = readPreparation(projectId, record.source);
    if (current && (current.preview_quality ?? "prepared") !== (record.preview_quality ?? "prepared")) return current;
    writePreparation(projectId, failed); return failed;
  }
}

/** Bits per output pixel of the x264 CRF 12 code-value authority, measured on 4K HLG phone footage (~110 Mb/s at 30 fps), with margin. */
const AUTHORITY_BITS_PER_PIXEL = 0.6;
/** Free space left on the project volume after the authority, per the storage lifecycle contract. */
const AUTHORITY_FREE_SPACE_RESERVE = 5 * 1024 ** 3;

/**
 * Make the full-resolution code-value authority an export asked for (`render_authority` "requested"), next to
 * the package's existing proxy, and move `render` to it. Runs in the preparation worker.
 */
export function prepareRenderAuthority(projectId: string, record: PreparedMedia): PreparedMedia {
  if (record.render_authority?.state !== "requested") return record;
  if (record.state !== "ready" || !awaitsRenderAuthority(record) || !record.preview) {
    // Nothing to make (the package changed under the request); clear it so the worker does not ask again.
    const cleared = { ...record }; delete cleared.render_authority;
    writePreparation(projectId, cleared);
    return cleared;
  }
  const render = `${path.posix.dirname(record.preview)}/render.mov`;
  const output = preparationSourcePath(projectId, render);
  try {
    const source = preparationSourcePath(projectId, record.source);
    const fps = record.preview_frame_rate ?? 30;
    const probeSource = record.preview_color_management!.source_probe;
    const pixels = (probeSource.width ?? 3840) * (probeSource.height ?? 2160);
    const estimate = Math.ceil((record.duration ?? probeSource.duration_seconds) * fps * pixels * AUTHORITY_BITS_PER_PIXEL / 8);
    const volume = fs.statfsSync(path.dirname(output));
    const available = volume.bavail * volume.bsize;
    if (available - estimate < AUTHORITY_FREE_SPACE_RESERVE) throw new Error(`Not enough disk space for the full-quality copy: about ${Math.ceil(estimate / 1024 ** 3)} GB needed plus 5 GB free, ${Math.floor(available / 1024 ** 3)} GB available`);
    const receipt = createColorManagedVideoPair({ fps, sourcePath: source, renderAuthorityPath: output, previewProxyPath: preparationSourcePath(projectId, record.preview), reusePreviewProxy: true,
      previewWidth: record.preview_probe?.width ?? record.preview_color_management!.preview_dimensions.width, previewHeight: record.preview_probe?.height ?? record.preview_color_management!.preview_dimensions.height });
    if (receipt.source_sha256 !== record.source_hash) throw new Error("Source changed during full-quality preparation");
    const current = readPreparation(projectId, record.source);
    // A newer package (another size, a replaced source) took over while this encoded; it asks again when exported.
    if (!current || current.preview !== record.preview || current.source_hash !== record.source_hash || !awaitsRenderAuthority(current)) { fs.rmSync(output, { force: true }); return current ?? record; }
    const ready: PreparedMedia = { ...current, render, render_frame_rate: fps, color_management: receipt };
    delete ready.render_authority; delete ready.preview_color_management;
    writePreparation(projectId, ready);
    return ready;
  } catch (error) {
    fs.rmSync(output, { force: true });
    const current = readPreparation(projectId, record.source);
    if (!current || !awaitsRenderAuthority(current)) return current ?? record;
    const failed: PreparedMedia = { ...current, render_authority: { state: "failed", error: error instanceof Error ? error.message : String(error) } };
    writePreparation(projectId, failed);
    return failed;
  }
}
