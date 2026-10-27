/** Exports from an editor that isn't signed in to DreamCut carry a small DreamCut mark in the
 * bottom-right corner. Signing in removes it. The check reads the sign-in saved on this computer, so
 * it works offline. It is a nudge, not protection: it runs after the video is encoded, as one pass. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { isCloudSignedIn } from "@/lib/local-store/cloud-account";

export const WATERMARK_IMAGE = path.resolve("public", "brand", "dreamcut-watermark.png");

export function exportNeedsWatermark(signedIn = isCloudSignedIn()) {
  return !signedIn;
}

/** The mark is 7% of the short side, inset 3.5% from the right and bottom edges, slightly see-through.
 * The result keeps the export's colour tags (set on the frames: encoder flags alone are dropped). */
export function watermarkFilter(size: { width: number; height: number }, dynamicRange: "sdr" | "hdr" = "sdr") {
  const short = Math.min(size.width, size.height);
  const mark = Math.max(24, Math.round(short * 0.07 / 2) * 2), inset = Math.round(short * 0.035);
  const tags = dynamicRange === "hdr"
    ? "setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc:range=tv"
    : "setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709:range=tv";
  return `[1:v]scale=${mark}:${mark}:flags=lanczos,format=rgba,colorchannelmixer=aa=0.9[mark];[0:v][mark]overlay=W-w-${inset}:H-h-${inset}:format=auto,${tags}`;
}

/** Encoder settings matching each export format, so the watermarked file plays like the original. */
export function watermarkEncodeArgs(dynamicRange: "sdr" | "hdr") {
  return dynamicRange === "hdr"
    ? ["-c:v", "libvpx-vp9", "-profile:v", "2", "-pix_fmt", "yuv420p10le", "-crf", "20", "-b:v", "0", "-row-mt", "1"]
    : ["-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p"];
}

/** Draws the mark onto a finished export in place. Long exports re-encode for as long as they need. */
export async function addWatermark(video: string, size: { width: number; height: number }, dynamicRange: "sdr" | "hdr", signal?: AbortSignal) {
  const marked = `${video}.watermark.mp4`;
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-i", WATERMARK_IMAGE,
    "-filter_complex", watermarkFilter(size, dynamicRange), ...watermarkEncodeArgs(dynamicRange),
    "-map", "0:a?", "-c:a", "copy", "-movflags", "+faststart", marked];
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"], signal });
      let stderr = "";
      child.stderr.on("data", data => { stderr = (stderr + data).slice(-16_000); });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve() : reject(new Error(`Adding the watermark failed (${code}): ${stderr}`)));
    });
    fs.renameSync(marked, video);
  } finally {
    fs.rmSync(marked, { force: true });
  }
}
