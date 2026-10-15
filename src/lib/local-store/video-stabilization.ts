import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { mediaUrl } from "@/lib/local-store/media";
import { projectMediaDir } from "@/lib/local-store/paths";
import {
  videoStabilizationRecipe,
  type VideoStabilizationMode,
} from "@/lib/timeline/video-stabilization";

function fingerprint(sourcePath: string, recipe: string) {
  const stat = fs.statSync(sourcePath);
  return createHash("sha256")
    .update(`${sourcePath}\0${stat.size}\0${stat.mtimeMs}\0${recipe}`)
    .digest("hex")
    .slice(0, 16);
}

function escapeFilterPath(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

export function ensureStabilizedMedia(
  projectId: string,
  sourcePath: string,
  options: { mode: VideoStabilizationMode; strength?: number },
) {
  const settings = videoStabilizationRecipe(options.mode, options.strength);
  const stem = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^A-Za-z0-9._-]+/g, "-");
  const id = fingerprint(sourcePath, settings.recipe);
  const relativeDir = "video-effects";
  const renderRelativePath = path.join(relativeDir, `${stem}.${id}.stabilized.mp4`);
  const previewRelativePath = path.join(relativeDir, `${stem}.${id}.stabilized-preview.mp4`);
  const receiptRelativePath = path.join(relativeDir, `${stem}.${id}.stabilization.json`);
  const outputDir = path.join(projectMediaDir(projectId), relativeDir);
  const renderPath = path.join(projectMediaDir(projectId), renderRelativePath);
  const previewPath = path.join(projectMediaDir(projectId), previewRelativePath);
  const receiptPath = path.join(projectMediaDir(projectId), receiptRelativePath);

  if (!fs.existsSync(renderPath) || !fs.existsSync(previewPath) || !fs.existsSync(receiptPath)) {
    fs.mkdirSync(outputDir, { recursive: true });
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-stabilize-"));
    const transformsPath = path.join(stagingDir, "transforms.trf");
    const stagedRender = path.join(stagingDir, "render.mp4");
    const stagedPreview = path.join(stagingDir, "preview.mp4");
    const detect = [
      `result='${escapeFilterPath(transformsPath)}'`,
      `shakiness=${settings.shakiness}`,
      "accuracy=15",
      ...(settings.tripod ? ["tripod=1"] : []),
    ].join(":");
    const transform = [
      `input='${escapeFilterPath(transformsPath)}'`,
      `smoothing=${settings.smoothingFrames}`,
      "optalgo=opt",
      "optzoom=1",
      "interpol=bicubic",
      ...(settings.tripod ? ["tripod=1"] : []),
    ].join(":");
    try {
      execFileSync("ffmpeg", [
        "-y", "-v", "error", "-i", sourcePath,
        "-map", "0:v:0", "-vf", `vidstabdetect=${detect}`, "-an", "-f", "null", "-",
      ]);
      execFileSync("ffmpeg", [
        "-y", "-v", "error", "-i", sourcePath,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", `vidstabtransform=${transform}`,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart",
        stagedRender,
      ]);
      execFileSync("ffmpeg", [
        "-y", "-v", "error", "-i", stagedRender,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart",
        stagedPreview,
      ]);
      fs.renameSync(stagedRender, renderPath);
      fs.renameSync(stagedPreview, previewPath);
      fs.writeFileSync(receiptPath, `${JSON.stringify({
        ...settings,
        sourcePath,
        renderRelativePath,
        previewRelativePath,
        createdAt: new Date().toISOString(),
      }, null, 2)}\n`);
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }

  return {
    ...settings,
    renderPath,
    renderSourceUrl: mediaUrl(projectId, renderRelativePath),
    previewPath,
    previewSourceUrl: mediaUrl(projectId, previewRelativePath),
    receiptPath,
  };
}
