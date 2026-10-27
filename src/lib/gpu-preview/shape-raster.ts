import type { ShapeFrame } from "../timeline/shapes";

/** Clear pixels assumed around a shape's painted bounds, for antialiasing. */
const PAINT_MARGIN = 2;
// Canvas 2D's default miter limit: a stroked join reaches at most this many half line widths from the path.
const MITER_LIMIT = 10;

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const ABSOLUTE_PATH = /^[\sMLCZ\d.,eE+-]*$/;

/** A box in a shape's local pixels; empty while every bound is infinite. */
export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export const emptyBox = (): Box => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

/** Every coordinate pair of an absolute M/L/C/Z path; a curve stays inside its control points. False for other paths. */
function addPathPoints(d: string, box: Box): boolean {
  if (!ABSOLUTE_PATH.test(d)) return false;
  const values = d.match(NUMBER) ?? [];
  if (values.length % 2) return false;
  for (let i = 0; i < values.length; i += 2) {
    const x = Number(values[i]), y = Number(values[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
  }
  return true;
}

/** The box around every point of path `d` (see addPathPoints), or null when it cannot be bounded. */
export function pathPointBox(d: string): Box | null {
  const box = emptyBox();
  return addPathPoints(d, box) ? box : null;
}

/** Grow `box` by `other` padded by `pad` on every side; an empty `other` adds nothing. */
export function addBox(box: Box, other: Box, pad = 0) {
  if (other.minX > other.maxX) return;
  box.minX = Math.min(box.minX, other.minX - pad); box.maxX = Math.max(box.maxX, other.maxX + pad);
  box.minY = Math.min(box.minY, other.minY - pad); box.maxY = Math.max(box.maxY, other.maxY + pad);
}

/** Half the reach of a stroke's miter joins past its path, the pad around a stroked contour's points. */
export const strokePad = (strokeWidth: number) => strokeWidth / 2 * MITER_LIMIT;

/**
 * The whole output pixels covered by `local` (a box in the shape's local pixels, stroke pad included)
 * under the frame's transform, with an antialiasing margin, clipped to the output; null when empty.
 */
export function paintBoundsOfBox(frame: ShapeFrame, local: Box, width: number, height: number) {
  const W = Math.max(1, Math.round(width)), H = Math.max(1, Math.round(height));
  if (local.minX > local.maxX) return null;
  if (![frame.centerX, frame.centerY, frame.rotationDeg, frame.scale, local.minX, local.maxX, local.minY, local.maxY].every(Number.isFinite)) return { x: 0, y: 0, width: W, height: H };
  const a = frame.rotationDeg * Math.PI / 180, c = Math.cos(a) * frame.scale, s = Math.sin(a) * frame.scale;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const x of [local.minX, local.maxX]) for (const y of [local.minY, local.maxY]) {
    const px = frame.centerX + c * x - s * y, py = frame.centerY + s * x + c * y;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  const x0 = Math.max(0, Math.floor(minX) - PAINT_MARGIN), y0 = Math.max(0, Math.floor(minY) - PAINT_MARGIN);
  const x1 = Math.min(W, Math.ceil(maxX) + PAINT_MARGIN), y1 = Math.min(H, Math.ceil(maxY) + PAINT_MARGIN);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/**
 * The whole output pixels a shape frame can paint (path points, control points, stroke joins
 * and an antialiasing margin), clipped to the output; null when it paints nothing there.
 * Paths it cannot bound (anything but absolute M/L/C/Z) get the whole output.
 */
export function shapePaintBounds(frame: ShapeFrame, width: number, height: number) {
  const W = Math.max(1, Math.round(width)), H = Math.max(1, Math.round(height));
  const whole = { x: 0, y: 0, width: W, height: H };
  const local = emptyBox();
  if (frame.fill && frame.d && !addPathPoints(frame.d, local)) return whole;
  if (frame.stroke && frame.strokeWidth > 0) for (const contour of frame.contours) {
    if (contour.drawn <= 0) continue;
    const box = pathPointBox(contour.ink ?? contour.d);
    if (!box) return whole;
    addBox(local, box, contour.ink ? 0 : strokePad(frame.strokeWidth));
  }
  return paintBoundsOfBox(frame, local, width, height);
}

/**
 * Draw one shape frame onto a full-output `canvas`, for the WebGPU development compositor (CanvasKit
 * traces shapes natively in canvaskit-shape.ts). The path, transform order and dash pattern match
 * ShapeSequence in TimelineComposition (Standard); opacity is applied by the compositor.
 */
function drawShape(canvas: OffscreenCanvas, frame: ShapeFrame) {
  const context = canvas.getContext("2d");
  if (!context) throw Error("Shape canvas is unavailable");
  context.translate(frame.centerX, frame.centerY);
  context.rotate(frame.rotationDeg * Math.PI / 180);
  context.scale(frame.scale, frame.scale);
  if (frame.fill && frame.d) {
    context.fillStyle = frame.fill;
    // Even-odd, so an inner contour cuts a hole (a ring, the counter of a letter).
    context.fill(new Path2D(frame.d), "evenodd");
  }
  if (frame.stroke && frame.strokeWidth > 0) {
    context.strokeStyle = frame.stroke;
    context.lineWidth = frame.strokeWidth;
    // SVG's miter limit, as Standard and CanvasKit draw (Canvas 2D's default is 10).
    context.miterLimit = 4;
    for (const contour of frame.contours) {
      if (contour.drawn <= 0) continue;
      // Hand-drawn ink is a filled pen outline, not a stroked line.
      if (contour.ink) { context.fillStyle = frame.stroke; context.fill(new Path2D(contour.ink), "nonzero"); continue; }
      // A partly drawn contour is one dash from its first point; the gap covers the rest.
      context.setLineDash(contour.drawn < contour.length ? [contour.drawn, contour.length + frame.strokeWidth] : []);
      context.stroke(new Path2D(contour.d));
    }
  }
}

/** Draw one shape frame onto a full-canvas texture (export proofs and tests compare against it). */
export function rasterizeShape(frame: ShapeFrame, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  drawShape(canvas, frame);
  return canvas;
}

/** Everything that decides a shape raster's pixels; opacity is applied when compositing. */
export function shapeRasterKey(frame: ShapeFrame, width: number, height: number) {
  const { opacity: _opacity, ...drawn } = frame;
  return `${Math.round(width)}x${Math.round(height)}:${JSON.stringify(drawn)}`;
}

/** Identity of one drawing of a shape raster: a new object each time its canvas is redrawn. */
export class ShapeRasterVersion {}

/**
 * One full-output canvas per shape, kept from frame to frame. An unchanged shape (same drawing
 * inputs) is not drawn again; a changed one is redrawn into its own canvas after a reset, which
 * leaves the pixels a new canvas would have. Drawing into a smaller canvas at an offset was
 * measured to move antialiased edge pixels, so every raster stays output-sized and unshifted.
 * A raster is only valid until the next `raster` call for the same shape; its `version` stays the
 * same object exactly as long as its canvas holds the same pixels.
 */
export class ShapeRasterCache {
  private generation = 0;
  private readonly slots = new Map<string, { key: string; raster: ShapeRaster; used: number }>();

  /** Start a frame: canvases of shapes the previous frame did not draw are released. */
  beginFrame() {
    this.generation++;
    for (const [id, slot] of this.slots) if (slot.used < this.generation - 1) { this.slots.delete(id); release(slot.raster.canvas); }
  }

  /** The output-sized raster of shape `id`, or null when it paints nothing inside the output. */
  raster(id: string, frame: ShapeFrame, width: number, height: number): ShapeRaster | null {
    if (!shapePaintBounds(frame, width, height)) return null;
    const W = Math.max(1, Math.round(width)), H = Math.max(1, Math.round(height));
    const key = shapeRasterKey(frame, width, height), slot = this.slots.get(id);
    if (slot && slot.key === key) { slot.used = this.generation; return slot.raster; }
    const fresh = () => ({ canvas: rasterizeShape(frame, width, height), version: new ShapeRasterVersion() });
    // A second, different drawing of one shape in the same frame must not replace the first.
    if (slot && slot.used === this.generation) return fresh();
    if (!slot || slot.raster.canvas.width !== W || slot.raster.canvas.height !== H) {
      if (slot) release(slot.raster.canvas);
      const raster = fresh();
      this.slots.set(id, { key, raster, used: this.generation });
      return raster;
    }
    const canvas = slot.raster.canvas, context = canvas.getContext("2d");
    if (!context) throw Error("Shape canvas is unavailable");
    // A new canvas's state: identity transform, no dash, default styles, every pixel clear.
    context.reset();
    drawShape(canvas, frame);
    slot.key = key; slot.used = this.generation; slot.raster = { canvas, version: new ShapeRasterVersion() };
    return slot.raster;
  }

  get size() { return this.slots.size; }

  clear() {
    for (const slot of this.slots.values()) release(slot.raster.canvas);
    this.slots.clear();
  }
}

/** An output-sized shape canvas and the identity of what it currently holds. */
export type ShapeRaster = { canvas: OffscreenCanvas; version: ShapeRasterVersion };

function release(canvas: OffscreenCanvas) { canvas.width = 1; canvas.height = 1; }
