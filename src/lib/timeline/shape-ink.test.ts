import assert from "node:assert/strict";
import test from "node:test";

import { inkContourPathD } from "./shape-ink";
import { shapeFrameAt, type ShapeContour } from "./shapes";

const line: ShapeContour = { closed: false, points: [{ x: -200, y: 0 }, { x: 200, y: 0 }] };
const style = { width: 10, taper: 0, wobble: 0, seed: 0, unit: 1 };
const coords = (d: string) => d.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number);
const bounds = (d: string) => {
  const v = coords(d), xs = v.filter((_, i) => i % 2 === 0), ys = v.filter((_, i) => i % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

test("plain ink is a capped line exactly as wide as the outline", () => {
  const b = bounds(inkContourPathD(line, 400, style));
  assert.ok(Math.abs(b.maxY - b.minY - 10) < 0.6, `height ${b.maxY - b.minY}`);
  assert.ok(b.minX < -203 && b.maxX > 203, "round caps extend past the ends");
});

test("draw-on reveals the same stroke from its first point; nothing is drawn at zero", () => {
  assert.equal(inkContourPathD(line, 0, style), "");
  const half = bounds(inkContourPathD(line, 200, { ...style, taper: 0.8, wobble: 0.6, seed: 3 }));
  assert.ok(half.maxX < 10 && half.minX < -195, `half drawn spans ${half.minX}..${half.maxX}`);
});

test("taper thins the ends; wobble drifts the line and is repeatable per seed", () => {
  const tapered = coords(inkContourPathD(line, 400, { ...style, taper: 1 }));
  const nearEnd = tapered.filter((_, i) => i % 2 === 1 && Math.abs(tapered[i - 1] + 195) < 2).map(Math.abs);
  assert.ok(Math.max(...nearEnd) < 3, `end half-width ${Math.max(...nearEnd)}`);
  const a = inkContourPathD(line, 400, { ...style, wobble: 1, seed: 1 });
  assert.equal(a, inkContourPathD(line, 400, { ...style, wobble: 1, seed: 1 }));
  assert.notEqual(a, inkContourPathD(line, 400, { ...style, wobble: 1, seed: 2 }));
  assert.ok(bounds(a).maxY - bounds(a).minY > 12, "wobble moves the line off its path");
});

test("a shape draws ink only when taper or wobble is set and it has an outline", () => {
  const base = { shape_kind: "line", shape_width: 0.4, shape_stroke: "#ffffff", shape_stroke_width: 8 };
  assert.equal(shapeFrameAt(base, 0, 1920, 1080).contours[0].ink, null);
  assert.ok(shapeFrameAt({ ...base, shape_taper: 0.5 }, 0, 1920, 1080).contours[0].ink?.startsWith("M "));
  assert.equal(shapeFrameAt({ ...base, shape_taper: 0.5, shape_stroke: null }, 0, 1920, 1080).contours[0].ink, null);
});

test("cached ink is the same outline whatever order lengths are drawn in, and the cache is bounded", async () => {
  const { clearInkCache, inkCacheSize } = await import("./shape-ink");
  const curve: ShapeContour = { closed: true, points: [{ x: -100, y: 0, out: [0, -60] }, { x: 100, y: 0, in: [0, -60], out: [0, 60] }, { x: -100, y: 10, in: [0, 60] }] };
  const inked = { width: 6, taper: 0.5, wobble: 0.7, seed: 4, unit: 1 };
  const lengths = [5, 120, 37.25, 400, 1e6, 0.5, 120, 260];
  clearInkCache();
  const forward = lengths.map((drawn) => inkContourPathD(curve, drawn, inked, 2));
  clearInkCache();
  const backward = [...lengths].reverse().map((drawn) => inkContourPathD(curve, drawn, inked, 2)).reverse();
  assert.deepEqual(backward, forward);
  // Each length drawn fresh, with nothing cached, gives the same outline.
  for (const [i, drawn] of lengths.entries()) { clearInkCache(); assert.equal(inkContourPathD(curve, drawn, inked, 2), forward[i]); }
  clearInkCache();
  for (let seed = 0; seed < 2100; seed++) inkContourPathD(line, 400, { ...style, seed });
  assert.ok(inkCacheSize().entries <= 2048, `${inkCacheSize().entries} contours kept`);
  clearInkCache();
  assert.deepEqual(inkCacheSize(), { entries: 0, bytes: 0 });
});
