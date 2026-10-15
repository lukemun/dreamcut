import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { previewEditorAgentProposal } from "@/lib/agent/timeline-editor-agent-apply";
import { AppleVisionDetector } from "@/lib/media-analysis/apple-vision";
import { FILL_LEVELS, findOpenRegions, pickFittingSize, speakerRegionsFromFace, textFill, UNDERFILLED_BELOW, type FillLevel, type OpenRegion, type Rect } from "@/lib/media-analysis/open-space";
import { measureCaptions } from "@/lib/qc/measure-captions";
import { safeAreaFor, type DeliveryTarget } from "@/lib/qc/standards";
import { getCompositionDimensions } from "@/lib/render/composition-adapters";
import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { resolveCaptionAnchorLayout, resolveCaptionProps } from "@/lib/timeline/captions";
import { projectMediaScene, resolveMediaScene } from "@/lib/timeline/resolved-media-scene";
import { projectVisibleNormalizedSourceBox } from "@/lib/timeline/source-projection";
import type { TimelineElement } from "@/components/studio/timeline/types";

import { projectMediaDir } from "./paths";
import { readProposal } from "./proposals";
import { activeElements, readMetadata, readTimeline, type TimelineFile } from "./store";

/**
 * Open space at a moment of the edit: where the speaker is (from a face detected in that frame), what
 * else is on screen, the largest clear regions inside the safe area, and how big a piece of text must
 * be to fill one of them. Read-only: it renders one frame and measures text in a headless browser.
 */
export type OpenSpaceRequest = {
  at_seconds: number;
  proposal_id?: string;
  option_id?: string;
  /** Size this text to fill the best region. */
  text?: string;
  font_preset?: string;
  style_variant?: string;
  text_align?: "left" | "center" | "right";
  /** Or judge an existing caption: its fill now and the size that would fill the space. */
  element_id?: string;
  /** How much of the open region the text takes: medium 70%, large 85% (default), full 95%. */
  fill_level?: FillLevel;
};

const SIZES = [36, 44, 52, 60, 68, 76, 84, 92, 100, 110, 120, 132, 144, 156, 170, 184, 200, 220, 240];

function frameAt(projectId: string, element: TimelineElement, at: number, maxWidth?: number) {
  const prefix = `/api/projects/${encodeURIComponent(projectId)}/media/`;
  if (!element.source_url?.startsWith(prefix)) throw new Error("The picture at this moment is not project media");
  const file = path.resolve(projectMediaDir(projectId), decodeURIComponent(element.source_url.slice(prefix.length).split("?")[0]!));
  if (!file.startsWith(path.resolve(projectMediaDir(projectId)) + path.sep) || !fs.existsSync(file)) throw new Error("The picture's media file is missing");
  const sourceTime = (element.trim_start ?? 0) + (at - element.timeline_start) * (element.playback_rate > 0 ? element.playback_rate : 1);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-open-space-"));
  const image = path.join(directory, "frame.png");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", sourceTime.toFixed(3), "-i", file, "-frames:v", "1", ...(maxWidth ? ["-vf", `scale='min(${maxWidth},iw)':-2`] : []), image]);
  const header = fs.readFileSync(image).subarray(16, 24);
  return { image, directory, sourceTime, width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

function captionRect(caption: TimelineElement, canvas: { width: number; height: number }): Rect {
  const p = resolveCaptionProps(caption.props ?? {});
  const content = { left: 0, top: 0, width: 1, height: 1 };
  const width = p.maxWidth * canvas.width, chars = Math.max(1, Math.floor(width / (p.fontSizePx * 0.5)));
  const height = p.text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / chars)), 0) * p.fontSizePx * 1.2;
  const anchors = resolveCaptionAnchorLayout(p, content as never);
  return { x: anchors.x * canvas.width - anchors.anchorX * width, y: anchors.y * canvas.height - anchors.anchorY * height, width, height };
}

export async function findProjectOpenSpace(projectId: string, request: OpenSpaceRequest) {
  const metadata = readMetadata(projectId);
  let timeline: TimelineFile = readTimeline(projectId);
  if (request.proposal_id) timeline = previewEditorAgentProposal(readProposal(projectId, request.proposal_id).proposal, request.option_id).timeline;
  const canvas = getCompositionDimensions(metadata.output_aspect_ratio);
  const safeInsets = safeAreaFor((metadata.delivery_target ?? "web") as DeliveryTarget, canvas, metadata.caption_safe_area_mode);
  const safe = { x: safeInsets.left, y: safeInsets.top, width: canvas.width - safeInsets.left - safeInsets.right, height: canvas.height - safeInsets.top - safeInsets.bottom };
  const at = request.at_seconds, limitations: string[] = [];
  const hidden = new Set(metadata.hidden_lane_keys ?? []), order = metadata.lane_order_keys ?? [];
  const live = activeElements(timeline).filter(e => !hidden.has(e.lane_key) && at >= e.timeline_start && at < e.timeline_start + e.duration);
  const pictures = live.filter(e => e.type === "video_clip" || e.type === "still");
  // Bottom-most real footage is the speaker's picture; motion graphics and stills sit over it.
  const footage = pictures.filter(e => e.type === "video_clip" && !motionSubjectFromSourceUrl(e.source_url ?? ""))
    .sort((a, b) => order.indexOf(b.lane_key) - order.indexOf(a.lane_key))[0];
  const occupied: Array<Rect & { kind: string; element_id?: string }> = [];

  if (footage) {
    const frame = frameAt(projectId, footage, at);
    try {
      const [result] = await new AppleVisionDetector().detectFaces([{ frame_id: "open-space", image_path: frame.image, pts: "0", time_base_num: 1, time_base_den: 1 }]);
      const scene = resolveMediaScene(footage.props, at - footage.timeline_start, canvas);
      const projection = projectMediaScene(scene, { source_width: frame.width, source_height: frame.height, composition_width: canvas.width, composition_height: canvas.height,
        fit: "contain", timeline_time_seconds: at, timeline_start_seconds: footage.timeline_start, source_trim_start_seconds: footage.trim_start ?? 0, playback_rate: footage.playback_rate || 1 });
      for (const box of result?.boxes ?? []) {
        const projected = projectVisibleNormalizedSourceBox({ x: box.x, y: box.y, width: box.width, height: box.height }, projection);
        if (!projected) continue;
        if (box.label === "face") for (const [i, part] of speakerRegionsFromFace(projected, canvas).entries()) occupied.push({ ...part, kind: i ? "speaker shoulders" : "speaker head", element_id: footage.id });
        else occupied.push({ ...projected, kind: "person", element_id: footage.id });
      }
      if (!result?.boxes.some(box => box.label === "face")) limitations.push("No face was found in this frame; the speaker is not set aside.");
    } finally { fs.rmSync(frame.directory, { recursive: true, force: true }); }
  } else limitations.push("No footage is on screen at this moment; only overlays are set aside.");

  for (const element of pictures) {
    if (element === footage) continue;
    const width = Number(element.props?.source_width), height = Number(element.props?.source_height);
    if (!(width > 0 && height > 0)) { limitations.push(`${element.id}: size unknown, not set aside.`); continue; }
    const scene = resolveMediaScene(element.props, at - element.timeline_start, canvas);
    if (scene.opacity <= 0) continue;
    const rect = projectVisibleNormalizedSourceBox({ x: 0, y: 0, width: 1, height: 1 }, projectMediaScene(scene, { source_width: width, source_height: height,
      composition_width: canvas.width, composition_height: canvas.height, fit: "contain", timeline_time_seconds: at, timeline_start_seconds: element.timeline_start,
      source_trim_start_seconds: element.trim_start ?? 0, playback_rate: element.playback_rate || 1 }));
    // A full-frame layer (an opener, a section card) fills the screen; there is no open space over it to report.
    if (rect && rect.width * rect.height < canvas.width * canvas.height * 0.9) occupied.push({ ...rect, kind: element.type, element_id: element.id });
    else if (rect && !element.props?.has_alpha) limitations.push(`${element.id} covers the frame.`);
  }
  const judged = request.element_id ? live.find(e => e.id === request.element_id && e.type === "caption_text") : undefined;
  if (request.element_id && !judged) throw Object.assign(new Error("element_id must be a caption on screen at at_seconds"), { status: 400 });
  for (const caption of live.filter(e => e.type === "caption_text" && e !== judged)) occupied.push({ ...captionRect(caption, canvas), kind: "caption", element_id: caption.id });

  const regions = findOpenRegions({ canvas, safe, occupied });
  const best = regions[0];
  const level: FillLevel = request.fill_level ?? "large";
  const text = request.text ?? (judged ? String(judged.props?.text ?? "") : undefined);
  let fit: Record<string, unknown> | null = null;
  if (best && text) {
    const base = { ...(judged?.props ?? {}), text, ...(request.font_preset ? { fontPreset: request.font_preset } : {}), ...(request.style_variant ? { styleVariant: request.style_variant } : {}),
      textAlign: request.text_align ?? judged?.props?.textAlign ?? "left", fontSizing: "fixed", singleLine: false };
    const levels = Object.entries(FILL_LEVELS) as Array<[FillLevel, number]>;
    // One headless-browser pass measures every candidate size at every level with the real font.
    const measured = await measureCaptions(levels.flatMap(([name, share]) => SIZES.map(size => ({ id: `${name}:${size}`, type: "caption_text",
      props: { ...base, fontSizePx: size, maxWidth: best.width * share / canvas.width } }) as never)), canvas);
    const fits: Record<string, unknown> = {};
    for (const [name, share] of levels) {
      const maxWidth = best.width * share / canvas.width;
      const candidates = SIZES.map(size => { const m = measured[`${name}:${size}`]!; return { font_size_px: size, ink_width: m.inkWidth, height: m.height, lines: m.lines }; });
      const chosen = pickFittingSize(best, candidates, share);
      if (!chosen) { fits[name] = null; continue; }
      const boxWidth = maxWidth * canvas.width;
      const x = best.x + (best.width - boxWidth) / 2, y = best.y + (best.height - chosen.height) / 2;
      fits[name] = { font_size_px: chosen.font_size_px, lines: chosen.lines, fill: textFill(best, { width: chosen.ink_width, height: chosen.height }),
        props: { fontSizePx: chosen.font_size_px, maxWidth: round(maxWidth), absX: round(x / canvas.width), absY: round(y / canvas.height), textAlign: base.textAlign, singleLine: false } };
    }
    if (!fits[level]) limitations.push(`At the ${level} level even the smallest size does not fit the open region; shorten the text.`);
    fit = { level, recommended: fits[level], levels: fits, measured_with: "loaded font in a headless browser" };
    if (judged) {
      const now = await measureCaptions([{ id: judged.id, type: "caption_text", props: judged.props ?? {} } as never], canvas);
      const current = textFill(best, { width: now[judged.id]!.inkWidth, height: now[judged.id]!.height });
      fit.current = { font_size_px: resolveCaptionProps(judged.props ?? {}).fontSizePx, fill: current,
        verdict: current.width_fill > 1 || current.height_fill > 1 ? "spills out of the open space"
          : current.width_fill < UNDERFILLED_BELOW && current.height_fill < UNDERFILLED_BELOW ? "too small for the open space" : "fills the open space" };
    }
  }
  return { at_seconds: at, canvas, safe_area: safe, occupied, open_regions: regions, ...(best ? { best_region: best } : {}),
    ...(fit ? { fit } : {}), limitations };
}

const round = (value: number) => Math.round(value * 10000) / 10000;
export type { OpenRegion };

/**
 * The speaker's head on the canvas at each moment: the face Apple Vision finds in the footage
 * frame, projected through the clip's framing (zoom, offset) and grown to the head. One detector
 * pass for every moment. A moment with no footage or no face comes back with `head: null`.
 */
export async function speakerHeadsAt(projectId: string, timeline: TimelineFile, moments: readonly number[]) {
  const metadata = readMetadata(projectId);
  const canvas = getCompositionDimensions(metadata.output_aspect_ratio);
  const hidden = new Set(metadata.hidden_lane_keys ?? []), order = metadata.lane_order_keys ?? [];
  const frames: Array<{ at: number; footage: TimelineElement; frame: ReturnType<typeof frameAt> }> = [];
  const results: Array<{ at: number; head: Rect | null; reason?: string }> = [];
  try {
    for (const at of moments) {
      const footage = activeElements(timeline).filter(e => !hidden.has(e.lane_key) && e.type === "video_clip" && !motionSubjectFromSourceUrl(e.source_url ?? "")
        && at >= e.timeline_start && at < e.timeline_start + e.duration && !e.props?.has_alpha)
        .sort((a, b) => order.indexOf(b.lane_key) - order.indexOf(a.lane_key))[0];
      if (!footage) { results.push({ at, head: null, reason: "No footage on screen" }); continue; }
      // Faces are found in normalized coordinates; a small frame is enough and far faster.
      try { frames.push({ at, footage, frame: frameAt(projectId, footage, at, 640) }); }
      catch (error) { results.push({ at, head: null, reason: error instanceof Error ? error.message : "Frame unavailable" }); }
    }
    if (frames.length) {
      const detected = await new AppleVisionDetector().detectFaces(frames.map(({ frame }, i) => ({ frame_id: String(i), image_path: frame.image, pts: "0", time_base_num: 1, time_base_den: 1 })));
      for (const [i, { at, footage, frame }] of frames.entries()) {
        const face = detected.find(r => r.frame_id === String(i))?.boxes.filter(b => b.label === "face").sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (!face) { results.push({ at, head: null, reason: "No face found" }); continue; }
        const scene = resolveMediaScene(footage.props, at - footage.timeline_start, canvas);
        const projected = projectVisibleNormalizedSourceBox({ x: face.x, y: face.y, width: face.width, height: face.height }, projectMediaScene(scene, {
          source_width: frame.width, source_height: frame.height, composition_width: canvas.width, composition_height: canvas.height, fit: "contain",
          timeline_time_seconds: at, timeline_start_seconds: footage.timeline_start, source_trim_start_seconds: footage.trim_start ?? 0, playback_rate: footage.playback_rate || 1 }));
        results.push({ at, head: projected ? speakerRegionsFromFace(projected, canvas)[0]! : null, ...(projected ? {} : { reason: "Face is outside the frame" }) });
      }
    }
  } finally { for (const { frame } of frames) fs.rmSync(frame.directory, { recursive: true, force: true }); }
  return { canvas, moments: results.sort((a, b) => a.at - b.at) };
}
