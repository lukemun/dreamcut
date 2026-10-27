import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readMetadata, readTimeline, type TimelineFile } from "../local-store/store";
import { readScreenSpace } from "../local-store/screen-space";
import { contourLength, SHAPE_LIMITS, MAX_SHAPE_CONTOURS, MAX_SHAPE_POINTS, type ShapeContour } from "../timeline/shapes";
import { fitContoursToUnitBox, parseSvgPath } from "../timeline/svg-path";
import { timelineRevision } from "./timeline-editor-agent-apply";
import { toolError } from "./tool-error";

/**
 * Split one SVG drawing into native shape pieces: each top-level element of the <svg> (a <g>
 * or a single shape) becomes one path shape on its own lane, placed exactly where it sits in
 * the frame and drawn on in document order. The result is `create_shape` operations for
 * proposal_create; nothing is written. Text becomes `labels` for native text elements.
 */

const svgError = (code: string, message: string) => toolError(code, message, { action: "fix_svg", tool: "svg_pieces_compile" });

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

function parseTransform(raw: string | undefined): Matrix {
  let m = IDENTITY;
  for (const [, name, args] of (raw ?? "").matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number);
    const rad = (deg: number) => deg * Math.PI / 180;
    let next: Matrix = IDENTITY;
    if (name === "matrix" && v.length === 6) next = v as Matrix;
    else if (name === "translate") next = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (name === "scale") next = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (name === "rotate") {
      const [a, cx = 0, cy = 0] = v, c = Math.cos(rad(a ?? 0)), s = Math.sin(rad(a ?? 0));
      next = multiply(multiply([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (name === "skewX") next = [1, 0, Math.tan(rad(v[0] ?? 0)), 1, 0, 0];
    else if (name === "skewY") next = [1, Math.tan(rad(v[0] ?? 0)), 0, 1, 0, 0];
    else throw svgError("INVALID_SVG", `Unsupported transform ${name}().`);
    m = multiply(m, next);
  }
  return m;
}

function applyMatrix(contours: ShapeContour[], m: Matrix): ShapeContour[] {
  const at = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const vec = (h: [number, number] | undefined) => h ? [m[0] * h[0] + m[2] * h[1], m[1] * h[0] + m[3] * h[1]] as [number, number] : undefined;
  return contours.map((contour) => ({
    closed: contour.closed,
    points: contour.points.map((p) => {
      const [x, y] = at(p.x, p.y), handleIn = vec(p.in), handleOut = vec(p.out);
      return { x, y, ...(handleIn ? { in: handleIn } : {}), ...(handleOut ? { out: handleOut } : {}) };
    }),
  }));
}

type Attrs = Record<string, string>;
type Node = { tag: string; attrs: Attrs; children: Node[]; text: string };

/** A strict subset of XML: elements, attributes, text; comments, <defs>, <style> and declarations are skipped. */
function parseSvg(source: string): Node {
  const root: Node = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const clean = source.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  const tokens = clean.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g);
  for (const [, closing, tag, rawAttrs, selfClosing, text] of tokens) {
    const top = stack.at(-1)!;
    if (text !== undefined) { top.text += text; continue; }
    if (closing) {
      if (top.tag !== tag) throw svgError("INVALID_SVG", `Unbalanced SVG: </${tag}> closes <${top.tag}>.`);
      stack.pop();
      continue;
    }
    const attrs: Attrs = {};
    for (const [, key, , dq, sq] of (rawAttrs ?? "").matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[key] = dq ?? sq ?? "";
    // Inline style declarations win over attributes, as in a browser.
    for (const declaration of (attrs.style ?? "").split(";")) {
      const [key, value] = declaration.split(":").map((part) => part?.trim());
      if (key && value) attrs[key] = value;
    }
    const node: Node = { tag, attrs, children: [], text: "" };
    top.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw svgError("INVALID_SVG", `Unclosed <${stack.at(-1)!.tag}>.`);
  const svg = root.children.find((node) => node.tag === "svg");
  if (!svg) throw svgError("INVALID_SVG", "No <svg> element found.");
  return svg;
}

const num = (value: string | undefined, fallback = 0) => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** The element's outline as SVG path data, or null for anything that draws no outline. */
function elementPathD(node: Node): string | null {
  const a = node.attrs;
  switch (node.tag) {
    case "path": return a.d ?? null;
    case "line": return `M ${num(a.x1)} ${num(a.y1)} L ${num(a.x2)} ${num(a.y2)}`;
    case "polyline":
    case "polygon": {
      const v = (a.points ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      if (v.length < 4) return null;
      const pairs = Array.from({ length: Math.floor(v.length / 2) }, (_, i) => `${v[i * 2]} ${v[i * 2 + 1]}`);
      return `M ${pairs.join(" L ")}${node.tag === "polygon" ? " Z" : ""}`;
    }
    case "rect": {
      const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      if (w <= 0 || h <= 0) return null;
      const rx = Math.min(num(a.rx, num(a.ry)), w / 2), ry = Math.min(num(a.ry, rx), h / 2);
      if (rx <= 0) return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      return `M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`
        + ` H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
    }
    case "circle":
    case "ellipse": {
      const cx = num(a.cx), cy = num(a.cy), rx = num(node.tag === "circle" ? a.r : a.rx), ry = num(node.tag === "circle" ? a.r : a.ry);
      if (rx <= 0 || ry <= 0) return null;
      // Starts at the top and runs clockwise, like the native ellipse.
      return `M ${cx} ${cy - ry} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx} ${cy + ry} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx} ${cy - ry} Z`;
    }
    default: return null;
  }
}

type Paint = { stroke: string | null; strokeWidth: number; fill: string | null };
const HEX6 = /^#[0-9a-fA-F]{6}$/, HEX3 = /^#[0-9a-fA-F]{3}$/;
const NAMED: Record<string, string> = { black: "#000000", white: "#ffffff", red: "#ff0000", blue: "#0000ff", green: "#008000", gray: "#808080", grey: "#808080" };
function colour(raw: string | undefined, inherited: string | null): string | null {
  if (raw === undefined || raw === "inherit") return inherited;
  const value = raw.trim().toLowerCase();
  if (value === "none" || value === "transparent") return null;
  if (HEX6.test(value)) return value;
  if (HEX3.test(value)) return `#${value.slice(1).split("").map((c) => c + c).join("")}`;
  return NAMED[value] ?? inherited;
}

type RawPiece = { title: string; contours: ShapeContour[]; paint: Paint };
type Label = { text: string; x: number; y: number; font_size: number; fill: string | null };

const SKIPPED = new Set(["defs", "style", "title", "desc", "metadata", "clipPath", "mask", "linearGradient", "radialGradient", "pattern", "symbol"]);

function collect(node: Node, m: Matrix, paint: Paint, out: { contours: ShapeContour[]; paint: Paint | null; labels: Label[]; skipped: Set<string> }) {
  if (SKIPPED.has(node.tag)) return;
  const matrix = multiply(m, parseTransform(node.attrs.transform));
  const own: Paint = {
    stroke: colour(node.attrs.stroke, paint.stroke),
    strokeWidth: node.attrs["stroke-width"] !== undefined ? num(node.attrs["stroke-width"], paint.strokeWidth) : paint.strokeWidth,
    fill: colour(node.attrs.fill, paint.fill),
  };
  if (node.tag === "text") {
    const text = (node.text + node.children.map((child) => child.text).join(" ")).replace(/\s+/g, " ").trim();
    if (text) {
      const x = num(node.attrs.x), y = num(node.attrs.y);
      out.labels.push({ text, x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5],
        font_size: num(node.attrs["font-size"], 16) * Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])), fill: own.fill });
    }
    return;
  }
  const d = elementPathD(node);
  if (d) {
    let contours: ShapeContour[];
    try { contours = parseSvgPath(d); } catch (error) { throw svgError("INVALID_SVG", `<${node.tag}>: ${error instanceof Error ? error.message : "invalid path data"}`); }
    out.contours.push(...applyMatrix(contours, matrix));
    // Stroke width scales with the element's transform (its geometric mean scale).
    out.paint ??= { ...own, strokeWidth: own.strokeWidth * Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) };
  } else if (node.tag !== "g" && node.tag !== "svg" && node.children.length === 0) out.skipped.add(node.tag);
  for (const child of node.children) collect(child, matrix, own, out);
}

export const svgPiecesInputSchema = z.object({
  svg: z.string().min(1).max(400_000),
  timeline_start: z.number().min(0),
  hold_until: z.number().positive().optional(),
  starts: z.array(z.number().min(0)).max(200).optional(),
  gap_seconds: z.number().min(0).max(10).default(0.15),
  pen_speed: z.number().min(50).max(20000).default(900),
  min_draw_seconds: z.number().min(0.05).max(10).default(0.35),
  max_draw_seconds: z.number().min(0.1).max(30).default(2.5),
  region: z.object({ left: z.number().min(-1).max(2), top: z.number().min(-1).max(2), width: z.number().positive().max(3), height: z.number().positive().max(3) }).strict().optional(),
  /** Share of the region's height kept free under the drawing for its label (label_slot), 0 to 0.4. */
  reserve_label_space: z.number().min(0).max(0.4).default(0),
  stroke: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  stroke_width: z.number().min(0.5).max(200).optional(),
  taper: z.number().min(0).max(1).default(0.55),
  wobble: z.number().min(0).max(1).default(0.3),
  seed: z.number().int().min(0).max(9999).default(1),
  ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeInOut"),
  camera_moves: z.array(z.object({
    start: z.number().min(0),
    duration: z.number().positive().max(60),
    look_at: z.string().min(1).max(240),
    zoom: z.number().min(0.1).max(3).default(1.5),
    ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeInOut"),
  }).strict()).max(20).optional(),
  expected_revision: z.string().optional(),
}).strict();
export type SvgPiecesInput = z.input<typeof svgPiecesInputSchema>;

type Canvas = { width: number; height: number };
type Lanes = { firstLaneNumber: number; firstLaneIndex: number };
const round = (value: number, places = 5) => Number(value.toFixed(places));

/** Compile pieces for a canvas of the given aspect; pure, so tests and callers share it. */
export function compileSvgPieces(raw: SvgPiecesInput, canvas: Canvas, lanes: Lanes) {
  const input = svgPiecesInputSchema.parse(raw);
  const svg = parseSvg(input.svg);
  const view = (svg.attrs.viewBox ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
  const [vx, vy, vw, vh] = view.length === 4 && view.every(Number.isFinite) && view[2] > 0 && view[3] > 0
    ? view : [0, 0, num(svg.attrs.width, canvas.width), num(svg.attrs.height, canvas.height)];
  // The viewBox fits inside the region (whole canvas by default), centred, keeping its proportions.
  const region = input.region ?? { left: 0, top: 0, width: 1, height: 1 };
  // A reserved label band keeps the bottom of the region free, so a label placed below the drawing stays inside it.
  const box = { x: region.left * canvas.width, y: region.top * canvas.height, w: region.width * canvas.width, h: region.height * canvas.height * (1 - input.reserve_label_space) };
  const k = Math.min(box.w / vw, box.h / vh);
  const toCanvas: Matrix = [k, 0, 0, k, box.x + (box.w - vw * k) / 2 - vx * k, box.y + (box.h - vh * k) / 2 - vy * k];
  const base: Paint = { stroke: colour(svg.attrs.stroke, null), strokeWidth: num(svg.attrs["stroke-width"], 1), fill: colour(svg.attrs.fill, "#000000") };
  const rootMatrix = multiply(toCanvas, parseTransform(svg.attrs.transform));

  const pieces: RawPiece[] = [];
  const labels: Label[] = [];
  const skipped = new Set<string>();
  svg.children.forEach((child, index) => {
    const out = { contours: [] as ShapeContour[], paint: null as Paint | null, labels, skipped };
    collect(child, rootMatrix, base, out);
    if (out.contours.length === 0 || !out.paint) return;
    const title = child.attrs["data-piece"] ?? child.attrs["aria-label"] ?? child.attrs.id ?? `Piece ${index + 1}`;
    pieces.push({ title: title.replace(/[-_]+/g, " ").trim().slice(0, 240) || `Piece ${index + 1}`, contours: out.contours, paint: out.paint });
  });
  if (pieces.length === 0) throw svgError("INVALID_SVG", "The SVG draws no outlines. Use path, line, polyline, polygon, rect, circle or ellipse elements.");
  if (input.starts && input.starts.length !== pieces.length) {
    throw svgError("INVALID_SVG_PIECES", `starts has ${input.starts.length} times for ${pieces.length} pieces (${pieces.map((p) => p.title).join(", ")}).`);
  }

  const warnings: string[] = [];
  if (skipped.size) warnings.push(`Skipped elements that draw no outline: ${[...skipped].join(", ")}.`);
  const unit = canvas.height / 1080;
  let cursor = input.timeline_start;
  const timed = pieces.map((piece, index) => {
    const points = piece.contours.reduce((sum, c) => sum + c.points.length, 0);
    if (piece.contours.length > MAX_SHAPE_CONTOURS || points > MAX_SHAPE_POINTS) {
      throw svgError("INVALID_SVG_PIECES", `"${piece.title}" has ${piece.contours.length} contours and ${points} points; a piece holds at most ${MAX_SHAPE_CONTOURS} contours and ${MAX_SHAPE_POINTS} points. Split it into more top-level groups.`);
    }
    const length = piece.contours.reduce((sum, c) => sum + contourLength(c), 0);
    const draw = round(Math.min(input.max_draw_seconds, Math.max(input.min_draw_seconds, length / unit / input.pen_speed)), 3);
    const start = round(input.starts ? input.timeline_start + input.starts[index] : cursor, 3);
    cursor = start + draw + input.gap_seconds;
    return { piece, index, points, length, draw, start };
  });
  const lastDrawEnd = Math.max(...timed.map((t) => t.start + t.draw));
  const end = input.hold_until ?? lastDrawEnd + 2;
  if (end <= lastDrawEnd) warnings.push(`hold_until ${end}s is before the last piece finishes drawing (${round(lastDrawEnd, 2)}s); pieces are kept on screen until they finish.`);

  const cameraId = input.camera_moves?.length ? randomUUID() : null;
  const centers = new Map<string, [number, number]>();
  const bounds: [number, number, number, number][] = [];
  const operations = timed.map(({ piece, index, points, length, draw, start }) => {
    const xs: number[] = [], ys: number[] = [];
    for (const c of piece.contours) for (const p of c.points) {
      xs.push(p.x); ys.push(p.y);
      for (const h of [p.in, p.out]) if (h) { xs.push(p.x + h[0]); ys.push(p.y + h[1]); }
    }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // A straight horizontal or vertical stroke has no extent across; the smallest shape box still
    // draws it flat, because its points sit on the box's centre line.
    const least = SHAPE_LIMITS.shape_width.min * canvas.height * 1.01;
    const w = Math.max(maxX - minX, least), h = Math.max(maxY - minY, least);
    const stroke = input.stroke ?? piece.paint.stroke ?? (piece.paint.fill ? null : "#111111");
    const fill = piece.contours.some((c) => c.closed) ? piece.paint.fill : null;
    const strokeWidth = input.stroke_width ?? round(Math.min(200, Math.max(0.5, piece.paint.strokeWidth / unit)), 2);
    const duration = round(Math.max(end, start + draw) - start, 3);
    centers.set(piece.title, [(minX + maxX) / 2, (minY + maxY) / 2]);
    bounds.push([minX, minY, maxX, maxY]);
    return {
      element_id: randomUUID(),
      create_shape: {
        title: piece.title,
        timeline_start: start,
        duration_seconds: duration,
        lane_key: `visual_${lanes.firstLaneNumber + index}`,
        lane_index: lanes.firstLaneIndex + index,
        shape_kind: "path" as const,
        shape_width: round(w / canvas.height),
        shape_height: round(h / canvas.height),
        // Points in the piece's own box (the same control-point box measured above), so it lands exactly where it was drawn.
        shape_contours: fitContoursToUnitBox(piece.contours).contours,
        shape_fill: fill,
        shape_stroke: stroke,
        shape_stroke_width: strokeWidth,
        shape_taper: input.taper,
        shape_wobble: input.wobble,
        shape_seed: (input.seed + index * 37) % 10000,
        media_offset_x: round(((minX + maxX) / 2 - canvas.width / 2) / (canvas.width / 2)),
        media_offset_y: round(((minY + maxY) / 2 - canvas.height / 2) / (canvas.height / 2)),
        keyframes: { shape_draw: [{ t: 0, v: 0, ease: input.ease }, { t: draw, v: 1 }] },
        ...(cameraId ? { camera_id: cameraId } : {}),
      },
      summary: { title: piece.title, start, draw_seconds: draw, contours: piece.contours.length, points, length_px: Math.round(length) },
    };
  });
  const pieceOps = operations.map(({ summary: _summary, ...op }) => op);
  const camera = cameraId ? cameraOperation(cameraId, input, canvas, centers, {
    start: input.timeline_start,
    duration: round(Math.max(...pieceOps.map((op) => op.create_shape.timeline_start + op.create_shape.duration_seconds)) - input.timeline_start, 3),
    lane: { key: `visual_${lanes.firstLaneNumber + pieceOps.length}`, index: lanes.firstLaneIndex + pieceOps.length },
  }) : null;
  const drawn = { left: Math.min(...bounds.map(b => b[0])), top: Math.min(...bounds.map(b => b[1])), right: Math.max(...bounds.map(b => b[2])), bottom: Math.max(...bounds.map(b => b[3])) };
  // Below the drawing when there is room for a line of text, otherwise above it.
  const roomBelow = canvas.height - drawn.bottom, roomAbove = drawn.top;
  const side = roomBelow >= canvas.height * 0.1 || roomBelow >= roomAbove ? "below" as const : "above" as const;
  return {
    canvas,
    label_slot: {
      place: { relative_to: pieceOps.map((op) => op.element_id), side, gap: 0.02, align: "center" as const },
      // Text as wide as the drawing reads as its caption; maxWidth is a share of the frame width.
      max_width: round(Math.min(1, Math.max(0.25, (drawn.right - drawn.left) / canvas.width)), 3),
      // Its dials, for a label appended after these operations.
      review_controls: LABEL_DIALS.map((field) => ({ operation_index: pieceOps.length + (camera ? 1 : 0), target: "create_text" as const, field })),
    },
    // The camera comes first so the pieces that follow it can name it.
    review_controls: reviewControls(operations.map((op) => op.create_shape), camera ? 1 : 0),
    pieces: operations.map((op) => op.summary),
    ...(camera ? { camera: { element_id: camera.element_id, moves: input.camera_moves } } : {}),
    operations: camera ? [camera, ...pieceOps] : pieceOps,
    labels: labels.map((label) => ({
      text: label.text,
      // Native text places its centre in canvas fractions; SVG anchors text at its baseline start.
      x: round(label.x / canvas.width, 4), y: round(label.y / canvas.height, 4),
      font_size_px: Math.round(label.font_size / unit), fill: label.fill,
    })),
    warnings,
  };
}

type Key = { t: number; v: number; ease?: "linear" | "easeIn" | "easeOut" | "easeInOut" };

/**
 * One camera (timeline/camera.ts) every piece follows: each move eases from the previous view to
 * look at a piece (by title) or the whole drawing at its zoom, then holds.
 */
function cameraOperation(id: string, input: z.output<typeof svgPiecesInputSchema>, canvas: Canvas, centers: Map<string, [number, number]>, clip: { start: number; duration: number; lane: { key: string; index: number } }) {
  const all = [...centers.values()];
  const drawing: [number, number] = [(Math.min(...all.map((c) => c[0])) + Math.max(...all.map((c) => c[0]))) / 2, (Math.min(...all.map((c) => c[1])) + Math.max(...all.map((c) => c[1]))) / 2];
  const track = { x: [{ t: 0, v: 0 }] as Key[], y: [{ t: 0, v: 0 }] as Key[], z: [{ t: 0, v: 1 }] as Key[] };
  let last = 0;
  for (const move of [...(input.camera_moves ?? [])].sort((a, b) => a.start - b.start)) {
    // "frame" is the camera at rest: the plain canvas, everything where it was drawn.
    const target = move.look_at === "frame" ? [canvas.width / 2, canvas.height / 2] as [number, number]
      : move.look_at === "drawing" ? drawing : centers.get(move.look_at.replace(/[-_]+/g, " ").trim());
    if (!target) throw svgError("INVALID_SVG_PIECES", `camera look_at "${move.look_at}" is not a piece (${[...centers.keys()].join(", ")}), "drawing" or "frame".`);
    if (move.start < last - 1e-6) throw svgError("INVALID_SVG_PIECES", `Camera moves overlap at ${move.start}s; start each move after the previous one ends.`);
    const t1 = round(Math.min(clip.duration, move.start + move.duration), 3);
    const view = { x: round((target[0] - canvas.width / 2) / (canvas.width / 2)), y: round((target[1] - canvas.height / 2) / (canvas.height / 2)), z: move.zoom };
    for (const [axis, value] of [["x", view.x], ["y", view.y], ["z", view.z]] as const) {
      const keys = track[axis], held = keys.at(-1)!;
      // Hold the previous view until the move starts, then ease to the new one.
      if (move.start > held.t + 1e-6) keys.push({ t: round(move.start, 3), v: held.v });
      keys.at(-1)!.ease = move.ease;
      keys.push({ t: t1, v: value });
    }
    last = t1;
  }
  return {
    element_id: id,
    create_shape: {
      title: "Camera",
      timeline_start: clip.start,
      duration_seconds: clip.duration,
      lane_key: clip.lane.key,
      lane_index: clip.lane.index,
      shape_kind: "camera" as const,
      shape_width: 1,
      shape_height: 1,
      keyframes: { media_offset_x: track.x, media_offset_y: track.y, media_scale: track.z },
    },
  };
}

const MAX_MAIN_DIALS = 15;
/** Main dials kept free for the drawing's label (size, side, gap; label_slot.review_controls). */
const LABEL_DIALS = ["fontSizePx", "place_side", "place_gap"] as const;
const SHARED_DIALS = ["shape_stroke", "shape_stroke_width", "shape_taper", "shape_wobble"] as const;

/**
 * Main dials for the card: each shared line setting is one dial linked across the pieces that
 * share its value, then each piece's position while the slider budget lasts. Every other
 * setting stays in Advanced adjustments.
 */
function reviewControls(shapes: Record<string, unknown>[], first = 0) {
  const refs: { operation_index: number; target: "create_shape"; field: string; linked_operation_indices?: number[] }[] = [];
  for (const field of SHARED_DIALS) {
    const groups = new Map<unknown, number[]>();
    shapes.forEach((shape, index) => { if (shape[field] != null) groups.set(shape[field], [...(groups.get(shape[field]) ?? []), index]); });
    for (const [lead, ...rest] of groups.values()) refs.push({ operation_index: lead + first, target: "create_shape", field, ...(rest.length ? { linked_operation_indices: rest.map((index) => index + first) } : {}) });
  }
  for (const [index] of shapes.entries()) {
    if (refs.length + 2 > MAX_MAIN_DIALS - LABEL_DIALS.length) break;
    refs.push({ operation_index: index + first, target: "create_shape", field: "media_offset_x" }, { operation_index: index + first, target: "create_shape", field: "media_offset_y" });
  }
  return refs.slice(0, MAX_MAIN_DIALS - LABEL_DIALS.length);
}

type Region = { left: number; top: number; width: number; height: number };

/**
 * Where a drawing goes when the caller names no region: the largest region the shared screen read
 * (readScreenSpace) finds free for the drawing's whole time on screen, clear of the speaker and of every
 * other picture, text and shape. Falls back to the whole frame, with a warning, when nothing is free.
 */
async function openRegionForDrawing(projectId: string, timeline: TimelineFile, start: number, end: number) {
  const space = await readScreenSpace(projectId, timeline, { start_seconds: start, end_seconds: end });
  const best = space.open_regions[0];
  if (!best) return { region: null, note: "Nothing on screen leaves an open region large enough; pass region to place the drawing." };
  const { canvas } = space;
  return { region: { left: best.x / canvas.width, top: best.y / canvas.height, width: best.width / canvas.width, height: best.height / canvas.height } as Region,
    note: space.moments.some(moment => moment.speaker_found) ? null : "No speaker was found while the drawing is on screen; it is placed clear of the other graphics only." };
}

/** Compile against a project: its output shape, its free lanes above every existing visual, its open space, and its current revision. */
export async function compileProjectSvgPieces(projectId: string, raw: unknown) {
  const input = svgPiecesInputSchema.parse(raw);
  const revision = timelineRevision(projectId);
  if (input.expected_revision && input.expected_revision !== revision) {
    throw toolError("STALE_REVISION", "The working cut changed. Refresh before compiling pieces.", { action: "refresh_timeline", tool: "timeline_get", arguments: { project_id: projectId } });
  }
  const [aw, ah] = String(readMetadata(projectId).output_aspect_ratio ?? "16:9").split(":").map(Number);
  const canvas = aw > 0 && ah > 0 ? (aw >= ah ? { width: Math.round(1080 * aw / ah), height: 1080 } : { width: 1080, height: Math.round(1080 * ah / aw) }) : { width: 1920, height: 1080 };
  const visuals = readTimeline(projectId).elements.filter((e) => !e.removed_at && /^visual_\d+$/.test(e.lane_key));
  const firstLaneNumber = Math.max(0, ...visuals.map((e) => Number(e.lane_key.slice(7)))) + 1;
  const firstLaneIndex = Math.max(-1, ...visuals.map((e) => typeof e.lane_index === "number" ? e.lane_index : 0)) + 1;
  // Placement defaults to open space beside the speaker; a drawing over the face is refused at staging anyway.
  const timeline = readTimeline(projectId);
  const span = input.hold_until ?? input.timeline_start + 8;
  const placed = input.region ? { region: input.region, note: null } : await openRegionForDrawing(projectId, timeline, input.timeline_start, span);
  const compiled = compileSvgPieces({ ...input, ...(placed.region ? { region: placed.region } : {}) }, canvas, { firstLaneNumber, firstLaneIndex });
  return {
    ...compiled,
    placement: { region: placed.region ?? { left: 0, top: 0, width: 1, height: 1 }, chosen_by: input.region ? "caller" : placed.region ? "open_space" : "whole_frame" },
    warnings: placed.note ? [...compiled.warnings, placed.note] : compiled.warnings,
    expected_revision: revision,
    // The pieces keep the positions measured from the drawing and the open region; the option says so.
    option_fields: { coordinate_fallback_reason: `Drawing pieces keep their measured positions inside the ${input.region ? "region the caller gave" : placed.region ? "open region open_space_find chose" : "whole frame"} (svg_pieces_compile).` },
    next_steps: [
      "Label the drawing with create_text whose place is label_slot.place (and maxWidth label_slot.max_width); it stays with the drawing when it is tuned or the camera moves. Pass reserve_label_space (about 0.15) to keep room for it inside the open region.",
      "proposal_create with these operations and option_fields copied onto the option (one option, or one option per alternative)",
    ],
    authority: "Compiled operations only; nothing is written. The human reviews and applies.",
  };
}
