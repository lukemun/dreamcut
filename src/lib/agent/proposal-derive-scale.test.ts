import assert from "node:assert/strict";
import test from "node:test";

import { deriveProposalTimeline, editorAgentOperationSchema } from "@/lib/agent/timeline-editor-agent-apply";
import type { TimelineFile } from "@/lib/local-store/store";

// A long talk captioned one word at a time has well over a thousand captions. Every card derived on
// top of it (a preview with the caption card selected) must stay quick; checking which captions
// changed once per caption used to cost about five seconds a card here.
test("a card derives quickly on a timeline with a long one-word caption rail", () => {
  const caption = (index: number) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, project_id: "fixture", type: "caption_text", source_url: null,
    lane_key: "captions_0", lane_index: 0, timeline_start: index * 0.4, duration: 0.35, trim_start: 0, trim_end: null, playback_rate: 1, volume: 1,
    removed_at: null, props: { text: `word${index}`, timingMode: "single_word", wordTimings: [{ text: `word${index}`, start: 0, end: 0.35 }] },
  });
  const shapeId = "5a7e8c21-3c1d-4f6e-9a12-0d5c8e7f1b02";
  const timeline = { elements: [
    ...Array.from({ length: 1500 }, (_, index) => caption(index)),
    { id: shapeId, project_id: "fixture", type: "shape", source_url: null, lane_key: "visual_1", lane_index: 1, timeline_start: 0, duration: 5,
      trim_start: 0, trim_end: null, playback_rate: 1, volume: 0, removed_at: null, props: { shape_kind: "rect", shape_width: 0.4, shape_height: 0.4 } },
  ], transitions: [] } as unknown as TimelineFile;
  const op = editorAgentOperationSchema.parse({ element_id: "9b2f4a39-36e0-4f4d-a0c3-7c0d2d3f2a10", create_shape: { timeline_start: 1, duration_seconds: 2,
    lane_key: "visual_2", lane_index: 2, shape_kind: "rect", shape_width: 1.7778, shape_height: 1, shape_fill: "#ffffff", animationIn: "fade", animationInDuration: 0.3 } });
  const started = performance.now();
  const derived = deriveProposalTimeline(timeline, [op] as never, "fixture").timeline;
  const elapsed = performance.now() - started;
  assert.equal(derived.elements.filter((element) => element.type === "caption_text").length, 1500);
  assert.ok(elapsed < 1500, `deriving took ${Math.round(elapsed)}ms`);
});
