import {probeHasAlphaChannel} from '../media-analysis/alpha-channel';
import fs from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectMediaDir } from "./paths";
import { PREVIEW_PROXY_CONTRACT, proxyDimensionsAllowed } from "../remotion/preview-proxy-contract";
import { sourceNeedsSdrRenderAuthority } from "../media-analysis/color-profile";

const cache = new Map<string, { width: number; height: number; pix_fmt?:string; r_frame_rate?:string; color_transfer?:string; color_primaries?:string; tags?:{alpha_mode?:string} } | null>();

/** Server-measured, disposable playback evidence. Never trust persisted dimensions. */
export function validatePreviewProxy(url: unknown, alpha: boolean, quality?: unknown) {
  const failed = { contract: PREVIEW_PROXY_CONTRACT, url, quality, hdr: false, ok: false };
  if (typeof url !== "string") return failed;
  try {
    const match = url.split(/[?#]/)[0]!.match(/^\/api\/projects\/([^/]+)\/media\/(.+)$/);
    if (!match) return failed;
    const root = fs.realpathSync(projectMediaDir(decodeURIComponent(match[1]!)));
    const file = fs.realpathSync(path.resolve(root, decodeURIComponent(match[2]!)));
    if (!file.startsWith(root + path.sep)) return failed;
    const stat = fs.statSync(file,{bigint:true});
    const key = `${file}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    // Disposable revision, not a content-integrity claim. A replaced file at a
    // stable URL must invalidate decoder/frame caches without exposing its path.
    const revision=createHash("sha256").update(key).digest("hex");
    let dimensions = cache.get(key);
    if (dimensions === undefined) {
      const result = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name,pix_fmt,r_frame_rate,color_transfer,color_primaries:stream_tags=alpha_mode", "-of", "json", file], { encoding: "utf8", timeout: 5000 });
      dimensions = result.status === 0 ? JSON.parse(result.stdout).streams?.[0] ?? null : null;
      if (cache.size >= 256) cache.clear();
      cache.set(key, dimensions ?? null);
    }
    // The proxy's own cadence decides whether export can match its frames (source-sampling.ts).
    const [rateNum, rateDen] = String(dimensions?.r_frame_rate ?? "").split("/").map(Number);
    const frame_rate = rateNum > 0 && rateDen > 0 ? Math.round(rateNum / rateDen * 1000) / 1000 : undefined;
    // GPU preview decodes SDR only, so an HDR proxy is never valid playback evidence.
    const hdr = !!dimensions && sourceNeedsSdrRenderAuthority({ color_transfer: dimensions.color_transfer ?? null, color_primaries: dimensions.color_primaries ?? null, pixel_format: dimensions.pix_fmt ?? null });
    return { ...failed, ...dimensions, ...(frame_rate ? { frame_rate } : {}), has_alpha:probeHasAlphaChannel({pixel_format:dimensions?.pix_fmt??null,video_alpha_mode:dimensions?.tags?.alpha_mode}), hdr, revision, ok: !!dimensions && !hdr && proxyDimensionsAllowed(dimensions.width, dimensions.height, alpha, quality) };
  } catch { return failed; }
}
