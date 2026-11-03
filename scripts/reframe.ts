import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { compileReframe, reframePropsPatch, type FocalSample } from "@/lib/media-analysis/reframe";
import { projectDir } from "@/lib/local-store/paths";
import { findElement, readMetadata, readTimeline, writeTimeline } from "@/lib/local-store/store";

// Auto-reframe a clip from focal evidence:
//   pnpm reframe <projectId> <elementId> --samples focal.json   # moving subject
//   pnpm reframe <projectId> <elementId> --focus 0.42,0.5       # static subject point
// Options: --margin 0.05 (extra zoom), --dry (print the patch, write nothing).
// Samples file: [{ "time_seconds": <source seconds>, "box": {x,y,width,height 0..1} }]
// Writes ordinary media_scale/media_offset keyframes — review and grade in the GUI.

const [projectId, elementId] = [process.argv[2], process.argv[3]];
const flag = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
if (!projectId || !elementId) {
  throw new Error("usage: pnpm reframe <projectId> <elementId> (--samples focal.json | --focus fx,fy) [--margin 0.05] [--dry]");
}

const timeline = readTimeline(projectId);
const element = findElement(timeline, elementId);
if (!element || element.removed_at != null) throw new Error(`Element not found: ${elementId}`);
if (element.type !== "video_clip" && element.type !== "still") throw new Error(`Reframe applies to visual clips, not ${element.type}`);

// Source pixel size: prefer stored props; fall back to ffprobe on the local file.
const props = (element.props ?? {}) as Record<string, unknown>;
let sourceWidth = typeof props.source_width === "number" ? props.source_width : 0;
let sourceHeight = typeof props.source_height === "number" ? props.source_height : 0;
if (!sourceWidth || !sourceHeight) {
  const mediaPrefix = `/api/projects/${projectId}/media/`;
  if (!element.source_url?.startsWith(mediaPrefix)) throw new Error("Element has no local media to probe; set props.source_width/source_height");
  const filePath = path.join(projectDir(projectId), "media", decodeURIComponent(element.source_url.slice(mediaPrefix.length)));
  const probed = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filePath], { encoding: "utf8" }));
  sourceWidth = probed.streams?.[0]?.width ?? 0;
  sourceHeight = probed.streams?.[0]?.height ?? 0;
  if (!sourceWidth || !sourceHeight) throw new Error(`ffprobe found no video dimensions in ${filePath}`);
}

const metadata = readMetadata(projectId);
const composition = metadata.output_aspect_ratio === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };

let samples: FocalSample[];
const samplesPath = flag("--samples");
const focus = flag("--focus");
if (samplesPath) {
  samples = JSON.parse(fs.readFileSync(samplesPath, "utf8"));
  if (!Array.isArray(samples)) throw new Error("--samples must be a JSON array of {time_seconds, box}");
} else if (focus) {
  const [fx, fy] = focus.split(",").map(Number);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) throw new Error("--focus must be fx,fy in 0..1");
  samples = [{ time_seconds: element.trim_start ?? 0, box: { x: fx!, y: fy!, width: 0, height: 0 } }];
} else {
  throw new Error("Provide --samples focal.json or --focus fx,fy");
}

const result = compileReframe(
  samples,
  {
    timeline_start: element.timeline_start,
    duration: element.duration,
    trim_start: element.trim_start ?? 0,
    playback_rate: element.playback_rate > 0 ? element.playback_rate : 1,
  },
  { width: sourceWidth, height: sourceHeight },
  composition,
  { margin: Number(flag("--margin") ?? 0) },
);
const patch = reframePropsPatch(result);

console.log(`source ${sourceWidth}x${sourceHeight} → composition ${composition.width}x${composition.height}`);
console.log(`media_scale ${result.media_scale}${result.scaleClamped ? " (cover needed more; clamped to editor max — expect a thin letterbox)" : ""}`);
console.log(`offset keyframes: x=${result.offsetX.length} y=${result.offsetY.length} (from ${result.usedSamples} in-window samples)`);

if (process.argv.includes("--dry")) {
  console.log(JSON.stringify(patch, null, 2));
} else {
  const existingKeyframes = (props.keyframes ?? {}) as Record<string, unknown>;
  const patchKeyframes = (patch.keyframes ?? {}) as Record<string, unknown>;
  element.props = {
    ...props,
    ...patch,
    // Merge keyframe maps so grade/mask curves on the clip survive; when the
    // reframe is static, drop any stale offset curves it supersedes.
    keyframes: "keyframes" in patch
      ? { ...existingKeyframes, ...patchKeyframes }
      : Object.fromEntries(Object.entries(existingKeyframes).filter(([field]) => field !== "media_offset_x" && field !== "media_offset_y")),
  };
  if (Object.keys(element.props.keyframes as Record<string, unknown>).length === 0) delete (element.props as Record<string, unknown>).keyframes;
  element.updated_at = new Date().toISOString();
  writeTimeline(projectId, timeline, "reframe_auto");
  console.log(`applied to ${elementId} — review in the editor (undo via history/, latest snapshot op reframe_auto)`);
}
