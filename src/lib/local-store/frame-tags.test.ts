import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { addFrameTag, clearFrameTags, readFrameTags, removeFrameTag } from "@/lib/local-store/frame-tags";
import { createProject, writeTimeline } from "@/lib/local-store/store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "frame-tags-"));
process.env.TIMELINE_PROJECTS_DIR = root;

function element(): TimelineElement {
  const now = "2026-07-20T00:00:00.000Z";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    project_id: "marks",
    type: "video_clip",
    source_url: "/media/take.mp4",
    props: {},
    beat_id: null,
    character_id: null,
    timeline_start: 5,
    duration: 10,
    lane_key: "visual_0",
    lane_index: 0,
    trim_start: 2,
    trim_end: null,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: now,
    updated_at: now,
  };
}

test("frame marks persist anchors, deduplicate one frame, remove, and clear", () => {
  createProject("marks", "web");
  writeTimeline("marks", { elements: [element()], transitions: [] }, "fixture");

  const first = addFrameTag("marks", 7, [element().id]);
  assert.equal(first.created, true);
  assert.equal(first.tag.label, "M1");
  assert.equal(first.tag.anchor.element_local_seconds, 2);
  assert.equal(first.tag.anchor.source_seconds, 4);
  assert.deepEqual(first.tag.active_element_ids, [element().id]);

  const pointUpdate = addFrameTag("marks", 7.01, [], { x: 0.8, y: 0.35 });
  assert.equal(pointUpdate.created, false);
  assert.equal(pointUpdate.updated, true);
  assert.deepEqual(pointUpdate.tag.points, [{ x: 0.8, y: 0.35 }]);
  assert.deepEqual(readFrameTags("marks").tags[0]?.points, [{ x: 0.8, y: 0.35 }]);

  const secondPoint = addFrameTag("marks", 7.01, [], { x: 0.76, y: 0.98 });
  assert.equal(secondPoint.created, false);
  assert.equal(secondPoint.updated, true);
  assert.deepEqual(secondPoint.tag.points, [
    { x: 0.8, y: 0.35 },
    { x: 0.76, y: 0.98 },
  ]);

  const duplicate = addFrameTag("marks", 7.01);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.updated, false);
  assert.equal(readFrameTags("marks").tags.length, 1);

  const second = addFrameTag("marks", 9);
  assert.equal(second.tag.label, "M2");
  assert.equal(readFrameTags("marks").tags.length, 2);

  removeFrameTag("marks", first.tag.id);
  const compacted = readFrameTags("marks");
  assert.deepEqual(compacted.tags.map((tag) => tag.label), ["M1"]);
  assert.equal(compacted.tags[0]?.id, second.tag.id);
  assert.equal(addFrameTag("marks", 11).tag.label, "M2");

  clearFrameTags("marks");
  assert.equal(readFrameTags("marks").tags.length, 0);
  assert.equal(addFrameTag("marks", 10).tag.label, "M1");
});

 test("adjacent frames are distinct even across floating point and subframe boundaries", () => {
  createProject("adjacent-marks", "web");
  const first = addFrameTag("adjacent-marks", 3.6);
  const second = addFrameTag("adjacent-marks", 3.6 + 1 / 30);
  assert.equal(first.created, true);
  assert.equal(second.created, true);
  assert.equal(second.tag.frame_number, 109);
  assert.equal(addFrameTag("adjacent-marks", 3.62).created, false);
  assert.equal(addFrameTag("adjacent-marks", 3.64).created, false);
  assert.equal(addFrameTag("adjacent-marks", 3.6 - 1 / 30).created, true);
});
