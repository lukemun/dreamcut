export type ProjectionRect = { x: number; y: number; width: number; height: number };
export type SourceProjectionInput = {
  source_width: number;
  source_height: number;
  sample_aspect_ratio?: { num: number; den: number };
  display_rotation_degrees?: 0 | 90 | 180 | 270;
  composition_width: number;
  composition_height: number;
  fit: "contain" | "cover";
  media_scale?: number;
  media_offset_x?: number;
  media_offset_y?: number;
  mask_inset?: { top: number; right: number; bottom: number; left: number };
  timeline_time_seconds: number;
  timeline_start_seconds: number;
  source_trim_start_seconds?: number;
  playback_rate?: number;
  /** Where a cropped render sits on the canvas it was made for (fractions of that canvas); the
   * source fills this rectangle instead of fitting the whole composition. */
  source_canvas_rect?: ProjectionRect | null;
};

export type SourceProjection = {
  source_time_seconds: number;
  display_source_size: { width: number; height: number };
  base_rect: ProjectionRect;
  transformed_rect: ProjectionRect;
  visible_rect: ProjectionRect;
};

export type CompositionTransformLayout = {
  translate_x: number;
  translate_y: number;
  scale: number;
  mask_rect: ProjectionRect;
};

const finitePositive = (value: number | undefined, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
const precise = (value: number) => Number(value.toFixed(6));

export function resolveCompositionTransformLayout(input: {
  composition_width: number;
  composition_height: number;
  media_scale?: number;
  media_offset_x?: number;
  media_offset_y?: number;
  mask_inset?: { top: number; right: number; bottom: number; left: number };
}): CompositionTransformLayout {
  const mask = input.mask_inset ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    translate_x: precise((input.media_offset_x ?? 0) * input.composition_width / 2),
    translate_y: precise((input.media_offset_y ?? 0) * input.composition_height / 2),
    scale: finitePositive(input.media_scale, 1),
    // MediaTransformFrame applies clip/mask percentages to its full-composition
    // wrapper, outside the translated/scaled child.
    mask_rect: {
      x: precise(mask.left * input.composition_width),
      y: precise(mask.top * input.composition_height),
      width: precise(Math.max(0, 1 - mask.left - mask.right) * input.composition_width),
      height: precise(Math.max(0, 1 - mask.top - mask.bottom) * input.composition_height),
    },
  };
}

export function intersectProjectionRects(a: ProjectionRect, b: ProjectionRect): ProjectionRect | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: precise(left), y: precise(top), width: precise(right - left), height: precise(bottom - top) };
}

/**
 * A cropped motion-graphic render: a fixed-size window that follows the drawing across its canvas.
 * `keys` give the window's top-left corner in canvas pixels at source times (seconds); between keys
 * it moves in a straight line, landing on even pixels. The render was cut along exactly this path, so
 * drawing the window back at `canvasTrackRectAt(track, t)` restores every frame in place.
 * Copied from the render's receipt onto its clip as `props.source_canvas_track`.
 */
export type SourceCanvasTrack = { canvas: { width: number; height: number }; size: { width: number; height: number }; keys: Array<{ t: number; x: number; y: number }>;
  /** The render's frame rate: a time between frames reads the window of the frame on screen. */
  fps?: number };
export const SOURCE_CANVAS_TRACK_PROP = "source_canvas_track";

export function isSourceCanvasTrack(value: unknown): value is SourceCanvasTrack {
  const track = value as Partial<SourceCanvasTrack> | null | undefined;
  const positive = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (!track || typeof track !== "object" || !positive(track.canvas?.width) || !positive(track.canvas?.height)
    || !positive(track.size?.width) || !positive(track.size?.height) || !Array.isArray(track.keys) || track.keys.length === 0) return false;
  if (track.size!.width > track.canvas!.width || track.size!.height > track.canvas!.height) return false;
  if (track.fps !== undefined && !positive(track.fps)) return false;
  return track.keys.every((key, index) => key && [key.t, key.x, key.y].every((n) => typeof n === "number" && Number.isFinite(n))
    && (index === 0 || key.t > track.keys![index - 1]!.t));
}

/**
 * The frame a decoder shows at source time `time`: the last whose timestamp has been reached. WebM
 * stores timestamps in whole milliseconds, so frame k is stamped round(k / fps * 1000) ms, which can
 * sit just after its exact time; at that exact time the previous frame is still on screen.
 */
export function canvasTrackFrameAt(track: SourceCanvasTrack, time: number): number {
  const fps = track.fps!;
  const frame = Math.max(0, Math.floor(time * fps + 1e-6));
  return frame > 0 && Math.round(frame * 1000 / fps) > time * 1000 + 1e-6 ? frame - 1 : frame;
}

/** The window's top-left corner, in canvas pixels, at source time `time` (the frame on screen then). */
export function canvasTrackOriginAt(track: SourceCanvasTrack, time: number): { x: number; y: number } {
  return canvasTrackOriginAtTime(track, track.fps && track.fps > 0 ? canvasTrackFrameAt(track, time) / track.fps : time);
}

/** The window's top-left corner for frame `frame` of the render, as it was cut. */
export function canvasTrackOriginForFrame(track: SourceCanvasTrack, frame: number): { x: number; y: number } {
  return canvasTrackOriginAtTime(track, track.fps && track.fps > 0 ? frame / track.fps : frame);
}

function canvasTrackOriginAtTime(track: SourceCanvasTrack, t: number): { x: number; y: number } {
  const keys = track.keys;
  let x = keys[0]!.x, y = keys[0]!.y;
  if (t >= keys.at(-1)!.t) { x = keys.at(-1)!.x; y = keys.at(-1)!.y; }
  else for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i]!.t) {
      const a = keys[i - 1]!, b = keys[i]!, f = t <= a.t ? 0 : (t - a.t) / (b.t - a.t);
      x = a.x + (b.x - a.x) * f; y = a.y + (b.y - a.y) * f;
      break;
    }
  }
  const even = (value: number, limit: number) => Math.min(limit, Math.max(0, 2 * Math.round(value / 2)));
  return { x: even(x, track.canvas.width - track.size.width), y: even(y, track.canvas.height - track.size.height) };
}

/** Where the cropped picture sits on the canvas at source time `t`, as fractions of the canvas. */
export function canvasTrackRectAt(track: SourceCanvasTrack, t: number): ProjectionRect {
  const origin = canvasTrackOriginAt(track, t);
  return { x: origin.x / track.canvas.width, y: origin.y / track.canvas.height,
    width: track.size.width / track.canvas.width, height: track.size.height / track.canvas.height };
}

/** The canvas rectangle of a clip's cropped render at source time `t`, or null for a whole-frame source. */
export function readSourceCanvasRect(props: Record<string, unknown> | null | undefined, sourceTimeSeconds = 0): ProjectionRect | null {
  const track = props?.[SOURCE_CANVAS_TRACK_PROP];
  return isSourceCanvasTrack(track) ? canvasTrackRectAt(track, sourceTimeSeconds) : null;
}

export function projectSourceToComposition(input: SourceProjectionInput): SourceProjection {
  const sar = finitePositive(input.sample_aspect_ratio?.num, 1) / finitePositive(input.sample_aspect_ratio?.den, 1);
  const rotated = input.display_rotation_degrees === 90 || input.display_rotation_degrees === 270;
  const encodedWidth = finitePositive(input.source_width, 1) * sar;
  const encodedHeight = finitePositive(input.source_height, 1);
  const displayWidth = rotated ? encodedHeight : encodedWidth;
  const displayHeight = rotated ? encodedWidth : encodedHeight;
  const containScale = Math.min(input.composition_width / displayWidth, input.composition_height / displayHeight);
  const coverScale = Math.max(input.composition_width / displayWidth, input.composition_height / displayHeight);
  const baseScale = input.fit === "cover" ? coverScale : containScale;
  const baseWidth = displayWidth * baseScale;
  const baseHeight = displayHeight * baseScale;
  const canvasRect = input.source_canvas_rect ?? null;
  const baseRect = canvasRect ? {
    x: precise(canvasRect.x * input.composition_width),
    y: precise(canvasRect.y * input.composition_height),
    width: precise(canvasRect.width * input.composition_width),
    height: precise(canvasRect.height * input.composition_height),
  } : {
    x: precise((input.composition_width - baseWidth) / 2),
    y: precise((input.composition_height - baseHeight) / 2),
    width: precise(baseWidth),
    height: precise(baseHeight),
  };
  const layout = resolveCompositionTransformLayout(input);
  const mediaScale = layout.scale;
  // The clip's scale is about the composition centre, then its offset moves it.
  const centreX = input.composition_width / 2, centreY = input.composition_height / 2;
  const transformedRect = {
    x: precise(centreX + (baseRect.x - centreX) * mediaScale + layout.translate_x),
    y: precise(centreY + (baseRect.y - centreY) * mediaScale + layout.translate_y),
    width: precise(baseRect.width * mediaScale),
    height: precise(baseRect.height * mediaScale),
  };
  const compositionRect = { x: 0, y: 0, width: input.composition_width, height: input.composition_height };
  const visibleRect = intersectProjectionRects(transformedRect, intersectProjectionRects(layout.mask_rect, compositionRect) ?? {
    x: 0, y: 0, width: 0, height: 0,
  }) ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    source_time_seconds: (input.source_trim_start_seconds ?? 0)
      + Math.max(0, input.timeline_time_seconds - input.timeline_start_seconds) * finitePositive(input.playback_rate, 1),
    display_source_size: { width: displayWidth, height: displayHeight },
    base_rect: baseRect,
    transformed_rect: transformedRect,
    visible_rect: visibleRect,
  };
}

export function projectNormalizedSourceBox(box: ProjectionRect, projection: SourceProjection): ProjectionRect {
  return {
    x: precise(projection.transformed_rect.x + box.x * projection.transformed_rect.width),
    y: precise(projection.transformed_rect.y + box.y * projection.transformed_rect.height),
    width: precise(box.width * projection.transformed_rect.width),
    height: precise(box.height * projection.transformed_rect.height),
  };
}

/** Canonical detector boxes are normalized top-left display coordinates. */
export function projectVisibleNormalizedSourceBox(box: ProjectionRect, projection: SourceProjection): ProjectionRect | null {
  return intersectProjectionRects(projectNormalizedSourceBox(box, projection), projection.visible_rect);
}
