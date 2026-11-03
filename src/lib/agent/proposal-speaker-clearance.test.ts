import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { reviewSpeakerClearance } from "./proposal-speaker-clearance";
import type { EditorAgentOption } from "./timeline-editor-agent-apply";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "speaker-clearance-"));

test("a scene with no footage is not checked for a speaker's face", async () => {
  const projectId = "clearance-drawn-only";
  createProject(projectId, "web");
  const rose: TimelineElement = {
    id: "11111111-1111-4111-8111-111111111111", project_id: projectId, type: "shape", source_url: null, beat_id: null, character_id: null,
    props: { shape_kind: "ellipse", shape_width: 0.2, shape_height: 0.2, shape_fill: "#ff0000" },
    lane_key: "visual_1", lane_index: 1, timeline_start: 0, duration: 4, trim_start: 0, trim_end: 0, volume: 0, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null, created_at: "2026-10-27T00:00:00.000Z", updated_at: "2026-10-27T00:00:00.000Z",
  } as TimelineElement;
  writeTimeline(projectId, { elements: [rose], transitions: [] }, "fixture");
  const option = { id: "move", label: "Move", recommended: true, summary: "", operations: [{ element_id: rose.id, props: { media_offset_x: 0.3 } }] } as unknown as EditorAgentOption;
  assert.deepEqual(await reviewSpeakerClearance(projectId, readTimeline(projectId), [option]), []);
});
