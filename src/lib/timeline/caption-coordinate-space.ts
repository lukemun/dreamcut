import type { CompositionElement } from "@/lib/render/composition-adapters";
import { resolveCaptionCoordinateAspectRatio } from "@/lib/timeline/captions";
import { resolveVisualRenderPlan } from "@/lib/timeline/visual-render-plan";

/**
 * Captions lay out inside the picture area of a source frame, not the whole output
 * frame (see `resolveCaptionContentRect`). Standard (TimelineComposition) and Browser
 * GPU (gpu-preview/scene.ts) both derive that source aspect here so the two renderers
 * place the same caption in the same rectangle.
 */

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Authored `props.source_width/source_height`, or null when absent or invalid. */
export function readSourceAspectRatio(element: Pick<CompositionElement, "props"> | null | undefined): number | null {
  const width = readFiniteNumber(element?.props?.source_width);
  const height = readFiniteNumber(element?.props?.source_height);
  if (width == null || height == null || width <= 0 || height <= 0) return null;
  return width / height;
}

/**
 * Visuals that can supply a legacy caption's coordinate space: renderable elements on
 * visual lanes, grouped by first lane appearance and then stably ordered by start.
 */
export function captionSafeAreaVisuals(elements: readonly CompositionElement[]): CompositionElement[] {
  const lanes = new Map<string, CompositionElement[]>();
  for (const element of elements) {
    if (!element.lane_key.startsWith("visual_")) continue;
    if (element.picture_hidden) continue;
    if (!resolveVisualRenderPlan(element).sourceUrl) continue;
    const lane = lanes.get(element.lane_key) ?? [];
    lane.push(element);
    lanes.set(element.lane_key, lane);
  }
  return Array.from(lanes.values()).flat().sort((a, b) => a.timeline_start - b.timeline_start);
}

/** The visual active when the caption starts, else the earliest visual. */
export function findVisualForCaption(
  caption: Pick<CompositionElement, "timeline_start">,
  visualElements: readonly CompositionElement[],
): CompositionElement | null {
  return visualElements.find(
    (element) =>
      caption.timeline_start >= element.timeline_start
      && caption.timeline_start < element.timeline_start + element.duration,
  ) ?? visualElements[0] ?? null;
}

/** The caption's own source size wins; otherwise the active visual's; otherwise null (full frame). */
export function resolveCaptionSourceAspectRatio(
  caption: CompositionElement,
  safeAreaVisuals: readonly CompositionElement[],
): number | null {
  return resolveCaptionCoordinateAspectRatio(
    readSourceAspectRatio(caption),
    readSourceAspectRatio(findVisualForCaption(caption, safeAreaVisuals) ?? caption),
  );
}
