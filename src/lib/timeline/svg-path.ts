import type { ShapeContour, ShapePoint } from "./shapes";

/**
 * Read SVG path data (the `d` of a <path>) into editable shape contours. Every command is
 * supported, absolute and relative: M L H V C S Q T A Z. Quadratics and elliptical arcs become
 * cubic curves, so each point keeps simple in/out handles a person can drag.
 */
export function parseSvgPath(d: string): ShapeContour[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const contours: ShapeContour[] = [];
  let points: ShapePoint[] = [];
  let i = 0, command = "", x = 0, y = 0, startX = 0, startY = 0;
  let lastCubic: [number, number] | null = null, lastQuad: [number, number] | null = null;
  const isCommand = (token: string | undefined) => token !== undefined && /^[A-Za-z]$/.test(token);
  const number = () => {
    const token = tokens[i++];
    const value = Number(token);
    if (token === undefined || isCommand(token) || !Number.isFinite(value)) throw new Error("SVG path data has a missing or invalid number");
    return value;
  };
  const flag = () => {
    // Arc flags may be written without separators ("011"); take one digit at a time.
    const token = tokens[i];
    if (token === undefined) throw new Error("SVG path arc is missing a flag");
    if (token.length > 1 && /^[01]/.test(token)) { tokens[i] = token.slice(1); return token[0] === "1"; }
    i++;
    return token === "1";
  };
  const finish = (closed: boolean) => {
    if (closed && points.length > 2) {
      const first = points[0], last = points.at(-1)!;
      if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) {
        points.pop();
        if (last.in) points[0] = { ...first, in: last.in };
      }
    }
    if (points.length >= 2) contours.push({ closed, points });
    points = [];
  };
  const lineTo = (nx: number, ny: number) => { points.push({ x: nx, y: ny }); x = nx; y = ny; };
  const cubicTo = (c1x: number, c1y: number, c2x: number, c2y: number, nx: number, ny: number) => {
    const prev = points.at(-1);
    if (prev) points[points.length - 1] = { ...prev, out: [c1x - prev.x, c1y - prev.y] };
    points.push({ x: nx, y: ny, in: [c2x - nx, c2y - ny] });
    lastCubic = [c2x, c2y];
    x = nx; y = ny;
  };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) command = tokens[i++];
    else if (!command) throw new Error("SVG path data must start with a command");
    const relative = command === command.toLowerCase(), ox = relative ? x : 0, oy = relative ? y : 0;
    const upper = command.toUpperCase();
    if (upper !== "C" && upper !== "S") lastCubic = null;
    if (upper !== "Q" && upper !== "T") lastQuad = null;
    switch (upper) {
      case "M": {
        if (points.length) finish(false);
        const nx = ox + number(), ny = oy + number();
        points.push({ x: nx, y: ny }); x = startX = nx; y = startY = ny;
        command = relative ? "l" : "L"; // further pairs are lines
        break;
      }
      case "L": lineTo(ox + number(), oy + number()); break;
      case "H": lineTo(ox + number(), y); break;
      case "V": lineTo(x, oy + number()); break;
      case "C": cubicTo(ox + number(), oy + number(), ox + number(), oy + number(), ox + number(), oy + number()); break;
      case "S": {
        const c1x: number = lastCubic ? 2 * x - lastCubic[0] : x, c1y: number = lastCubic ? 2 * y - lastCubic[1] : y;
        cubicTo(c1x, c1y, ox + number(), oy + number(), ox + number(), oy + number());
        break;
      }
      case "Q":
      case "T": {
        const reflected: [number, number] = lastQuad ? [2 * x - lastQuad[0], 2 * y - lastQuad[1]] : [x, y];
        const [qx, qy]: [number, number] = upper === "Q" ? [ox + number(), oy + number()] : reflected;
        const nx = ox + number(), ny = oy + number();
        const sx = x, sy = y;
        cubicTo(sx + 2 / 3 * (qx - sx), sy + 2 / 3 * (qy - sy), nx + 2 / 3 * (qx - nx), ny + 2 / 3 * (qy - ny), nx, ny);
        lastQuad = [qx, qy];
        break;
      }
      case "A": {
        const rx = Math.abs(number()), ry = Math.abs(number()), rotation = number(), large = flag(), sweep = flag();
        const nx = ox + number(), ny = oy + number();
        for (const c of arcToCubics(x, y, rx, ry, rotation, large, sweep, nx, ny)) cubicTo(...c);
        if (rx === 0 || ry === 0) { lineTo(nx, ny); }
        break;
      }
      case "Z":
        finish(true);
        x = startX; y = startY;
        command = ""; // A close command has no implicit numeric continuation.
        break;
      default:
        throw new Error(`SVG path command ${command} is not supported`);
    }
    // Converted quadratics/arcs are cubic geometry, but not SVG C/S commands.
    if (upper !== "C" && upper !== "S") lastCubic = null;
  }
  if (points.length) finish(false);
  return contours;
}

/** Endpoint arc (SVG `A`) as cubic segments of at most 90°. */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, rotationDeg: number, large: boolean, sweep: boolean, x2: number, y2: number) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [];
  const phi = rotationDeg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * rx * y1p / ry, cyp = -coef * ry * x1p / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segments, k = 4 / 3 * Math.tan(step / 4);
  const point = (t: number) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const derivative = (t: number) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: [number, number, number, number, number, number][] = [];
  for (let s = 0; s < segments; s++) {
    const a = theta + s * step, b = a + step;
    const [ax, ay] = point(a), [bx, by] = point(b), [dax, day] = derivative(a), [dbx, dby] = derivative(b);
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  return out;
}

/** Fit contours into the shape's unit box (-0.5 to 0.5); returns them with the source aspect ratio. */
export function fitContoursToUnitBox(contours: ShapeContour[]): { contours: ShapeContour[]; aspect: number } {
  const fitted = fitContourSetsToUnitBox([contours]);
  return { contours: fitted.sets[0], aspect: fitted.aspect };
}

/**
 * Fit several outlines into the unit box with one shared bounding box, so outlines drawn in the
 * same coordinates (the keys of a morph) keep their sizes and positions relative to each other.
 */
export function fitContourSetsToUnitBox(sets: ShapeContour[][]): { sets: ShapeContour[][]; aspect: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const contours of sets) for (const contour of contours) for (const p of contour.points) {
    xs.push(p.x); ys.push(p.y);
    for (const handle of [p.in, p.out]) if (handle) { xs.push(p.x + handle[0]); ys.push(p.y + handle[1]); }
  }
  if (xs.length === 0) return { sets: sets.map(() => []), aspect: 1 };
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1e-9), h = Math.max(maxY - minY, 1e-9);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const fit = (value: number) => Number(value.toFixed(5));
  return {
    aspect: w / h,
    sets: sets.map((contours) => contours.map((contour) => ({
      closed: contour.closed,
      points: contour.points.map((p) => ({
        x: fit((p.x - cx) / w), y: fit((p.y - cy) / h),
        ...(p.in ? { in: [fit(p.in[0] / w), fit(p.in[1] / h)] as [number, number] } : {}),
        ...(p.out ? { out: [fit(p.out[0] / w), fit(p.out[1] / h)] as [number, number] } : {}),
      })),
    }))),
  };
}

/** True when two outlines have the same contours, point counts and open/closed flags, so one can morph into the other. */
export function sameShapeStructure(a: ShapeContour[], b: ShapeContour[]) {
  return a.length === b.length && a.every((contour, i) => contour.closed === b[i].closed && contour.points.length === b[i].points.length);
}
