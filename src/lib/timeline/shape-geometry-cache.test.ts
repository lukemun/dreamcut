import assert from "node:assert/strict";
import test from "node:test";

import { createShapeGeometryCache, shapeBoundsAt } from "./shapes";

const strokes = Array.from({ length: 40 }, (_, i) => ({
  closed: i % 3 === 0,
  points: [
    { x: -0.4 + i * 0.01, y: -0.3, out: [0.05, 0.1] },
    { x: 0.1, y: 0.2 - i * 0.01, in: [-0.05, 0], out: [0.02, 0.03] },
    { x: 0.35, y: 0.4 - i * 0.005, in: [0.01, -0.02] },
  ],
}));
const handDrawn = {
  shape_kind: "path", shape_width: 0.6, shape_height: 0.5, shape_fill: null, shape_stroke: "#ffffff", shape_stroke_width: 6,
  shape_taper: 0.5, shape_wobble: 0.3, shape_contours: strokes,
  keyframes: {
    shape_draw: [{ t: 0, v: 0 }, { t: 2, v: 1 }],
    media_rotation: [{ t: 0, v: -20 }, { t: 2, v: 15 }],
    media_scale: [{ t: 0, v: 0.5 }, { t: 2, v: 1.2 }],
  },
};
const morphing = {
  shape_kind: "path", shape_width: 0.3, shape_height: 0.3, shape_fill: "#ff0000",
  shape_contours: [{ closed: true, points: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0, y: 0.5 }] }],
  keyframes: { shape_contours: [{ t: 0, v: [-0.5, -0.5, 0, 0, 0, 0, 0.5, -0.5, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0] },
    { t: 1, v: [-1, -1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] }] },
};
const presets = [
  { shape_kind: "rect", shape_corner_radius: 0.2, shape_fill: "#00ff00", media_offset_x: 0.3 },
  { shape_kind: "ellipse", shape_fill: null, shape_stroke: "#ffffff", shape_stroke_width: 10, keyframes: { shape_draw: [{ t: 0, v: 0 }, { t: 1, v: 1 }] } },
  { shape_kind: "star", shape_sides: 7, shape_fill: "#0000ff", media_rotation: 33 },
  { shape_kind: "camera" },
];
const times = [0, 0.001, 0.25, 0.5, 0.999, 1, 1.5, 2, 3];

test("cached shape bounds equal uncached bounds at every time, for every kind", () => {
  const cache = createShapeGeometryCache();
  for (const props of [handDrawn, morphing, ...presets]) {
    for (const [width, height] of [[1080, 1920], [1920, 1080]]) {
      for (const t of times) {
        const plain = shapeBoundsAt(props, t, width, height);
        assert.deepEqual(shapeBoundsAt(props, t, width, height, cache), plain, `${props.shape_kind} at ${t}s on ${width}x${height}`);
        assert.deepEqual(shapeBoundsAt(props, t, width, height, cache), plain, `${props.shape_kind} at ${t}s, second cached read`);
      }
    }
  }
});

test("a shape whose props change is measured again, not read from the cache", () => {
  const cache = createShapeGeometryCache();
  const before = shapeBoundsAt(handDrawn, 1, 1080, 1920, cache);
  const wider = { ...handDrawn, shape_width: 1.2 };
  const moved = { ...handDrawn, shape_contours: strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p, x: p.x + 0.2 })) })) };
  const filled = { ...handDrawn, shape_fill: "#123456", keyframes: { shape_draw: [{ t: 0, v: 0 }, { t: 2, v: 0 }] } };
  for (const changed of [wider, moved]) {
    const fresh = shapeBoundsAt(changed, 1, 1080, 1920);
    assert.deepEqual(shapeBoundsAt(changed, 1, 1080, 1920, cache), fresh);
    assert.notDeepEqual(fresh, before);
  }
  assert.deepEqual(shapeBoundsAt(handDrawn, 1, 1080, 1920, cache), before, "the original props still read their own geometry");
  const invisible = { ...handDrawn, keyframes: { shape_draw: [{ t: 0, v: 0 }, { t: 2, v: 0 }] } };
  assert.equal(shapeBoundsAt(invisible, 1, 1080, 1920, cache), null, "an unfilled outline that has not drawn is still invisible");
  assert.deepEqual(shapeBoundsAt(filled, 1, 1080, 1920, cache), shapeBoundsAt(filled, 1, 1080, 1920), "filling it makes it visible again");
  assert.notEqual(shapeBoundsAt(filled, 1, 1080, 1920, cache), null);
});
