import { z } from "zod";
import type { CompositionElement } from "../render/composition-adapters";
import { cameraMatrix, cameraViewFor } from "./camera";
import { readSurfaceTrack, surfacePresentationParent, trackedQuadAtFrame, type SurfaceQuad } from "./surface-track";

/**
 * A picture (video clip or still) placed on a tracked flat surface in other footage: a billboard,
 * a phone, a TV. `surface_track` is the same prepared four-corner track text attaches to; the
 * picture's whole canvas frame is mapped onto `surface_region` of that surface with real
 * perspective, follows the footage's source clock and the camera the footage follows. The region
 * is [left, top, right, bottom] as fractions of the surface, so an inset leaves the screen's own
 * edge showing and several pictures can share one surface side by side.
 */
export const surfaceRegionSchema = z.tuple([z.number().finite().min(-1).max(2), z.number().finite().min(-1).max(2), z.number().finite().min(-1).max(2), z.number().finite().min(-1).max(2)])
  .refine(([left, top, right, bottom]) => right - left > 0.001 && bottom - top > 0.001, "The surface region needs a positive width and height");
export type SurfaceRegion = z.infer<typeof surfaceRegionSchema>;
export const FULL_SURFACE_REGION: SurfaceRegion = [0, 0, 1, 1];

/** Row-major 3x3 projective matrix: x' = (a·x + b·y + c) / (g·x + h·y + i). */
export type Projective = readonly [number, number, number, number, number, number, number, number, number];

export function readSurfaceRegion(value: unknown): SurfaceRegion {
  const parsed = surfaceRegionSchema.safeParse(value);
  return parsed.success ? parsed.data : FULL_SURFACE_REGION;
}

export function multiplyProjective(outer: Projective, inner: Projective): Projective {
  const out = new Array<number>(9);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++)
    out[row * 3 + col] = outer[row * 3] * inner[col] + outer[row * 3 + 1] * inner[3 + col] + outer[row * 3 + 2] * inner[6 + col];
  return out as unknown as Projective;
}

export function applyProjective(m: Projective, x: number, y: number): [number, number] {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** The projective map from the unit square (TL, TR, BR, BL) onto a convex quad, or null when degenerate. */
export function unitSquareToQuad(quad: SurfaceQuad): Projective | null {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-12) return null;
  const g = (sx * dy2 - dx2 * sy) / det, h = (dx1 * sy - sx * dy1) / det;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/** The part of the surface a region covers, as its own four corners. */
export function regionQuad(surface: SurfaceQuad, region: SurfaceRegion): SurfaceQuad | null {
  const unit = unitSquareToQuad(surface);
  if (!unit) return null;
  const [left, top, right, bottom] = region;
  return [applyProjective(unit, left, top), applyProjective(unit, right, top), applyProjective(unit, right, bottom), applyProjective(unit, left, bottom)];
}

/** The footage clip a picture is attached to at this frame (the visible copy of its source). */
export function surfaceParentFor<T extends CompositionElement>(element: Pick<CompositionElement, "props">, elements: readonly T[], frame: number, fps: number): T | undefined {
  const track = readSurfaceTrack(element.props?.surface_track);
  if (!track) return undefined;
  return (surfacePresentationParent(track, elements as T[], frame, fps) as T | undefined) ?? elements.find((candidate) => candidate.id === track.parentId);
}

/**
 * The matrix that draws an attached picture's canvas frame (0,0)-(width,height) onto its region of
 * the tracked surface, in canvas pixels, seen through the camera the footage follows. Null when the
 * picture is not attached; `hidden` when the surface is not visible at this frame.
 */
export function surfacePictureMatrix(element: CompositionElement, elements: readonly CompositionElement[], frame: number, width: number, height: number, fps: number, presentedSourceTime?: number): { matrix: Projective; hidden: boolean } | null {
  const track = readSurfaceTrack(element.props?.surface_track);
  if (!track) return null;
  const parent = surfaceParentFor(element, elements, frame, fps);
  const surface = parent ? trackedQuadAtFrame(track, parent, frame, { width, height }, fps, presentedSourceTime) : null;
  const quad = surface ? regionQuad(surface, readSurfaceRegion(element.props?.surface_region)) : null;
  const unit = quad ? unitSquareToQuad(quad) : null;
  if (!unit || !parent) return { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], hidden: true };
  const onSurface = multiplyProjective(unit, [1 / width, 0, 0, 0, 1 / height, 0, 0, 0, 1]);
  const camera = cameraViewFor(parent, elements, frame / fps, width, height);
  return { matrix: camera ? multiplyProjective(cameraMatrix(camera, width, height), onSurface) : onSurface, hidden: false };
}

/** CSS matrix3d for a projective matrix, used with `transform-origin: 0 0`. */
export function projectiveCss(m: Projective): string {
  return `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,${m[8]})`;
}
