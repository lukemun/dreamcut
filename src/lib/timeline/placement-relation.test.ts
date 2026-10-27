import assert from "node:assert/strict";
import test from "node:test";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { elementRectAt } from "@/lib/media-analysis/visual-overlap";
import { placementRelation, reconcilePlacementRelations, relationOverlap, relationRectAt } from "./placement-relation";

const canvas = { width: 1920, height: 1080 };
const base = { project_id: "p", source_url: null, timeline_start: 0, duration: 8, trim_start: 0, trim_end: 0, volume: 0, playback_rate: 1, removed_at: null } as const;
const shape = (id: string, props: Record<string, unknown> = {}, lane = 1): TimelineElement => ({ ...base, id, type: "shape", lane_key: `visual_${lane}`, lane_index: lane,
  props: { shape_kind: "rect", shape_width: 0.3, shape_height: 0.2, shape_fill: "#ffffff", media_offset_x: 0.5, media_offset_y: -0.2, ...props } } as unknown as TimelineElement);
const label = (place: Record<string, unknown> | null, props: Record<string, unknown> = {}): TimelineElement => ({ ...base, id: "label", type: "caption_text", lane_key: "captions_1", lane_index: 1, timeline_start: 5, duration: 3,
  props: { text: "1000 tasks", fontSizePx: 64, maxWidth: 0.15, textAlign: "center", fontPreset: "caveat", styleVariant: "none", animationIn: "fade", singleLine: true, ...(place ? { place } : {}), ...props } } as unknown as TimelineElement);
const camera = (keyframes: Record<string, unknown>): TimelineElement => ({ ...base, id: "cam", type: "shape", lane_key: "visual_9", lane_index: 9,
  props: { shape_kind: "camera", shape_width: 1, shape_height: 1, keyframes } } as unknown as TimelineElement);
const near = (actual: number, expected: number, tolerance = 0.5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);

test("a label placed below a drawing sits under its box, centred, one gap down", () => {
  const elements = [shape("sky"), label({ relative_to: ["sky"], side: "below", gap: 0.02, align: "center" })];
  assert.deepEqual(reconcilePlacementRelations([], elements, canvas), ["label"]);
  const sky = relationRectAt(elements[0]!, 6, elements, canvas)!, text = relationRectAt(elements[1]!, 6, elements, canvas)!;
  near(text.y, sky.y + sky.height + 0.02 * 1080);
  near(text.x + text.width / 2, sky.x + sky.width / 2);
  assert.equal(elements[1]!.props?.positionPreset, undefined);
});

test("the group's combined box anchors the label and every side resolves against it", () => {
  for (const side of ["above", "left", "right"] as const) {
    // Each side needs room on the frame: the group sits right of centre, or left of it for "right".
    const offsets = side === "right" ? [-0.7, -0.3] : [0.3, 0.7];
    const group = [shape("a", { media_offset_x: offsets[0] }), shape("b", { media_offset_x: offsets[1] }, 2)];
    const elements = [...group, label({ relative_to: ["a", "b"], side, gap: 0.03, align: "start" })];
    reconcilePlacementRelations([], elements, canvas);
    const a = relationRectAt(group[0]!, 6, elements, canvas)!, b = relationRectAt(group[1]!, 6, elements, canvas)!;
    const text = relationRectAt(elements[2]!, 6, elements, canvas)!;
    if (side === "above") { near(text.y + text.height, a.y - 0.03 * 1080); near(text.x, a.x); }
    if (side === "left") { near(text.x + text.width, a.x - 0.03 * 1080); near(text.y, a.y); }
    if (side === "right") { near(text.x, b.x + b.width + 0.03 * 1080); near(text.y, a.y); }
  }
});

test("the label follows when its anchor moves or is resized, and keeps its relation", () => {
  const before = [shape("sky"), label({ relative_to: "sky", side: "below", gap: 0.02, align: "center" })];
  reconcilePlacementRelations([], before, canvas);
  const after = structuredClone(before);
  after[0]!.props = { ...after[0]!.props, media_offset_x: -0.4, shape_height: 0.3 };
  assert.deepEqual(reconcilePlacementRelations(before, after, canvas), ["label"]);
  const sky = relationRectAt(after[0]!, 6, after, canvas)!, text = relationRectAt(after[1]!, 6, after, canvas)!;
  near(text.y, sky.y + sky.height + 0.02 * 1080);
  near(text.x + text.width / 2, sky.x + sky.width / 2);
  assert.ok(placementRelation(after[1]!));
});

test("tuning the gap or side re-resolves the label", () => {
  const before = [shape("sky"), label({ relative_to: "sky", side: "below", gap: 0.02, align: "center" })];
  reconcilePlacementRelations([], before, canvas);
  const after = structuredClone(before);
  after[1]!.props = { ...after[1]!.props, place: { relative_to: "sky", side: "above", gap: 0.05, align: "center" } };
  assert.deepEqual(reconcilePlacementRelations(before, after, canvas), ["label"]);
  const sky = relationRectAt(after[0]!, 6, after, canvas)!, text = relationRectAt(after[1]!, 6, after, canvas)!;
  near(text.y + text.height, sky.y - 0.05 * 1080);
});

test("a label moved on its own keeps its new spot and leaves the relation", () => {
  const before = [shape("sky"), label({ relative_to: "sky", side: "below", gap: 0.02, align: "center" })];
  reconcilePlacementRelations([], before, canvas);
  const after = structuredClone(before);
  after[1]!.props = { ...after[1]!.props, absX: 0.1, absY: 0.1 };
  assert.deepEqual(reconcilePlacementRelations(before, after, canvas), ["label"]);
  assert.equal(after[1]!.props?.absX, 0.1);
  assert.equal(placementRelation(after[1]!), null);
});

test("a label whose anchor is removed stays where it is without the relation", () => {
  const before = [shape("sky"), label({ relative_to: "sky", side: "below", gap: 0.02, align: "center" })];
  reconcilePlacementRelations([], before, canvas);
  const after = structuredClone(before);
  after[0]!.removed_at = "2026-10-24T00:00:00.000Z";
  reconcilePlacementRelations(before, after, canvas);
  assert.equal(after[1]!.props?.absY, before[1]!.props?.absY);
  assert.equal(placementRelation(after[1]!), null);
});

test("a placed shape takes media offsets and stays clear of a drawing that draws on", () => {
  const underline = { ...shape("line", { shape_height: 0.01, media_offset_x: 0, media_offset_y: 0, place: { relative_to: "sky", side: "below", gap: 0.01, align: "start" } }, 3) };
  const elements = [shape("sky", { keyframes: { shape_draw: [{ t: 0, v: 0 }, { t: 2, v: 1 }] } }), underline];
  reconcilePlacementRelations([], elements, canvas);
  const sky = relationRectAt(elements[0]!, 0.1, elements, canvas)!, line = relationRectAt(elements[1]!, 0.1, elements, canvas)!;
  near(line.y, sky.y + sky.height + 0.01 * 1080);
  near(line.x, sky.x);
});

test("the label is seen through its anchor's camera, so a push-in moves them together", () => {
  const cam = camera({ media_scale: [{ t: 0, v: 1 }, { t: 8, v: 2 }], media_offset_x: [{ t: 0, v: 0 }, { t: 8, v: 0.5 }] });
  const elements = [cam, shape("sky", { camera_id: "cam" }), label({ relative_to: "sky", side: "below", gap: 0.02, align: "center" }, { animationIn: "none" })];
  reconcilePlacementRelations([], elements, canvas);
  assert.equal(elements[2]!.props?.camera_id, "cam");
  for (const at of [5, 7.5]) {
    const sky = elementRectAt(elements[1]!, at, elements, canvas)!, text = elementRectAt(elements[2]!, at, elements, canvas);
    if (!text) continue; // clipped by the frame at full zoom
    assert.ok(text.y >= sky.y + sky.height - 0.5, `at ${at}s the label (${text.y}) is under the drawing (${sky.y + sky.height})`);
    near(text.x + text.width / 2, sky.x + sky.width / 2, 2);
  }
});

test("a label pushed back onto its anchor by the frame edge is reported", () => {
  const elements = [shape("sky", { media_offset_y: 0.85 }), label({ relative_to: "sky", side: "below", gap: 0.02, align: "center" })];
  reconcilePlacementRelations([], elements, canvas);
  const overlap = relationOverlap(elements[1]!, elements, canvas);
  assert.ok(overlap && overlap.share > 0.05);
  const clear = [shape("sky"), label({ relative_to: "sky", side: "below", gap: 0.02, align: "center" })];
  reconcilePlacementRelations([], clear, canvas);
  assert.equal(relationOverlap(clear[1]!, clear, canvas)?.share, 0);
});

test("relations that loop are refused", () => {
  const a = { ...shape("a", { place: { relative_to: "b", side: "below" } }) };
  const b = { ...shape("b", { place: { relative_to: "a", side: "above" } }, 2) };
  assert.throws(() => reconcilePlacementRelations([], [a, b], canvas), /loop/);
});

test("inside with a vertical alignment pins the label to a corner of its anchor", () => {
  for (const [align, vertical] of [["start", "start"], ["end", "end"]] as const) {
    const elements = [shape("sky", { media_offset_x: 0, media_offset_y: 0 }), label({ relative_to: "sky", side: "inside", gap: 0.02, align, vertical_align: vertical })];
    reconcilePlacementRelations([], elements, canvas);
    const sky = relationRectAt(elements[0]!, 6, elements, canvas)!, text = relationRectAt(elements[1]!, 6, elements, canvas)!;
    if (align === "start") { near(text.x, sky.x + 0.02 * 1080); near(text.y, sky.y + 0.02 * 1080); }
    else { near(text.x + text.width, sky.x + sky.width - 0.02 * 1080); near(text.y + text.height, sky.y + sky.height - 0.02 * 1080); }
    assert.equal(placementRelation(elements[1]!)?.vertical_align, vertical);
  }
});

test("a label reaches the top of a tall frame whose text area is a wide clip's band", () => {
  // Three wide clips stacked in a 9:16 frame: text coordinates are shares of the 16:9 band in the
  // middle, so the top row's corner lies well past the manual -0.5..1.5 range.
  const tall = { width: 1080, height: 1920 };
  const row = (id: string, offsetY: number, lane: number): TimelineElement => ({ ...base, id, type: "video_clip", source_url: `/media/${id}.mp4`, lane_key: `visual_${lane}`, lane_index: lane,
    props: { source_width: 1920, source_height: 1080, media_scale: 1.054, media_offset_y: offsetY } } as unknown as TimelineElement);
  const elements = [row("top", -0.667, 1), row("middle", 0, 2), row("bottom", 0.667, 3),
    label({ relative_to: "top", side: "inside", gap: 0.02, align: "start", vertical_align: "start" }, { maxWidth: 0.5 })];
  reconcilePlacementRelations([], elements, tall);
  const top = relationRectAt(elements[0]!, 6, elements, tall)!, text = relationRectAt(elements[3]!, 6, elements, tall)!;
  near(text.y, top.y + 0.02 * 1920, 2);
  assert.ok((elements[3]!.props?.absY as number) < -0.5, "the stored position goes past the manual range");
});

test("a clip known only by its verified preview size still anchors a label to its own row", () => {
  // Imported clips may carry no probed source size; their preview proxy has the same shape.
  const tall = { width: 1080, height: 1920 };
  const row = (id: string, offsetY: number, lane: number): TimelineElement => ({ ...base, id, type: "video_clip", source_url: `/media/${id}.mp4`, lane_key: `visual_${lane}`, lane_index: lane,
    props: { preview_proxy_validation: { ok: true, width: 960, height: 540 }, media_scale: 1.054, media_offset_y: offsetY } } as unknown as TimelineElement);
  const rows = [row("top", -0.667, 1), row("middle", 0, 2), row("bottom", 0.667, 3)];
  for (const anchor of rows) {
    const elements = [...rows, label({ relative_to: anchor.id, side: "inside", gap: 0.02, align: "start", vertical_align: "start" }, { maxWidth: 0.5 })];
    reconcilePlacementRelations([], elements, tall);
    const box = relationRectAt(anchor, 6, elements, tall)!, text = relationRectAt(elements[3]!, 6, elements, tall)!;
    near(box.height, 640, 2);
    near(text.y, box.y + 0.02 * 1920, 2);
  }
});

test("a graded picture's film finish does not hide its box from the labels that belong to it", () => {
  const tall = { width: 1080, height: 1920 };
  const graded: TimelineElement = { ...base, id: "graded", type: "video_clip", source_url: "/media/graded.mp4", lane_key: "visual_1", lane_index: 1,
    props: { preview_proxy_validation: { ok: true, width: 960, height: 540 }, media_scale: 1.054, media_offset_y: -0.667, film_bloom: 0.3, film_halation: 0.5, film_vignette: 0.25 } } as unknown as TimelineElement;
  const elements = [graded, label({ relative_to: "graded", side: "inside", gap: 0.02, align: "start", vertical_align: "start" }, { maxWidth: 0.5 })];
  reconcilePlacementRelations([], elements, tall);
  const text = relationRectAt(elements[1]!, 6, elements, tall)!;
  near(text.y, 0.02 * 1920, 2);
  near(text.x, 0.02 * 1920, 2);
});
