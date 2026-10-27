import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";

// A throwaway project with no footage, so no face detector is needed.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-screen-space-"));
process.env.TIMELINE_PROJECTS_DIR = root;
fs.mkdirSync(path.join(root, "space"), { recursive: true });
fs.writeFileSync(path.join(root, "space", "metadata.json"), JSON.stringify({ title: "Space", output_aspect_ratio: "16:9", delivery_target: "web" }));

const base = { project_id: "space", trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, removed_at: null, source_url: null, lane_index: 0 };
const box = { ...base, id: "box", type: "shape", lane_key: "visual_1", timeline_start: 0, duration: 4,
  props: { shape_kind: "rect", shape_width: 0.3, shape_height: 0.3, shape_fill: "#ffffff", media_offset_x: -0.5 } } as unknown as TimelineElement;
const label = { ...base, id: "label", type: "caption_text", lane_key: "captions_0", timeline_start: 2, duration: 2,
  props: { text: "Hello", absX: 0.75, absY: 0.2, maxWidth: 0.2, fontSizePx: 60, animationIn: "none", animationOut: "none" } } as unknown as TimelineElement;
const camera = { ...base, id: "cam", type: "shape", lane_key: "visual_9", timeline_start: 0, duration: 4,
  props: { shape_kind: "camera", keyframes: { media_offset_x: [{ t: 0, v: 0 }, { t: 4, v: -0.6 }] } } } as unknown as TimelineElement;
const timeline = (elements: TimelineElement[]) => ({ schema_version: 1, elements, transitions: [] }) as never;
const inside = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) =>
  inner.x < outer.x + outer.width && inner.x + inner.width > outer.x && inner.y < outer.y + outer.height && inner.y + inner.height > outer.y;

test("one read reports every graphic on screen and the regions free of all of them", async () => {
  const { readScreenSpace } = await import("./screen-space");
  const moment = await readScreenSpace("space", timeline([box, label]), { start_seconds: 1 });
  assert.deepEqual(moment.occupied.map(o => o.element_id), ["box"], "the label is not on screen yet at 1 s");
  const span = await readScreenSpace("space", timeline([box, label]), { start_seconds: 0, end_seconds: 4 });
  assert.deepEqual(span.occupied.map(o => o.element_id).sort(), ["box", "label"]);
  assert.ok(span.open_regions.length > 0);
  for (const region of span.open_regions) for (const o of span.occupied) assert.ok(!inside(region, o), `${o.element_id} intrudes on an open region`);
  const replacing = await readScreenSpace("space", timeline([box, label]), { start_seconds: 0, end_seconds: 4, exclude_element_ids: ["label"] });
  assert.deepEqual(replacing.occupied.map(o => o.element_id), ["box"], "the element being replaced does not block itself");
});

test("a graphic carried by a camera occupies everywhere it travels across the span", async () => {
  const { readScreenSpace } = await import("./screen-space");
  const follower = { ...box, props: { ...box.props, media_offset_x: 0, camera_id: "cam" } } as unknown as TimelineElement;
  const start = await readScreenSpace("space", timeline([follower, camera]), { start_seconds: 0 });
  const span = await readScreenSpace("space", timeline([follower, camera]), { start_seconds: 0, end_seconds: 4 });
  const [atStart] = start.occupied, [overSpan] = span.occupied;
  assert.ok(overSpan!.width > atStart!.width, "the span box covers the camera's whole move");
  assert.ok(span.moments.length >= 2 && span.moments.every(m => !m.speaker_found));
});
