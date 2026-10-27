import assert from "node:assert/strict";
import test from "node:test";
import { reviewMarkPill, timelineSelectionPill } from "./timeline-chat-selection";
import type { FrameTag } from "@/lib/review/frame-tag-types";
import type { TimelineElement } from "./types";

const element = (overrides: Partial<TimelineElement>) => ({ id: "el-1", type: "video_clip", lane_key: "visual_0", timeline_start: 1.25, duration: 2.5, source_url: "/media/cat.mp4", props: {}, beat_id: null, ...overrides }) as TimelineElement;

test("a selected clip becomes a readable pill and an exact agent reference", () => {
  const pill = timelineSelectionPill(element({ props: { title: "Six cats" } }), "Visual 1", []);
  assert.deepEqual([pill.id, pill.kind, pill.label], ["timeline:el-1", "Clip", "Six cats 1.3s–3.8s"]);
  assert.match(pill.agentText, /video_clip element el-1 "Six cats" on lane Visual 1 \(visual_0\), 1\.250s–3\.750s/);
});

test("captions are named by their words, shortened for the pill only", () => {
  const words = "This caption is long enough that the pill should shorten it";
  const pill = timelineSelectionPill(element({ type: "caption_text", lane_key: "captions_0", props: { text: words } }), "Captions", []);
  assert.equal(pill.kind, "Text");
  assert.ok(pill.label.startsWith("This caption is long enough…"));
  assert.ok(pill.agentText.includes(words));
});

test("a review mark becomes a pill carrying its time, points and note for the agent", () => {
  const tag = { id: "m1", label: "Mark 1", timeline_seconds: 3.24, frame_number: 97, timeline_revision: 4, active_element_ids: ["el-1"],
    anchor: {}, points: [{ x: 0.5, y: 0.25 }], note: "Too dark here", created_at: "2026-10-09T00:00:00Z" } as unknown as FrameTag;
  const pill = reviewMarkPill(tag);
  assert.deepEqual([pill.id, pill.kind, pill.label], ["mark:m1", "Mark", "3.2s Too dark here"]);
  assert.match(pill.agentText, /Review mark m1 "Mark 1" at 3\.240s \(frame 97\), point \(0\.500, 0\.250\), over elements el-1\. Note: Too dark here\./);
});
