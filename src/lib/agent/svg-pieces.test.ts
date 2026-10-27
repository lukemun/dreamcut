import assert from "node:assert/strict";
import test from "node:test";

import { compileSvgPieces } from "./svg-pieces";
import { editorAgentOperationSchema, editorAgentOptionSchema } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { resolveShapeProps, shapeContours } from "../timeline/shapes";

const canvas = { width: 1920, height: 1080 };
const lanes = { firstLaneNumber: 3, firstLaneIndex: 2 };
const SKETCH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" fill="none" stroke="#222222" stroke-width="6">
  <!-- skyline -->
  <g id="skyline"><rect x="200" y="400" width="200" height="500"/><polyline points="500,900 500,300 650,300 650,900"/></g>
  <circle data-piece="red-dot" cx="960" cy="540" r="40" stroke="#e4572e" style="fill:#e4572e"/>
  <g transform="translate(1400 200) scale(2)"><line x1="0" y1="0" x2="100" y2="0"/></g>
  <text x="900" y="1000" font-size="48" fill="#222">Now watch</text>
</svg>`;

test("each top-level element becomes one path shape, valid as a proposal operation", () => {
  const result = compileSvgPieces({ svg: SKETCH, timeline_start: 2 }, canvas, lanes);
  assert.deepEqual(result.pieces.map((p) => p.title), ["skyline", "red dot", "Piece 3"]);
  for (const op of result.operations) editorAgentOperationSchema.parse(op);
  const widths = result.review_controls.filter((ref) => ref.field === "shape_stroke_width");
  assert.deepEqual(widths.map((ref) => [ref.operation_index, ...(ref.linked_operation_indices ?? [])]), [[0, 1], [2]], "one width dial per shared width");
  assert.equal(result.review_controls.filter((ref) => ref.field === "shape_stroke").length, 2, "one colour dial per ink");
  assert.ok(result.review_controls.length <= 15);
  assert.deepEqual(result.operations.map((op) => op.create_shape.lane_key), ["visual_3", "visual_4", "visual_5"]);
  assert.equal(result.operations[1].create_shape.shape_fill, "#e4572e");
  assert.equal(result.operations[0].create_shape.shape_fill, null);
  assert.deepEqual(result.labels, [{ text: "Now watch", x: 0.4688, y: 0.9259, font_size_px: 48, fill: "#222222" }]);
});

test("a piece lands exactly where it was drawn", () => {
  const dot = compileSvgPieces({ svg: SKETCH, timeline_start: 0 }, canvas, lanes).operations[1].create_shape;
  const props = resolveShapeProps(dot);
  const [contour] = shapeContours(props, props.shape_width * canvas.height, props.shape_height * canvas.height);
  const cx = canvas.width / 2 + dot.media_offset_x * canvas.width / 2, cy = canvas.height / 2 + dot.media_offset_y * canvas.height / 2;
  assert.ok(Math.abs(contour.points[0].x + cx - 960) < 0.5 && Math.abs(contour.points[0].y + cy - 500) < 0.5, "first point at the top of the circle");
});

test("pieces draw in order at pen speed; transforms scale geometry and stroke", () => {
  const result = compileSvgPieces({ svg: SKETCH, timeline_start: 1, gap_seconds: 0.2 }, canvas, lanes);
  const [a, b, c] = result.pieces;
  assert.equal(a.start, 1);
  assert.ok(Math.abs(b.start - (a.start + a.draw_seconds + 0.2)) < 1e-3);
  assert.equal(c.length_px, 200);
  assert.equal(result.operations[2].create_shape.shape_stroke_width, 12);
  const ends = result.operations.map((op) => op.create_shape.timeline_start + op.create_shape.duration_seconds);
  assert.ok(ends.every((end) => Math.abs(end - ends[0]) < 1e-3), "every piece holds to the same end");
  assert.deepEqual(result.operations[0].create_shape.keyframes.shape_draw.map((k) => k.v), [0, 1]);
});

test("explicit starts override the stagger and must match the piece count", () => {
  const result = compileSvgPieces({ svg: SKETCH, timeline_start: 10, starts: [0, 2.5, 4] }, canvas, lanes);
  assert.deepEqual(result.pieces.map((p) => p.start), [10, 12.5, 14]);
  assert.throws(() => compileSvgPieces({ svg: SKETCH, timeline_start: 0, starts: [0] }, canvas, lanes), /3 pieces/);
});

test("a viewBox fits inside the region keeping its proportions", () => {
  const svg = `<svg viewBox="0 0 100 100"><line x1="0" y1="50" x2="100" y2="50" stroke="#000"/></svg>`;
  const line = compileSvgPieces({ svg, timeline_start: 0, region: { left: 0, top: 0.5, width: 1, height: 0.5 } }, { width: 1080, height: 1920 }, lanes).operations[0].create_shape;
  assert.ok(Math.abs(line.shape_width * 1920 - 960) < 1, `width ${line.shape_width * 1920}`);
  assert.ok(Math.abs(line.media_offset_y - 0.5) < 1e-3, `centred in the lower half: ${line.media_offset_y}`);
});

test("bad SVG fails with a reason", () => {
  assert.throws(() => compileSvgPieces({ svg: "<svg><g></svg>", timeline_start: 0 }, canvas, lanes), /closes <g>/);
  assert.throws(() => compileSvgPieces({ svg: "<svg><text>hi</text></svg>", timeline_start: 0 }, canvas, lanes), /draws no outlines/);
});

test("the linked dials stage on a card and one colour change recolours every piece that shares it", () => {
  const result = compileSvgPieces({ svg: SKETCH, timeline_start: 0 }, canvas, lanes);
  const option = editorAgentOptionSchema.parse({ id: "sketch", label: "Sketch", recommended: true, summary: "A sketch draws on.", operations: result.operations, review_controls: result.review_controls });
  assert.deepEqual(option.dropped_review_controls ?? [], []);
  const ink = result.review_controls.find((ref) => ref.field === "shape_stroke" && ref.linked_operation_indices)!;
  const tuned = applyProposalNumericOverrides(option, [{ operation_index: ink.operation_index, target: "create_shape", field: "shape_stroke", value: "#3366ff" }]);
  assert.deepEqual(tuned.operations.map((op) => op.create_shape?.shape_stroke), ["#3366ff", "#e4572e", "#3366ff"]);
});

test("camera moves add one camera first that every piece follows", () => {
  const result = compileSvgPieces({ svg: SKETCH, timeline_start: 1, camera_moves: [{ start: 1, duration: 1.5, look_at: "red-dot", zoom: 2 }, { start: 3, duration: 1, look_at: "drawing", zoom: 1 }] }, canvas, lanes);
  const [camera, ...pieces] = result.operations;
  for (const op of result.operations) editorAgentOperationSchema.parse(op);
  assert.equal(camera.create_shape.shape_kind, "camera");
  assert.ok(pieces.every((op) => op.create_shape.camera_id === camera.element_id));
  const keys = camera.create_shape.keyframes as { media_scale: { t: number; v: number }[]; media_offset_x: { t: number; v: number }[] };
  assert.deepEqual(keys.media_scale.map((k) => [k.t, k.v]), [[0, 1], [1, 1], [2.5, 2], [3, 2], [4, 1]]);
  assert.equal(keys.media_offset_x[2].v, 0, "looks at the red dot, centred across");
  assert.ok(result.review_controls.every((ref) => ref.operation_index >= 1), "dials point past the camera");
  assert.throws(() => compileSvgPieces({ svg: SKETCH, timeline_start: 0, camera_moves: [{ start: 0, duration: 1, look_at: "moon" }] }, canvas, lanes), /not a piece/);
  const back = compileSvgPieces({ svg: SKETCH, timeline_start: 0, camera_moves: [{ start: 0, duration: 1, look_at: "skyline", zoom: 2 }, { start: 2, duration: 1, look_at: "frame", zoom: 1 }] }, canvas, lanes);
  const backKeys = back.operations[0].create_shape.keyframes as { media_offset_x: { v: number }[]; media_scale: { v: number }[] };
  assert.deepEqual([backKeys.media_offset_x.at(-1)!.v, backKeys.media_scale.at(-1)!.v], [0, 1], "frame returns to the plain view");
});
