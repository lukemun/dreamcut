import assert from "node:assert/strict";
import test from "node:test";
import { edgeAuraAt, edgeAuraMatrices, edgeAuraSchema } from "./edge-aura";
const ring = { model: "rg-edge-distance-v1", keyframes: [{ t: 0, inner: .1, outer: .2, color: "#ff0000" }, { t: 1, inner: .8, outer: .9, color: "#0000ff" }, { t: 2, inner: 0, outer: .2, color: "#0000ff" }] };
const alpha = (q: number, t: number) => {
 const n = Math.round(q * 65535), m = edgeAuraMatrices(ring, t)!;
 const threshold = (a: number[]) => Math.max(0, Math.min(1, a[15]! * (n >> 8) / 255 + a[16]! * (n & 255) / 255 + a[19]!));
 return threshold(m.inner) * threshold(m.outer);
};
test("hollow ring travels to the edge, leaving both its interior and exterior clear", () => {
 assert.equal(alpha(.15, 0), 1); assert.equal(alpha(.5, 0), 0);
 assert.equal(alpha(.15, 1), 0); assert.equal(alpha(.85, 1), 1); assert.equal(alpha(.95, 1), 0);
 assert.equal(alpha(.1, 2), 1); assert.equal(alpha(.85, 2), 0);
 assert.equal(alpha(.5, .5), 1);
});
test("interpolation is continuous, clip boundaries clamp, and color changes interpolate", () => {
 assert.equal(edgeAuraAt(ring, .5)!.color, "#800080");
 assert.deepEqual(edgeAuraAt(ring, -5), ring.keyframes[0]);
 assert.deepEqual(edgeAuraAt(ring, 5), ring.keyframes[2]);
 assert.ok(edgeAuraAt(ring, .51)!.inner > edgeAuraAt(ring, .5)!.inner);
});
test("invalid, inverted and unordered ring definitions fail closed", () => {
 assert.equal(edgeAuraAt(undefined, 0), null);
 assert.equal(edgeAuraSchema.safeParse({ ...ring, keyframes: [{ ...ring.keyframes[0], inner: .3 }] }).success, false);
 assert.equal(edgeAuraSchema.safeParse({ ...ring, keyframes: [...ring.keyframes].reverse() }).success, false);
 assert.equal(edgeAuraSchema.safeParse({ ...ring, keyframes: [{ ...ring.keyframes[0], t: NaN }] }).success, false);
});
test("grayscale fields survive image resampling without RG channel rollover artifacts", () => {
 const gray = { ...ring, model: "gray-edge-distance-v1" };
 const m = edgeAuraMatrices(gray, 1)!;
 const threshold = (a: number[], q: number) => Math.max(0, Math.min(1, a[15]! * q + a[19]!));
 assert.equal(threshold(m.inner, .85) * threshold(m.outer, .85), 1);
 assert.equal(threshold(m.inner, .7), 0);
 assert.equal(threshold(m.outer, .95), 0);
 assert.equal(m.inner[16], 0);
});
test("metric transfer preserves band width at the subject and the canvas edge", () => {
 const metric = { model: "metric-edge-transfer-v1", keyframes: [
  { t: 0, inner: 5/1024, outer: 11/1024, edge_mix: 0, color: "#7b4bc4" },
  { t: 1, inner: (1024-70+5)/1024, outer: (1024-70+11)/1024, edge_mix: 1, color: "#7b4bc4" },
 ] };
 const a = edgeAuraAt(metric, 0)!, b = edgeAuraAt(metric, 1)!;
 assert.equal(a.outer-a.inner, b.outer-b.inner);
 const start = edgeAuraMatrices(metric, 0)!, end = edgeAuraMatrices(metric, 1)!;
 assert.equal(start.inner[15], 512); assert.equal(start.inner[16], 0);
 assert.equal(end.inner[15], 0); assert.equal(end.inner[16], 512);
 assert.equal(edgeAuraAt(metric, .5)!.edge_mix, .5);
});
