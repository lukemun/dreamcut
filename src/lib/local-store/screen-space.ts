import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { detectFacesAnywhere } from "@/lib/media-analysis/onnx-face";
import { findOpenRegions, speakerRegionsFromFace, type OpenRegion, type Rect } from "@/lib/media-analysis/open-space";
import { elementRectAt } from "@/lib/media-analysis/visual-overlap";
import { safeAreaFor, type DeliveryTarget } from "@/lib/qc/standards";
import { getCompositionDimensions } from "@/lib/render/composition-adapters";
import { followerRect, isCamera } from "@/lib/timeline/camera";
import { readKeyframeMap } from "@/lib/timeline/keyframes";
import { projectMediaScene, resolveMediaScene } from "@/lib/timeline/resolved-media-scene";
import { projectVisibleNormalizedSourceBox } from "@/lib/timeline/source-projection";

import { projectMediaDir } from "./paths";
import { activeElements, readMetadata, type TimelineFile } from "./store";

/**
 * The one read of what is on screen. Given a moment or a span of the edit, it returns everything that
 * occupies the canvas at each sampled moment (every picture, text and drawn shape through the camera it
 * follows, plus the speaker's head and shoulders found in the footage) and the regions that stay free for
 * the whole span. Placement asks it where to put something; the spatial checks ask it what something
 * covers. Element geometry comes from `elementRectAt`, the same function the overlap check uses.
 * Read-only: it decodes small frames to find the face and deletes them.
 */
export type Occupant = Rect & { kind: "speaker head" | "speaker shoulders" | "picture" | "text" | "shape"; element_id?: string };
export type ScreenMoment = { at_seconds: number; occupied: Occupant[]; speaker_found: boolean; reason?: string };
export type ScreenSpace = {
  canvas: { width: number; height: number };
  safe_area: Rect;
  span: { start_seconds: number; end_seconds: number };
  moments: ScreenMoment[];
  /** Every occupant across the span, one box per element (and per speaker part) covering all its sampled positions. */
  occupied: Occupant[];
  /** Largest first: regions inside the safe area that nothing occupies at any sampled moment. */
  open_regions: OpenRegion[];
  limitations: string[];
};
export type ScreenSpaceRequest = {
  start_seconds: number;
  /** Omit for a single moment. */
  end_seconds?: number;
  /** Explicit moments, instead of sampling the span. */
  moments?: readonly number[];
  /** Leave these out: the element being placed or replaced. */
  exclude_element_ids?: readonly string[];
};

const MAX_SAMPLES = 12;

function frameAt(projectId: string, element: TimelineElement, at: number, maxWidth?: number) {
  const prefix = `/api/projects/${encodeURIComponent(projectId)}/media/`;
  if (!element.source_url?.startsWith(prefix)) throw new Error("The picture at this moment is not project media");
  const file = path.resolve(projectMediaDir(projectId), decodeURIComponent(element.source_url.slice(prefix.length).split("?")[0]!));
  if (!file.startsWith(path.resolve(projectMediaDir(projectId)) + path.sep) || !fs.existsSync(file)) throw new Error("The picture's media file is missing");
  const sourceTime = (element.trim_start ?? 0) + (at - element.timeline_start) * (element.playback_rate > 0 ? element.playback_rate : 1);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-screen-space-"));
  const image = path.join(directory, "frame.png");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", sourceTime.toFixed(3), "-i", file, "-frames:v", "1", ...(maxWidth ? ["-vf", `scale='min(${maxWidth},iw)':-2`] : []), image]);
  const header = fs.readFileSync(image).subarray(16, 24);
  return { image, directory, sourceTime, width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

/** The bottom-most real footage at a moment: the speaker's picture. Motion graphics and cutouts sit over it. */
function speakerFootage(elements: TimelineElement[], at: number, hidden: Set<string>, order: readonly string[]) {
  return elements.filter(e => !hidden.has(e.lane_key) && e.type === "video_clip" && !motionSubjectFromSourceUrl(e.source_url ?? "")
    && at >= e.timeline_start && at < e.timeline_start + e.duration && !e.props?.has_alpha)
    .sort((a, b) => order.indexOf(b.lane_key) - order.indexOf(a.lane_key))[0];
}

/** Speaker head and shoulders at each moment, one detector pass for all of them, through the footage's framing and camera. */
async function speakerAt(projectId: string, elements: TimelineElement[], moments: readonly number[], canvas: { width: number; height: number }, hidden: Set<string>, order: readonly string[]) {
  const frames: Array<{ at: number; footage: TimelineElement; frame: ReturnType<typeof frameAt> }> = [];
  const results = new Map<number, { regions: Rect[]; reason?: string }>();
  try {
    for (const at of moments) {
      const footage = speakerFootage(elements, at, hidden, order);
      if (!footage) { results.set(at, { regions: [], reason: "No footage on screen" }); continue; }
      // Faces are found in normalized coordinates; a small frame is enough and far faster.
      try { frames.push({ at, footage, frame: frameAt(projectId, footage, at, 640) }); }
      catch (error) { results.set(at, { regions: [], reason: error instanceof Error ? error.message : "Frame unavailable" }); }
    }
    if (frames.length) {
      const detected = await detectFacesAnywhere(frames.map(({ frame }, i) => ({ frame_id: String(i), image_path: frame.image, pts: "0", time_base_num: 1, time_base_den: 1 })));
      for (const [i, { at, footage, frame }] of frames.entries()) {
        const face = detected.find(r => r.frame_id === String(i))?.boxes.filter(b => b.label === "face").sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (!face) { results.set(at, { regions: [], reason: "No face found" }); continue; }
        const scene = resolveMediaScene(footage.props, at - footage.timeline_start, canvas);
        const projected = projectVisibleNormalizedSourceBox({ x: face.x, y: face.y, width: face.width, height: face.height }, projectMediaScene(scene, {
          source_width: frame.width, source_height: frame.height, composition_width: canvas.width, composition_height: canvas.height, fit: "contain",
          timeline_time_seconds: at, timeline_start_seconds: footage.timeline_start, source_trim_start_seconds: footage.trim_start ?? 0, playback_rate: footage.playback_rate || 1 }));
        if (!projected) { results.set(at, { regions: [], reason: "Face is outside the frame" }); continue; }
        // Footage that follows a camera shows the face where the camera puts it.
        results.set(at, { regions: speakerRegionsFromFace(projected, canvas).map(region => followerRect(footage, elements, region, at, canvas.width, canvas.height)) });
      }
    }
  } finally { for (const { frame } of frames) fs.rmSync(frame.directory, { recursive: true, force: true }); }
  return results;
}

/** Evenly across the span, both ends included, plus every camera keyframe inside it (where things move most). */
function sampleSpan(elements: TimelineElement[], start: number, end: number) {
  if (end <= start) return [start];
  const count = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(end - start) + 1));
  const moments = new Set(Array.from({ length: count }, (_, i) => round(start + (end - start - 0.01) * i / (count - 1))));
  for (const camera of elements.filter(isCamera)) for (const track of Object.values(readKeyframeMap(camera.props))) for (const key of track ?? []) {
    const at = round(camera.timeline_start + key.t);
    if (at > start && at < end) moments.add(at);
  }
  const sorted = [...moments].sort((a, b) => a - b);
  return sorted.length <= MAX_SAMPLES * 2 ? sorted : Array.from({ length: MAX_SAMPLES * 2 }, (_, i) => sorted[Math.round(i * (sorted.length - 1) / (MAX_SAMPLES * 2 - 1))]!);
}

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

export async function readScreenSpace(projectId: string, timeline: TimelineFile, request: ScreenSpaceRequest): Promise<ScreenSpace> {
  const metadata = readMetadata(projectId);
  const canvas = getCompositionDimensions(metadata.output_aspect_ratio);
  const insets = safeAreaFor((metadata.delivery_target ?? "web") as DeliveryTarget, canvas, metadata.caption_safe_area_mode);
  const safe = { x: insets.left, y: insets.top, width: canvas.width - insets.left - insets.right, height: canvas.height - insets.top - insets.bottom };
  const hidden = new Set(metadata.hidden_lane_keys ?? []), order = metadata.lane_order_keys ?? [];
  const excluded = new Set(request.exclude_element_ids ?? []);
  const elements = activeElements(timeline).filter(e => !hidden.has(e.lane_key));
  const start = request.start_seconds, end = request.end_seconds ?? start;
  const moments = request.moments?.length ? [...request.moments].sort((a, b) => a - b) : sampleSpan(elements, start, end);
  const speaker = await speakerAt(projectId, elements, moments, canvas, hidden, order);
  const limitations = new Set<string>();
  const screenMoments: ScreenMoment[] = moments.map(at => {
    const occupied: Occupant[] = [];
    const found = speaker.get(at) ?? { regions: [], reason: "Not examined" };
    found.regions.forEach((region, i) => occupied.push({ ...region, kind: i ? "speaker shoulders" : "speaker head" }));
    const footage = speakerFootage(elements, at, hidden, order);
    for (const element of elements) {
      if (excluded.has(element.id) || element === footage || isCamera(element)) continue;
      if (element.type !== "caption_text" && element.type !== "shape" && element.type !== "still" && element.type !== "video_clip") continue;
      const rect = elementRectAt(element, at, elements, canvas);
      if (!rect) continue;
      // A full-frame picture (an opener, a section card) fills the screen; it is the background, not an obstacle.
      if (element.type !== "caption_text" && element.type !== "shape" && rect.width * rect.height >= canvas.width * canvas.height * 0.9) {
        if (!element.props?.has_alpha) limitations.add(`${element.id} covers the frame at ${at}s; nothing is open over it.`);
        continue;
      }
      occupied.push({ ...rect, kind: element.type === "caption_text" ? "text" : element.type === "shape" ? "shape" : "picture", element_id: element.id });
    }
    if (!found.regions.length && found.reason) limitations.add(`${found.reason} at ${at}s; the speaker is not set aside there.`);
    return { at_seconds: at, occupied, speaker_found: found.regions.length > 0, ...(found.reason ? { reason: found.reason } : {}) };
  });
  const merged = new Map<string, Occupant>();
  for (const occupant of screenMoments.flatMap(moment => moment.occupied)) {
    const key = `${occupant.kind}|${occupant.element_id ?? ""}`;
    const seen = merged.get(key);
    merged.set(key, seen ? { ...union(seen, occupant), kind: occupant.kind, ...(occupant.element_id ? { element_id: occupant.element_id } : {}) } : occupant);
  }
  const occupied = [...merged.values()];
  return {
    canvas, safe_area: safe, span: { start_seconds: start, end_seconds: end }, moments: screenMoments, occupied,
    open_regions: findOpenRegions({ canvas, safe, occupied }), limitations: [...limitations],
  };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
