import { projectFrameRate } from "@/lib/timeline/frame-quantization";
import { getCompositionDimensions } from "@/lib/render/composition-adapters";
import type { TimelineElement } from "@/components/studio/timeline/types";
import type { ProjectMetadata, TimelineFile } from "@/lib/local-store/store";

/**
 * FCPXML 1.10 serializer — the interchange escape hatch. Pure: TimelineFile +
 * metadata in, XML string out; no fs/DOM/clock, so identical input always
 * yields identical output and the whole thing is headless-testable.
 *
 * Structure: one format resource (30 fps, canvas from output_aspect_ratio),
 * one asset per unique media source, and a sequence whose spine is a single
 * full-length <gap> with every clip CONNECTED at its absolute offset — visual
 * lanes map to positive FCPXML lanes, audio lanes to negative, captions to
 * <title> elements. That mirrors our absolute-positioned lane model far more
 * faithfully than forcing clips into a primary storyline.
 *
 * Known v1 limits (annotated in the XML): transitions and playback_rate≠1 are
 * not translated; grades/transforms stay behind. This is a handoff for manual
 * finishing, not a round-trip.
 */


function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** FCPXML ids must be NCNames: sanitize and never start with a digit. */
function ncName(prefix: string, raw: string): string {
  return `${prefix}-${raw.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
}

/** Seconds → frame-quantized rational time "N/<fps>s" at the project rate. */
function rationalTime(seconds: number, fps: number): string {
  return `${Math.round(seconds * fps)}/${fps}s`;
}

function gainDb(volume: number): number {
  return Number((20 * Math.log10(Math.max(0.0001, volume))).toFixed(2));
}

const VISUAL_TYPES = new Set(["still", "video_clip"]);
const AUDIO_TYPES = new Set(["music", "vo_segment", "vo_full", "sound_effect"]);

/** Relative media path within the project folder, from our proxy-style source_url. */
function mediaRelativePath(element: TimelineElement, projectId: string): string | null {
  const prefix = `/api/projects/${projectId}/media/`;
  if (!element.source_url) return null;
  if (element.source_url.startsWith(prefix)) return `./media/${decodeURIComponent(element.source_url.slice(prefix.length))}`;
  return element.source_url; // absolute URL — leave as-is, the NLE will relink
}

/** Lane number: visual_0 → 1 upward; audio lanes negative, narrator closest. */
function fcpLane(element: TimelineElement): number {
  if (VISUAL_TYPES.has(element.type)) return element.lane_index + 1;
  if (element.type === "caption_text") return 8 + element.lane_index;
  if (element.lane_key === "audio_narrator") return -1;
  if (element.type === "music") return -2 - element.lane_index;
  return -4 - element.lane_index; // sfx below music
}

export function timelineToFcpxml(
  timeline: TimelineFile,
  metadata: ProjectMetadata,
  projectId: string,
): string {
  const elements = timeline.elements.filter((element) => element.removed_at == null);
  const fps = projectFrameRate(metadata);
  const { width, height } = getCompositionDimensions(metadata.output_aspect_ratio);
  const durationSeconds = Math.max(
    1 / fps,
    ...elements.map((element) => element.timeline_start + element.duration),
  );

  // One asset per unique media path.
  const assetIds = new Map<string, string>();
  for (const element of elements) {
    const media = mediaRelativePath(element, projectId);
    if (media && !assetIds.has(media)) assetIds.set(media, ncName("asset", media));
  }

  const lines: string[] = [];
  const push = (depth: number, text: string) => lines.push(`${"  ".repeat(depth)}${text}`);

  push(0, `<?xml version="1.0" encoding="UTF-8"?>`);
  push(0, `<!DOCTYPE fcpxml>`);
  push(0, `<fcpxml version="1.10">`);
  push(1, `<resources>`);
  push(2, `<format id="fmt-canvas" name="FFVideoFormatRateUndefined" frameDuration="1/${fps}s" width="${width}" height="${height}"/>`);
  for (const [media, id] of assetIds) {
    push(2, `<asset id="${id}" name="${escapeXml(media)}" start="0s" hasVideo="1" hasAudio="1">`);
    push(3, `<media-rep kind="original-media" src="${escapeXml(media)}"/>`);
    push(2, `</asset>`);
  }
  push(1, `</resources>`);
  push(1, `<library>`);
  push(2, `<event name="${escapeXml(metadata.title ?? projectId)}">`);
  push(3, `<project name="${escapeXml(metadata.title ?? projectId)}">`);
  push(4, `<sequence format="fmt-canvas" duration="${rationalTime(durationSeconds, fps)}" tcStart="0s">`);
  push(5, `<spine>`);
  push(6, `<gap name="timeline" offset="0s" start="0s" duration="${rationalTime(durationSeconds, fps)}">`);

  const sorted = [...elements].sort((a, b) => a.timeline_start - b.timeline_start || fcpLane(b) - fcpLane(a));
  for (const element of sorted) {
    const lane = fcpLane(element);
    const offset = rationalTime(element.timeline_start, fps);
    const duration = rationalTime(element.duration, fps);
    if (element.type === "caption_text") {
      const text = typeof element.props?.text === "string" ? element.props.text : "";
      push(7, `<title name="${escapeXml(text.slice(0, 40) || "caption")}" lane="${lane}" offset="${offset}" duration="${duration}" start="0s">`);
      push(8, `<text><text-style ref="ts-default">${escapeXml(text)}</text-style></text>`);
      push(8, `<text-style-def id="ts-default"><text-style font="Helvetica" fontSize="60" fontColor="1 1 1 1"/></text-style-def>`);
      push(7, `</title>`);
      continue;
    }
    const media = mediaRelativePath(element, projectId);
    if (!media) continue;
    const ref = assetIds.get(media)!;
    const start = rationalTime(Math.max(0, element.trim_start ?? 0), fps);
    const attributes = `ref="${ref}" lane="${lane}" offset="${offset}" start="${start}" duration="${duration}" name="${escapeXml(media)}"`;
    const audible = AUDIO_TYPES.has(element.type) || element.type === "video_clip";
    const children: string[] = [];
    if (audible && element.volume !== 1) children.push(`<adjust-volume amount="${gainDb(element.volume)}dB"/>`);
    if ((element.playback_rate ?? 1) !== 1) children.push(`<!-- playback_rate ${element.playback_rate} not translated; retime manually -->`);
    if (children.length === 0) {
      push(7, `<asset-clip ${attributes}/>`);
    } else {
      push(7, `<asset-clip ${attributes}>`);
      for (const child of children) push(8, child);
      push(7, `</asset-clip>`);
    }
  }
  if (timeline.transitions.some((transition) => transition.removed_at == null)) {
    push(7, `<!-- transitions are not translated in v1; re_create dissolves in the NLE -->`);
  }

  push(6, `</gap>`);
  push(5, `</spine>`);
  push(4, `</sequence>`);
  push(3, `</project>`);
  push(2, `</event>`);
  push(1, `</library>`);
  push(0, `</fcpxml>`);
  return `${lines.join("\n")}\n`;
}
